/**
 * 空室問い合わせ確認API
 *
 * Ticket 076: 空室問い合わせの軽量本人確認
 * Ticket 077: 迷惑フィルタ（IPレートリミット）
 *
 * POST /api/vacancies/verify - トークン検証 → チケット作成
 *
 * フロー:
 * 1. IPスパムチェック
 * 2. トークンを検証
 * 3. verified に更新
 * 4. tickets を作成（従来の処理をここで実行）
 * 5. 通知送信
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, markAsVerified } from '@/lib/vacancyInquiryPending/repo';
import { createTicket, listTickets } from '@/lib/tickets/repo';
import { createAsync as createNotificationAsync } from '@/lib/notifications/index';
import { CARE_LEVEL_LABELS } from '@/lib/vacancyUnits/types';
import type { ViewerContext } from '@/lib/tickets/types';
import { checkSpamForVerify } from '@/lib/spam/check';

/**
 * 冪等性キー生成
 */
function generateIdempotencyKey(pendingId: string): string {
  return `vacancy_inquiry:pending:${pendingId}`;
}

/**
 * 既存チケットチェック（冪等性）
 */
function findExistingTicket(relatedId: string): boolean {
  const viewer: ViewerContext = {
    userId: 'system',
    role: 'admin',
  };

  const { items } = listTickets({ limit: 1000 }, viewer);

  return items.some(
    (t) => t.relatedType === 'vacancy_inquiry' && t.relatedId === relatedId
  );
}

export async function POST(request: NextRequest) {
  try {
    // クライアント情報取得
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor?.split(',')[0]?.trim();
    const userAgent = request.headers.get('user-agent') ?? undefined;

    // Ticket 077: IPスパムチェック
    const spamResult = checkSpamForVerify({
      ip: clientIp,
      userAgent,
      path: '/api/vacancies/verify',
    });

    if (!spamResult.ok) {
      const statusCode = spamResult.action === 'throttle' ? 429 : 403;
      return NextResponse.json(
        { error: spamResult.reason || '確認できません' },
        { status: statusCode }
      );
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: '確認トークンが必要です' },
        { status: 400 }
      );
    }

    // トークン検証
    const verifyResult = verifyToken(token);
    if (!verifyResult.success) {
      return NextResponse.json(
        { error: verifyResult.error },
        { status: 400 }
      );
    }

    const pending = verifyResult.pending;

    // 冪等性チェック（二重検証防止）
    const idempotencyKey = generateIdempotencyKey(pending.id);
    if (findExistingTicket(idempotencyKey)) {
      // 既存のチケットがある場合は成功として返す
      return NextResponse.json({
        success: true,
        message: 'お問い合わせは既に受け付けております。担当者より連絡いたします。',
        deduplicated: true,
      });
    }

    // チケット説明文を構築
    const descriptionParts: string[] = [
      '【空室問い合わせ】',
      '✓ 本人確認済み',
      '',
    ];

    if (pending.contactName) {
      descriptionParts.push(`お名前: ${pending.contactName}`);
    }
    if (pending.contactPhone) {
      descriptionParts.push(`電話: ${pending.contactPhone}`);
    }
    if (pending.contactEmail) {
      descriptionParts.push(`メール: ${pending.contactEmail}`);
    }

    descriptionParts.push('');

    const conditions = pending.conditionsJson || {};
    const buildingName = conditions.buildingName as string | undefined;

    if (buildingName) {
      descriptionParts.push(`希望施設: ${buildingName}`);
    }
    if (pending.vacancyUnitId) {
      descriptionParts.push(`施設ID: ${pending.vacancyUnitId}`);
    }
    if (pending.desiredMoveIn) {
      descriptionParts.push(`入居希望時期: ${pending.desiredMoveIn}`);
    }
    if (conditions.conditions) {
      descriptionParts.push(`希望・状況: ${conditions.conditions}`);
    }
    if (conditions.careLevel !== undefined) {
      const careLevel = conditions.careLevel as number;
      descriptionParts.push(
        `介護度: ${CARE_LEVEL_LABELS[careLevel] ?? `要介護${careLevel}`}`
      );
    }
    if (conditions.hasSpecialNeeds) {
      descriptionParts.push(`特別な対応: あり`);
      if (conditions.specialNeedsDetail) {
        descriptionParts.push(`詳細: ${conditions.specialNeedsDetail}`);
      }
    }

    if (pending.memo) {
      descriptionParts.push('');
      descriptionParts.push('【ご要望・ご質問】');
      descriptionParts.push(pending.memo);
    }

    const description = descriptionParts.join('\n');

    // タイトル生成
    const displayName =
      pending.contactName ||
      pending.contactPhone ||
      pending.contactEmail ||
      '匿名';
    const titleSuffix = buildingName ? ` (${buildingName})` : '';

    // メタデータ構築
    const ticketMeta: Record<string, unknown> = {
      verified: true,
      pendingId: pending.id,
    };
    if (pending.ref) {
      ticketMeta.ref = pending.ref;
    }
    if (pending.refName) {
      ticketMeta.refName = pending.refName;
    }
    if (pending.vacancyUnitId) {
      ticketMeta.vacancyUnitId = pending.vacancyUnitId;
    }

    // タグ構築
    const tags = ['空室問い合わせ', '新規', '確認済み'];
    if (pending.ref) {
      tags.push(`ref:${pending.ref}`);
    }

    // チケット作成
    const ticket = createTicket(
      {
        title: `空室問い合わせ: ${displayName}様${titleSuffix}`,
        description,
        priority: 'normal',
        category: 'client',
        businessUnitId: pending.businessUnitId,
        relatedType: 'vacancy_inquiry',
        relatedId: idempotencyKey,
        tags,
        meta: ticketMeta,
      },
      'system'
    );

    // pending を verified に更新
    markAsVerified(pending.id, ticket.id, clientIp, userAgent);

    // 担当者への通知
    if (ticket.assigneeUserId) {
      try {
        await createNotificationAsync({
          tenantId: 'default',
          userId: ticket.assigneeUserId,
          type: 'system',
          title: '空室問い合わせが割り当てられました',
          message: `${displayName}様${buildingName ? `（${buildingName}希望）` : ''}からの問い合わせが割り当てられました。（本人確認済み）`,
          severity: 'info',
          url: `/dashboard/tickets/${ticket.id}`,
          fingerprint: `vacancy_inquiry:${ticket.id}`,
        });
      } catch (notifyError) {
        console.error('Failed to send notification:', notifyError);
      }
    }

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      message: 'お問い合わせを受け付けました。担当者より連絡いたします。',
    });
  } catch (error) {
    console.error('vacancy verify POST error:', error);
    return NextResponse.json(
      { error: '確認処理に失敗しました' },
      { status: 500 }
    );
  }
}
