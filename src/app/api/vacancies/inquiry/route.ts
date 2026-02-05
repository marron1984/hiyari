/**
 * 空室問い合わせAPI
 *
 * Ticket 070: 空室 外部提示システム
 *
 * POST /api/vacancies/inquiry - 問い合わせ送信 → チケット自動作成
 *
 * - フォーム: 連絡先、希望条件
 * - tickets を自動作成 (relatedType: vacancy_inquiry)
 * - businessUnitId を付与
 * - 057の自動割当を適用可能
 * - 通知を担当者へ
 */

import { NextRequest, NextResponse } from 'next/server';
import { getVacancyUnitById, seedVacancyUnitsIfEmpty } from '@/lib/vacancyUnits/repo';
import type { VacancyInquiryRequest } from '@/lib/vacancyUnits/types';
import { createTicket } from '@/lib/tickets/repo';
import { CARE_LEVEL_LABELS } from '@/lib/vacancyUnits/types';

export async function POST(request: NextRequest) {
  try {
    seedVacancyUnitsIfEmpty();

    const body = await request.json() as VacancyInquiryRequest;

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
      message,
    } = body;

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

    // 空室ユニットから事業単位IDを取得
    let targetBusinessUnitId = businessUnitId;
    let buildingName: string | undefined;

    if (vacancyUnitId) {
      const unit = getVacancyUnitById(vacancyUnitId);
      if (unit) {
        targetBusinessUnitId = unit.businessUnitId;
        buildingName = unit.buildingName;
      }
    }

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

    // チケット作成（外部からの問い合わせなのでシステムユーザーとして作成）
    const ticket = createTicket(
      {
        title: `空室問い合わせ: ${contactName}様${buildingName ? ` (${buildingName})` : ''}`,
        description,
        priority: 'normal',
        category: 'client',
        businessUnitId: targetBusinessUnitId,
        relatedType: 'vacancy_inquiry',
        relatedId: vacancyUnitId,
        tags: ['空室問い合わせ', '新規'],
      },
      'system' // システムユーザーとして作成
    );

    // TODO: 担当者への通知（実装済みの通知システムと連携）

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
