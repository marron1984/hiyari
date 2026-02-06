/**
 * 空室問い合わせAPI
 *
 * Ticket 070: 空室 外部提示システム
 * MVP: 問い合わせ → チケット自動作成 → 担当者通知
 *
 * POST /api/vacancies/inquiry
 *
 * - businessUnitId 必須
 * - 連絡先（電話 or メール）いずれか必須
 * - tickets を自動作成 (relatedType: vacancy_inquiry)
 * - 057 autoAssign で担当を決定
 * - 036 notifications で担当者に通知
 * - relatedId で冪等性（日付+連絡先hash）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getVacancyUnitById, seedVacancyUnitsIfEmpty } from '@/lib/vacancyUnits/repo';
import type { VacancyInquiryRequest } from '@/lib/vacancyUnits/types';
import { createTicket, listTickets } from '@/lib/tickets/repo';
import { CARE_LEVEL_LABELS } from '@/lib/vacancyUnits/types';
import { sanitizeString, sanitizeNumber, isValidEmail } from '@/lib/sanitize';
import { createNotificationServer } from '@/lib/notifications-server';

/**
 * 冪等キー生成: 日付 + 連絡先hash → 同日同一連絡先からの二重送信を防ぐ
 */
function buildIdempotencyKey(contactPhone?: string, contactEmail?: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const contact = (contactPhone || '') + (contactEmail || '');
  // 簡易hash
  let hash = 0;
  for (let i = 0; i < contact.length; i++) {
    hash = ((hash << 5) - hash + contact.charCodeAt(i)) | 0;
  }
  return `vinq:${date}:${Math.abs(hash).toString(36)}`;
}

export async function POST(request: NextRequest) {
  try {
    seedVacancyUnitsIfEmpty();

    const body = await request.json() as VacancyInquiryRequest;

    // 入力サニタイズ（公開フォームのため必須）
    const contactName = sanitizeString(body.contactName, 100);
    const contactPhone = sanitizeString(body.contactPhone, 20);
    const contactEmail = sanitizeString(body.contactEmail, 254);
    const desiredMoveIn = sanitizeString(body.desiredMoveIn, 100);
    const careLevel = sanitizeNumber(body.careLevel, { min: 0, max: 5 });
    const hasSpecialNeeds = !!body.hasSpecialNeeds;
    const specialNeedsDetail = sanitizeString(body.specialNeedsDetail, 2000);
    const message = sanitizeString(body.message, 5000);
    const vacancyUnitId = sanitizeString(body.vacancyUnitId, 128);
    const businessUnitId = sanitizeString(body.businessUnitId, 128);

    // バリデーション
    if (!contactName) {
      return NextResponse.json(
        { error: 'お名前は必須です' },
        { status: 400 }
      );
    }

    if (!contactPhone && !contactEmail) {
      return NextResponse.json(
        { error: '電話番号またはメールアドレスのいずれかは必須です' },
        { status: 400 }
      );
    }

    if (contactEmail && !isValidEmail(contactEmail)) {
      return NextResponse.json(
        { error: 'メールアドレスの形式が正しくありません' },
        { status: 400 }
      );
    }

    // 空室ユニットから事業単位IDを取得
    let targetBusinessUnitId = businessUnitId;
    let buildingName: string | undefined;
    let roomType: string | undefined;
    let area: string | undefined;

    if (vacancyUnitId) {
      const unit = getVacancyUnitById(vacancyUnitId);
      if (unit) {
        targetBusinessUnitId = unit.businessUnitId;
        buildingName = unit.buildingName;
        roomType = unit.roomType;
        area = unit.area;
      }
    }

    // businessUnitIdが必須
    if (!targetBusinessUnitId) {
      return NextResponse.json(
        { error: '事業単位の指定が必要です' },
        { status: 400 }
      );
    }

    // 冪等性チェック: 同日同一連絡先
    const idempotencyKey = buildIdempotencyKey(contactPhone ?? undefined, contactEmail ?? undefined);
    const SYSTEM_VIEWER = { userId: 'system', role: 'admin' as const };
    const { items: existingTickets } = listTickets(
      { relatedType: 'vacancy_inquiry', relatedId: idempotencyKey, limit: 1 },
      SYSTEM_VIEWER
    );

    if (existingTickets.length > 0) {
      return NextResponse.json({
        success: true,
        ticketId: existingTickets[0].id,
        message: 'お問い合わせは既に受け付け済みです。',
        duplicate: true,
      }, { status: 200 });
    }

    // チケットタイトル構築
    const titleParts = ['空室問合せ'];
    if (buildingName) titleParts.push(buildingName);
    if (area) titleParts.push(area);
    if (roomType) titleParts.push(roomType);
    const title = titleParts.join(' ');

    // チケット説明文を構築
    const descriptionParts: string[] = [
      '【空室問い合わせ】',
      '',
      `お名前: ${contactName}`,
    ];

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
    if (desiredMoveIn) {
      descriptionParts.push(`入居希望時期: ${desiredMoveIn}`);
    }
    if (careLevel != null) {
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

    // チケット作成（autoAssign適用 = skipAutoAssign: false がデフォルト）
    const ticket = createTicket(
      {
        title,
        description,
        priority: 'normal',
        category: 'client',
        businessUnitId: targetBusinessUnitId,
        relatedType: 'vacancy_inquiry',
        relatedId: idempotencyKey,
        tags: ['空室問い合わせ', '新規'],
      },
      'system'
    );

    // 担当者への通知（Admin SDK → Firestore永続化）
    if (ticket.assigneeUserId) {
      try {
        await createNotificationServer({
          tenantId: 'default',
          userId: ticket.assigneeUserId,
          type: 'vacancy_inquiry',
          title: `空室問い合わせ: ${contactName}様`,
          message: `${buildingName || '施設'}への問い合わせが届きました。${contactPhone ? `TEL: ${contactPhone}` : ''}`,
          actionUrl: `/dashboard/tickets/${ticket.id}`,
          metadata: {
            ticketId: ticket.id,
            fingerprint: `vacancy_inquiry:${ticket.id}`,
          },
        });
      } catch {
        // 通知失敗してもチケットは作成済み、エラーにしない
        console.error('vacancy inquiry notification failed');
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
