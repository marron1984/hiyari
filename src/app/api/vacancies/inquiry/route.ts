/**
 * 空室問い合わせAPI
 *
 * Ticket 070: 空室 外部提示システム
 * Ticket 072: CTA最適化（フォーム簡略化・冪等性強化）
 *
 * POST /api/vacancies/inquiry - 問い合わせ送信 → チケット自動作成
 *
 * - フォーム: 連絡先、希望条件
 * - tickets を自動作成 (relatedType: vacancy_inquiry)
 * - businessUnitId を付与
 * - 057の自動割当を適用（createTicket内蔵）
 * - 通知を担当者へ（036統合）
 * - 冪等性: relatedId で二重送信防止
 * - Ticket 072: vacancyUnitId を冪等キーに含める
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getByIdAsync, seedIfEmptyAsync } from '@/lib/vacancyUnits/repo';
import { createTicket, listTickets } from '@/lib/tickets/repo';
import { createAsync as createNotificationAsync } from '@/lib/notifications/index';
import { CARE_LEVEL_LABELS } from '@/lib/vacancyUnits/types';
import type { ViewerContext } from '@/lib/tickets/types';

// Ticket 072: 拡張リクエスト型
// Ticket 074: ref（紹介元）パラメータ追加
interface VacancyInquiryRequestV2 {
  vacancyUnitId?: string;
  businessUnitId?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  desiredMoveIn?: string;
  careLevel?: number;
  hasSpecialNeeds?: boolean;
  specialNeedsDetail?: string;
  conditions?: string; // Ticket 072: 希望条件（選択式）
  message?: string;
  ref?: string;        // Ticket 074: 紹介元コード
  refName?: string;    // Ticket 074: 紹介元表示名
}

/**
 * 冪等性キー生成
 * Ticket 072: vacancyUnitId を含める
 * vacancy_inquiry:YYYY-MM-DD:contactHash:businessUnitId:vacancyUnitId
 */
function generateIdempotencyKey(
  contactPhone: string | undefined,
  contactEmail: string | undefined,
  businessUnitId: string | undefined,
  vacancyUnitId?: string | undefined
): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const contactKey = contactEmail || contactPhone || 'unknown';
  const hash = createHash('sha256').update(contactKey).digest('hex').slice(0, 12);
  const buId = businessUnitId || 'general';
  const unitId = vacancyUnitId || 'any';
  return `vacancy_inquiry:${today}:${hash}:${buId}:${unitId}`;
}

/**
 * 既存チケットチェック（冪等性）
 */
function findExistingInquiry(relatedId: string): boolean {
  // システムユーザーとして全チケット検索
  const viewer: ViewerContext = {
    userId: 'system',
    role: 'admin',
  };

  const { items } = listTickets(
    { limit: 1000 }, // 最近のチケットを検索
    viewer
  );

  // relatedType + relatedId で重複チェック
  return items.some(
    t => t.relatedType === 'vacancy_inquiry' && t.relatedId === relatedId
  );
}

export async function POST(request: NextRequest) {
  try {
    // シードデータ確認
    await seedIfEmptyAsync();

    const body = await request.json() as VacancyInquiryRequestV2;

    const {
      vacancyUnitId,
      businessUnitId,
      contactName,
      contactPhone,
      contactEmail,
      desiredMoveIn,
      careLevel,
      hasSpecialNeeds,
      specialNeedsDetail,
      conditions,  // Ticket 072: 希望条件
      message,
      ref,         // Ticket 074: 紹介元
      refName,     // Ticket 074: 紹介元表示名
    } = body;

    // バリデーション - Ticket 072: 名前は任意に
    if (!contactPhone && !contactEmail) {
      return NextResponse.json(
        { error: '電話番号またはメールアドレスのいずれかは必須です' },
        { status: 400 }
      );
    }

    // 空室ユニットから事業単位IDを取得
    let targetBusinessUnitId = businessUnitId;
    let buildingName: string | undefined;

    if (vacancyUnitId) {
      const unit = await getByIdAsync(vacancyUnitId);
      if (unit) {
        targetBusinessUnitId = unit.businessUnitId;
        buildingName = unit.buildingName;
      }
    }

    // Ticket 072: 冪等性チェック（vacancyUnitIdを含む）
    const idempotencyKey = generateIdempotencyKey(
      contactPhone,
      contactEmail,
      targetBusinessUnitId,
      vacancyUnitId
    );

    if (findExistingInquiry(idempotencyKey)) {
      // 既存のチケットがある場合は成功として返す（二重送信防止）
      return NextResponse.json({
        success: true,
        ticketId: null,
        message: 'お問い合わせは既に受け付けております。担当者より連絡いたします。',
        deduplicated: true,
      }, { status: 200 });
    }

    // チケット説明文を構築 - Ticket 072: 名前は任意に
    const descriptionParts: string[] = [
      '【空室問い合わせ】',
      '',
    ];

    if (contactName) {
      descriptionParts.push(`お名前: ${contactName}`);
    }
    if (contactPhone) {
      descriptionParts.push(`電話: ${contactPhone}`);
    }
    if (contactEmail) {
      descriptionParts.push(`メール: ${contactEmail}`);
    }

    descriptionParts.push('');

    if (buildingName) {
      descriptionParts.push(`希望施設: ${buildingName}`);
    }
    if (vacancyUnitId) {
      descriptionParts.push(`施設ID: ${vacancyUnitId}`);
    }
    if (desiredMoveIn) {
      descriptionParts.push(`入居希望時期: ${desiredMoveIn}`);
    }
    // Ticket 072: 希望条件（選択式）
    if (conditions) {
      descriptionParts.push(`希望・状況: ${conditions}`);
    }
    if (careLevel !== undefined) {
      descriptionParts.push(`介護度: ${CARE_LEVEL_LABELS[careLevel] ?? `要介護${careLevel}`}`);
    }
    if (hasSpecialNeeds) {
      descriptionParts.push(`特別な対応: あり`);
      if (specialNeedsDetail) {
        descriptionParts.push(`詳細: ${specialNeedsDetail}`);
      }
    }

    if (message) {
      descriptionParts.push('');
      descriptionParts.push('【ご要望・ご質問】');
      descriptionParts.push(message);
    }

    const description = descriptionParts.join('\n');

    // タイトル生成 - Ticket 072: 名前がない場合は連絡先を使用
    const displayName = contactName || contactPhone || contactEmail || '匿名';
    const titleSuffix = buildingName ? ` (${buildingName})` : '';

    // Ticket 074: メタデータ構築（ref、vacancyUnitId）
    const ticketMeta: Record<string, unknown> = {};
    if (ref) {
      ticketMeta.ref = ref;
    }
    if (refName) {
      ticketMeta.refName = refName;
    }
    if (vacancyUnitId) {
      ticketMeta.vacancyUnitId = vacancyUnitId;
    }

    // タグ構築（refがある場合はタグにも追加）
    const tags = ['空室問い合わせ', '新規'];
    if (ref) {
      tags.push(`ref:${ref}`);
    }

    // チケット作成（外部からの問い合わせなのでシステムユーザーとして作成）
    // autoAssign は createTicket 内で自動適用（057統合済み）
    const ticket = createTicket(
      {
        title: `空室問い合わせ: ${displayName}様${titleSuffix}`,
        description,
        priority: 'normal',
        category: 'client',
        businessUnitId: targetBusinessUnitId,
        relatedType: 'vacancy_inquiry',
        relatedId: idempotencyKey, // 冪等性キーをrelatedIdとして使用
        tags,
        meta: Object.keys(ticketMeta).length > 0 ? ticketMeta : undefined,  // Ticket 074
      },
      'system' // システムユーザーとして作成
    );

    // 担当者への通知（036統合）- Ticket 072: displayName を使用
    if (ticket.assigneeUserId) {
      try {
        await createNotificationAsync({
          tenantId: 'default', // TODO: マルチテナント対応時に適切な値を設定
          userId: ticket.assigneeUserId,
          type: 'system',
          title: '空室問い合わせが割り当てられました',
          message: `${displayName}様${buildingName ? `（${buildingName}希望）` : ''}からの問い合わせが割り当てられました。`,
          severity: 'info',
          url: `/dashboard/tickets/${ticket.id}`,
          fingerprint: `vacancy_inquiry:${ticket.id}`,
        });
      } catch (notifyError) {
        // 通知失敗してもチケット作成は成功とする
        console.error('Failed to send notification:', notifyError);
      }
    }

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      message: 'お問い合わせを受け付けました。担当者より連絡いたします。',
    }, { status: 201 });
  } catch (error) {
    console.error('vacancy inquiry POST error:', error);
    return NextResponse.json(
      { error: '問い合わせの送信に失敗しました' },
      { status: 500 }
    );
  }
}
