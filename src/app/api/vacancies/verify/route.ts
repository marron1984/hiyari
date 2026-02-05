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
import {
  createTicket,
  listTickets,
  findDuplicateVacancyInquiryTicket,
  mergeInquiryToTicket,
} from '@/lib/tickets/repo';
import { createAsync as createNotificationAsync } from '@/lib/notifications/index';
import { CARE_LEVEL_LABELS } from '@/lib/vacancyUnits/types';
import type { ViewerContext } from '@/lib/tickets/types';
import { checkSpamForVerify } from '@/lib/spam/check';
import {
  generateReceiptNumber,
  getExpectedResponseTime,
  generateAutoReplyForScreen,
  generateInternalSummary,
} from '@/lib/vacancyAutoReply/templates';
import { generateContactHash } from '@/lib/vacancies/contactKey';

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

    // Ticket 079: contactHash 生成
    const contactHash = generateContactHash(pending.contactEmail, pending.contactPhone);
    const conditions = pending.conditionsJson || {};
    const buildingName = conditions.buildingName as string | undefined;

    // Ticket 079: 重複問い合わせチェック（同一連絡先・同一事業）
    if (contactHash && pending.businessUnitId) {
      const existingTicket = findDuplicateVacancyInquiryTicket(
        contactHash,
        pending.businessUnitId
      );

      if (existingTicket) {
        // 既存チケットに統合
        const mergeResult = mergeInquiryToTicket(existingTicket.id, {
          contactName: pending.contactName,
          contactEmail: pending.contactEmail,
          contactPhone: pending.contactPhone,
          desiredMoveIn: pending.desiredMoveIn,
          message: pending.memo,
          buildingName,
          vacancyUnitId: pending.vacancyUnitId,
        });

        if (mergeResult.success) {
          // pending を verified に更新（統合先のチケットIDを記録）
          markAsVerified(pending.id, existingTicket.id, clientIp, userAgent);

          // 担当者に統合通知
          if (existingTicket.assigneeUserId) {
            try {
              await createNotificationAsync({
                tenantId: 'default',
                userId: existingTicket.assigneeUserId,
                type: 'system',
                title: '追加問い合わせが統合されました',
                message: `${pending.contactName || '匿名'}様から追加のお問い合わせがありました。（${buildingName || '物件指定なし'}）`,
                severity: 'info',
                url: `/dashboard/tickets/${existingTicket.id}`,
                fingerprint: `vacancy_inquiry:merged:${existingTicket.id}:${new Date().toISOString().slice(0, 10)}`,
              });
            } catch (notifyError) {
              console.error('Failed to send merge notification:', notifyError);
            }
          }

          // 既存チケットの受付番号で自動返信データを返す
          const contactMethod: 'email' | 'phone' | 'both' =
            pending.contactEmail && pending.contactPhone
              ? 'both'
              : pending.contactEmail
                ? 'email'
                : 'phone';

          const receiptNumber = generateReceiptNumber(existingTicket.id);
          const expectedResponseTime = getExpectedResponseTime();
          const autoReply = generateAutoReplyForScreen({
            name: pending.contactName || 'お客様',
            businessUnitName: pending.businessUnitId || '当施設',
            buildingName,
            contactMethod,
            ticketId: existingTicket.id,
            receiptNumber,
            expectedResponseTime,
          });

          return NextResponse.json({
            success: true,
            ticketId: existingTicket.id,
            message: 'お問い合わせを受け付けました。担当者より連絡いたします。',
            merged: true,
            autoReply: {
              title: autoReply.title,
              body: autoReply.body,
              receiptNumber: autoReply.receiptNumber,
              expectedResponseTime: autoReply.expectedResponseTime,
              additionalInfo: [
                ...autoReply.additionalInfo,
                '以前のお問い合わせと合わせて対応いたします',
              ],
              contactMethod,
              name: pending.contactName || 'お客様',
              buildingName,
            },
          });
        }
      }
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

    // conditions と buildingName は上で定義済み

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
    // Ticket 079: contactHash を保存（重複検出用）
    if (contactHash) {
      ticketMeta.contactHash = contactHash;
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

    // Ticket 078: 自動返信データ生成
    const receiptNumber = generateReceiptNumber(ticket.id);
    const expectedResponseTime = getExpectedResponseTime();
    const contactMethod: 'email' | 'phone' | 'both' =
      pending.contactEmail && pending.contactPhone
        ? 'both'
        : pending.contactEmail
          ? 'email'
          : 'phone';

    const autoReply = generateAutoReplyForScreen({
      name: pending.contactName || 'お客様',
      businessUnitName: pending.businessUnitId || '当施設',
      buildingName,
      contactMethod,
      ticketId: ticket.id,
      receiptNumber,
      expectedResponseTime,
    });

    // 担当者への通知（要約付き）
    if (ticket.assigneeUserId) {
      try {
        const internalSummary = generateInternalSummary(
          ticket.id,
          pending.contactName || '匿名',
          buildingName,
          contactMethod,
          pending.desiredMoveIn ?? undefined,
          conditions.conditions as string | undefined
        );

        await createNotificationAsync({
          tenantId: 'default',
          userId: ticket.assigneeUserId,
          type: 'system',
          title: '空室問い合わせが割り当てられました',
          message: internalSummary,
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
      autoReply: {
        title: autoReply.title,
        body: autoReply.body,
        receiptNumber: autoReply.receiptNumber,
        expectedResponseTime: autoReply.expectedResponseTime,
        additionalInfo: autoReply.additionalInfo,
        contactMethod,
        name: pending.contactName || 'お客様',
        buildingName,
      },
    });
  } catch (error) {
    console.error('vacancy verify POST error:', error);
    return NextResponse.json(
      { error: '確認処理に失敗しました' },
      { status: 500 }
    );
  }
}
