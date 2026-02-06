/**
 * 空室問い合わせ 紹介元（ref）別ファネル集計
 *
 * Ticket 074: 紹介元ref別ファネル（SLA/成約率）をWBRへ追加
 *
 * - tickets から vacancy_inquiry を ref 別に集計
 * - ファネル段階（contacted → tours → applied → accepted）を追跡
 * - SLA遵守率と成約率を計算
 * - ref名は ref_sources から解決
 */

import { listTickets } from '@/lib/tickets/repo';
import { getRefSourceByRef } from '@/lib/refSources/repo';
import type { Ticket, ViewerContext, VacancyInquiryStage } from '@/lib/tickets/types';

// ========== 型定義 ==========

/**
 * 紹介元別ファネル行
 */
export interface RefFunnelRow {
  ref: string;
  refName: string;
  inquiries: number;
  contacted: number;
  tours: number;
  applied: number;
  accepted: number;
  slaBreaches: number;
  contactRate: number;    // contacted / inquiries (0-1)
  acceptRate: number;     // accepted / inquiries (0-1)
  slaOkRate: number;      // 1 - (slaBreaches / inquiries) (0-1)
}

/**
 * ファネル集計結果
 */
export interface RefFunnelResult {
  rows: RefFunnelRow[];
  weekStart: string;
  weekEnd: string;
  totalInquiries: number;
}

// ========== 定数 ==========

const DEFAULT_REF = 'direct';
const DEFAULT_REF_NAME = '直問い合わせ';

// ========== ユーティリティ ==========

/**
 * 週の範囲を取得
 */
function getWeekRange(date: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
}

/**
 * 日付をYYYY-MM-DD形式にフォーマット
 */
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * チケットから紹介元（ref）を抽出
 */
function extractRef(ticket: Ticket): string {
  // metaJson.ref を優先
  if (ticket.metaJson?.ref) {
    return ticket.metaJson.ref;
  }

  // tags から "ref:XXX" を探す
  if (ticket.tagsJson) {
    for (const tag of ticket.tagsJson) {
      if (tag.startsWith('ref:')) {
        return tag.slice(4);
      }
    }
  }

  return DEFAULT_REF;
}

/**
 * ref名を解決
 *
 * 1. ref_sources に存在すれば name を返す
 * 2. metaJson.refName があればそれを返す
 * 3. direct なら "直問い合わせ"
 * 4. それ以外は ref コードそのまま
 */
function resolveRefName(ref: string, ticket?: Ticket): string {
  // ref_sources から名前を取得
  const refSource = getRefSourceByRef(ref);
  if (refSource) {
    return refSource.name;
  }

  // metaJson.refName
  if (ticket?.metaJson?.refName) {
    return ticket.metaJson.refName;
  }

  // direct
  if (ref === DEFAULT_REF) {
    return DEFAULT_REF_NAME;
  }

  return ref;
}

/**
 * SLA超過判定（newステージでslaDueAtを過ぎている）
 */
function isSlaBreached(ticket: Ticket): boolean {
  if (!ticket.slaDueAt) return false;
  if (ticket.stage !== 'new') return false;
  return new Date(ticket.slaDueAt) < new Date();
}

/**
 * ステージが指定した段階以上かチェック
 */
const STAGE_ORDER: VacancyInquiryStage[] = [
  'new',
  'contacted',
  'tour_scheduled',
  'applied',
  'accepted',
  'rejected',
  'closed',
];

function hasReachedStage(
  currentStage: VacancyInquiryStage | null,
  targetStage: VacancyInquiryStage
): boolean {
  if (!currentStage) return false;

  // accepted/rejected は特殊扱い（並列ステージ）
  if (targetStage === 'accepted') return currentStage === 'accepted';
  if (targetStage === 'rejected') return currentStage === 'rejected';

  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const targetIndex = STAGE_ORDER.indexOf(targetStage);

  if (currentIndex === -1 || targetIndex === -1) return false;

  // closed は rejected 扱い
  if (currentStage === 'closed') {
    return targetIndex <= STAGE_ORDER.indexOf('rejected');
  }

  return currentIndex >= targetIndex;
}

// ========== メイン集計関数 ==========

/**
 * 紹介元別ファネルを構築
 */
export function buildVacancyRefFunnel(
  viewer: ViewerContext,
  options?: {
    businessUnitId?: string | null;
    weekOffset?: number;
  }
): RefFunnelResult {
  const { businessUnitId, weekOffset = 0 } = options ?? {};

  // 対象週を計算
  const now = new Date();
  now.setDate(now.getDate() - weekOffset * 7);
  const { start: weekStart, end: weekEnd } = getWeekRange(now);

  // 空室問い合わせチケットを取得
  const { items: allTickets } = listTickets(
    {
      relatedType: 'vacancy_inquiry',
      pipeline: 'vacancy_inquiry',
      businessUnitId,
      limit: 10000,
    },
    viewer
  );

  // 今週作成されたチケットをフィルタ
  const weekTickets = allTickets.filter((t) => {
    const createdAt = new Date(t.createdAt);
    return createdAt >= weekStart && createdAt <= weekEnd;
  });

  // refごとに集計
  const refMap = new Map<string, {
    ref: string;
    refName: string;
    tickets: Ticket[];
  }>();

  for (const ticket of weekTickets) {
    const ref = extractRef(ticket);

    if (!refMap.has(ref)) {
      refMap.set(ref, {
        ref,
        refName: resolveRefName(ref, ticket),
        tickets: [],
      });
    }

    refMap.get(ref)!.tickets.push(ticket);
  }

  // RefFunnelRow に変換
  const rows: RefFunnelRow[] = [];

  for (const [ref, { refName, tickets }] of refMap.entries()) {
    let contacted = 0;
    let tours = 0;
    let applied = 0;
    let accepted = 0;
    let slaBreaches = 0;

    for (const ticket of tickets) {
      const stage = ticket.stage;

      // SLA判定
      if (isSlaBreached(ticket)) {
        slaBreaches++;
      }

      // ファネル段階カウント
      if (hasReachedStage(stage, 'contacted')) {
        contacted++;
      }
      if (hasReachedStage(stage, 'tour_scheduled')) {
        tours++;
      }
      if (hasReachedStage(stage, 'applied')) {
        applied++;
      }
      if (stage === 'accepted') {
        accepted++;
      }
    }

    const inquiries = tickets.length;

    // 率計算（0除算防止）
    const contactRate = inquiries > 0 ? contacted / inquiries : 0;
    const acceptRate = inquiries > 0 ? accepted / inquiries : 0;
    const slaOkRate = inquiries > 0 ? 1 - slaBreaches / inquiries : 1;

    rows.push({
      ref,
      refName,
      inquiries,
      contacted,
      tours,
      applied,
      accepted,
      slaBreaches,
      contactRate,
      acceptRate,
      slaOkRate,
    });
  }

  // 問い合わせ数降順でソート
  rows.sort((a, b) => b.inquiries - a.inquiries);

  return {
    rows,
    weekStart: formatDate(weekStart),
    weekEnd: formatDate(weekEnd),
    totalInquiries: weekTickets.length,
  };
}

/**
 * WBR用サマリーを生成
 */
export function buildVacancyRefFunnelSummary(
  viewer: ViewerContext,
  options?: {
    businessUnitId?: string | null;
    weekOffset?: number;
  }
): {
  topRefs: RefFunnelRow[];
  highlights: string[];
  totalInquiries: number;
} {
  const result = buildVacancyRefFunnel(viewer, options);

  // 上位5 ref
  const topRefs = result.rows.slice(0, 5);

  // ハイライト生成
  const highlights: string[] = [];

  // 成約率が高い ref（母数3件以上、成約率30%超）
  const highAcceptRefs = result.rows
    .filter((r) => r.inquiries >= 3 && r.acceptRate >= 0.3)
    .slice(0, 2);

  if (highAcceptRefs.length > 0) {
    const names = highAcceptRefs.map((r) => r.refName).join('、');
    highlights.push(`高成約率: ${names}`);
  }

  // SLA問題 ref（SLA遵守率80%未満）
  const slaProblemRefs = result.rows
    .filter((r) => r.inquiries >= 2 && r.slaOkRate < 0.8)
    .slice(0, 2);

  if (slaProblemRefs.length > 0) {
    const names = slaProblemRefs.map((r) => r.refName).join('、');
    highlights.push(`SLA改善要: ${names}`);
  }

  // 直流入が多い場合
  const directRow = result.rows.find((r) => r.ref === DEFAULT_REF);
  if (directRow && result.totalInquiries > 0) {
    const directRatio = directRow.inquiries / result.totalInquiries;
    if (directRatio > 0.5) {
      highlights.push(`直流入${Math.round(directRatio * 100)}%: ref活用推奨`);
    }
  }

  return {
    topRefs,
    highlights,
    totalInquiries: result.totalInquiries,
  };
}
