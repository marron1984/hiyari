/**
 * 空室問い合わせ 紹介元（ref）別メトリクス集計
 *
 * Ticket 074: 紹介元（ref）別のSLA/成約率をWBRに統合
 *
 * - metaJson.ref または tags の "ref:XXX" から紹介元を抽出
 * - 週次メトリクスを集計し、WBRで上位refを表示
 */

import { listTickets } from '@/lib/tickets/repo';
import type { Ticket, ViewerContext, VacancyInquiryStage } from '@/lib/tickets/types';

// ========== 型定義 ==========

/**
 * 紹介元別メトリクス
 */
export interface RefMetric {
  ref: string;                    // 紹介元コード
  name?: string;                  // 紹介元表示名（metaJson.refNameから）
  inquiries: number;              // 問い合わせ件数
  slaOk: number;                  // SLA遵守件数
  slaBreach: number;              // SLA超過件数
  contacted: number;              // 連絡済み
  tour: number;                   // 見学予定
  applied: number;                // 申込み
  accepted: number;               // 成約
  rejected: number;               // 不成約
  conversionRate: number;         // 成約率（%）
  slaComplianceRate: number;      // SLA遵守率（%）
}

/**
 * 紹介元メトリクス集計結果
 */
export interface RefMetricsResult {
  topByInquiries: RefMetric[];    // 問い合わせ数上位5ref
  topByConversion: RefMetric[];   // 成約率上位3ref（母数>=3）
  notes: string[];                // 注目ポイント・コメント
  weekStart: string;              // 週の開始日
  weekEnd: string;                // 週の終了日
}

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
 *
 * 優先順位:
 * 1. metaJson.ref
 * 2. tags の "ref:XXX" 形式
 */
function extractRef(ticket: Ticket): string | null {
  // metaJson.ref を優先
  if (ticket.metaJson?.ref) {
    return ticket.metaJson.ref;
  }

  // tags から "ref:XXX" を探す
  if (ticket.tagsJson) {
    for (const tag of ticket.tagsJson) {
      if (tag.startsWith('ref:')) {
        return tag.slice(4); // "ref:" を除去
      }
    }
  }

  return null;
}

/**
 * チケットから紹介元の表示名を取得
 */
function extractRefName(ticket: Ticket): string | undefined {
  return ticket.metaJson?.refName;
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
 * SLA遵守判定（newステージから抜けた、または期限内）
 */
function isSlaCompliant(ticket: Ticket): boolean {
  // newステージ以外は遵守とみなす（初動完了）
  if (ticket.stage !== 'new') return true;
  // newステージで期限内なら遵守
  if (ticket.slaDueAt && new Date(ticket.slaDueAt) >= new Date()) return true;
  return false;
}

/**
 * ステージがファネルのどの段階かを判定
 */
function isStageAtOrAfter(
  stage: VacancyInquiryStage | null,
  targetStages: VacancyInquiryStage[]
): boolean {
  if (!stage) return false;
  return targetStages.includes(stage);
}

// ========== メイン集計関数 ==========

/**
 * 紹介元別メトリクスを集計
 *
 * @param viewer - ビューアーコンテキスト（RBAC用）
 * @param options - オプション
 * @returns RefMetricsResult
 */
export function buildVacancyInquiryRefMetrics(
  viewer: ViewerContext,
  options?: {
    businessUnitId?: string | null;
    weekOffset?: number;  // 何週間前のデータを取得するか（0=今週）
    minInquiriesForConversion?: number;  // 成約率計算の最小件数
  }
): RefMetricsResult {
  const {
    businessUnitId,
    weekOffset = 0,
    minInquiriesForConversion = 3,
  } = options ?? {};

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
    name?: string;
    tickets: Ticket[];
  }>();

  // "direct" を ref なしのデフォルトとして使用
  const DEFAULT_REF = 'direct';

  for (const ticket of weekTickets) {
    const ref = extractRef(ticket) ?? DEFAULT_REF;
    const refName = extractRefName(ticket);

    if (!refMap.has(ref)) {
      refMap.set(ref, { ref, name: refName, tickets: [] });
    }

    const entry = refMap.get(ref)!;
    entry.tickets.push(ticket);

    // refName が設定されていれば更新
    if (refName && !entry.name) {
      entry.name = refName;
    }
  }

  // RefMetric に変換
  const metrics: RefMetric[] = [];

  for (const [ref, { name, tickets }] of refMap.entries()) {
    let slaOk = 0;
    let slaBreach = 0;
    let contacted = 0;
    let tour = 0;
    let applied = 0;
    let accepted = 0;
    let rejected = 0;

    for (const ticket of tickets) {
      // SLA判定
      if (isSlaBreached(ticket)) {
        slaBreach++;
      } else if (isSlaCompliant(ticket)) {
        slaOk++;
      }

      // ステージ別カウント（到達したステージをカウント）
      const stage = ticket.stage;
      if (isStageAtOrAfter(stage, ['contacted', 'tour_scheduled', 'applied', 'accepted', 'rejected', 'closed'])) {
        contacted++;
      }
      if (isStageAtOrAfter(stage, ['tour_scheduled', 'applied', 'accepted', 'rejected', 'closed'])) {
        tour++;
      }
      if (isStageAtOrAfter(stage, ['applied', 'accepted', 'rejected', 'closed'])) {
        applied++;
      }
      if (stage === 'accepted') {
        accepted++;
      }
      if (stage === 'rejected') {
        rejected++;
      }
    }

    // 成約率計算（成約 / (成約 + 不成約)）
    const concluded = accepted + rejected;
    const conversionRate = concluded > 0
      ? Math.round((accepted / concluded) * 100)
      : 0;

    // SLA遵守率計算
    const slaTested = slaOk + slaBreach;
    const slaComplianceRate = slaTested > 0
      ? Math.round((slaOk / slaTested) * 100)
      : 100;

    metrics.push({
      ref,
      name,
      inquiries: tickets.length,
      slaOk,
      slaBreach,
      contacted,
      tour,
      applied,
      accepted,
      rejected,
      conversionRate,
      slaComplianceRate,
    });
  }

  // 問い合わせ数上位5ref
  const topByInquiries = [...metrics]
    .sort((a, b) => b.inquiries - a.inquiries)
    .slice(0, 5);

  // 成約率上位3ref（母数が minInquiriesForConversion 以上のもの）
  const topByConversion = [...metrics]
    .filter((m) => m.inquiries >= minInquiriesForConversion)
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, 3);

  // 注目ポイント生成
  const notes: string[] = [];

  // 成約率が高い ref
  const highConversionRefs = topByConversion.filter((m) => m.conversionRate >= 50);
  if (highConversionRefs.length > 0) {
    const refNames = highConversionRefs
      .map((m) => m.name || m.ref)
      .join('、');
    notes.push(`成約率50%超: ${refNames}からの問い合わせが高品質`);
  }

  // SLA超過が多い ref
  const slaProblemRefs = metrics.filter((m) => m.slaBreach > 0 && m.slaComplianceRate < 80);
  if (slaProblemRefs.length > 0) {
    const refNames = slaProblemRefs
      .map((m) => m.name || m.ref)
      .slice(0, 2)
      .join('、');
    notes.push(`SLA改善要: ${refNames}からの問い合わせ対応が遅延`);
  }

  // 問い合わせ数が急増した ref（今週のみでは判断不可なのでスキップ）
  // TODO: 前週比較を実装する場合はここで追加

  // direct からの流入が多い場合
  const directMetric = metrics.find((m) => m.ref === DEFAULT_REF);
  if (directMetric && directMetric.inquiries > 0) {
    const directRatio = Math.round((directMetric.inquiries / weekTickets.length) * 100);
    if (directRatio > 50) {
      notes.push(`直接流入${directRatio}%: 紹介元タグ付けを推奨`);
    }
  }

  return {
    topByInquiries,
    topByConversion,
    notes,
    weekStart: formatDate(weekStart),
    weekEnd: formatDate(weekEnd),
  };
}

/**
 * 特定の紹介元のメトリクスを取得
 */
export function getRefMetric(
  ref: string,
  viewer: ViewerContext,
  options?: { businessUnitId?: string | null }
): RefMetric | null {
  const result = buildVacancyInquiryRefMetrics(viewer, options);
  const allMetrics = [...result.topByInquiries, ...result.topByConversion];
  return allMetrics.find((m) => m.ref === ref) ?? null;
}

/**
 * 紹介元コードのリストを取得
 */
export function listRefCodes(viewer: ViewerContext): string[] {
  const result = buildVacancyInquiryRefMetrics(viewer);
  return [...new Set([
    ...result.topByInquiries.map((m) => m.ref),
    ...result.topByConversion.map((m) => m.ref),
  ])];
}
