/**
 * 空室問い合わせAPI
 *
 * Ticket 070: 空室 外部提示システム
 * Ticket 072: CTA最適化（フォーム簡略化・冪等性強化）
 * Ticket 073: 紹介元refトラッキング（バリデーション強化）
 * Ticket 076: 軽量本人確認（pending → verified → ticket作成）
 *
 * POST /api/vacancies/inquiry - 問い合わせ送信 → pending作成 → 確認URL返却
 *
 * フロー:
 * 1. pending を作成（tickets は作らない）
 * 2. verify URL を返却（Phase 1: 画面表示、Phase 2: メール送信）
 * 3. ユーザーが verify URL にアクセスすると tickets が作成される
 */

import { NextRequest, NextResponse } from 'next/server';
import { getByIdAsync, seedIfEmptyAsync } from '@/lib/vacancyUnits/repo';
import { validateRef, seedRefSourcesIfEmpty, logRefAccess } from '@/lib/refSources/repo';
import {
  createPending,
  checkRateLimit,
  generateVerifyUrl,
} from '@/lib/vacancyInquiryPending/repo';

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

export async function POST(request: NextRequest) {
  try {
    // シードデータ確認
    await seedIfEmptyAsync();
    seedRefSourcesIfEmpty();  // Ticket 073: refシードデータ

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

    // Ticket 076: レートリミット
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor?.split(',')[0]?.trim();
    const userAgent = request.headers.get('user-agent') ?? undefined;

    const rateLimitResult = checkRateLimit(clientIp, contactEmail);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: `連続送信を制限しています。${rateLimitResult.waitSeconds}秒後に再試行してください。`,
        },
        { status: 429 }
      );
    }

    // 空室ユニットから事業単位IDを取得
    let targetBusinessUnitId = businessUnitId || 'bu_housing'; // デフォルト
    let buildingName: string | undefined;

    if (vacancyUnitId) {
      const unit = await getByIdAsync(vacancyUnitId);
      if (unit) {
        targetBusinessUnitId = unit.businessUnitId;
        buildingName = unit.buildingName;
      }
    }

    // Ticket 073: refバリデーション
    let validatedRef: string | undefined;
    let validatedRefName: string | undefined;

    if (ref && targetBusinessUnitId) {
      const refSource = validateRef(ref, targetBusinessUnitId);
      if (refSource) {
        // 有効な紹介元
        validatedRef = refSource.ref;
        validatedRefName = refName || refSource.name;

        // アクセスログ記録
        logRefAccess(
          ref,
          '/api/vacancies/inquiry',
          clientIp,
          userAgent
        );
      }
      // 無効な場合は破棄（エラーにせず、通常問い合わせとして扱う）
    }

    // Ticket 076: 条件JSON構築
    const conditionsJson: Record<string, unknown> = {};
    if (careLevel !== undefined) {
      conditionsJson.careLevel = careLevel;
    }
    if (hasSpecialNeeds !== undefined) {
      conditionsJson.hasSpecialNeeds = hasSpecialNeeds;
    }
    if (specialNeedsDetail) {
      conditionsJson.specialNeedsDetail = specialNeedsDetail;
    }
    if (conditions) {
      conditionsJson.conditions = conditions;
    }
    if (buildingName) {
      conditionsJson.buildingName = buildingName;
    }

    // Ticket 076: pending 作成（tickets は作らない）
    const { pending, token } = createPending(
      {
        businessUnitId: targetBusinessUnitId,
        vacancyUnitId,
        contactEmail,
        contactPhone,
        contactName,
        desiredMoveIn,
        conditionsJson,
        memo: message,
        ref: validatedRef,
        refName: validatedRefName,
      },
      clientIp,
      userAgent
    );

    // 確認URLを生成
    const origin = request.headers.get('origin') ||
      request.headers.get('x-forwarded-host') ||
      'http://localhost:3000';
    const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`;
    const verifyUrl = generateVerifyUrl(baseUrl, token);

    // Phase 1: 確認URLを画面に表示
    // Phase 2（将来）: メール送信
    return NextResponse.json({
      success: true,
      pendingId: pending.id,
      verifyUrl,
      message: contactEmail
        ? '確認メールを送信しました。リンクをクリックして問い合わせを完了してください。'
        : '下記のリンクをクリックして問い合わせを完了してください。',
      expiresAt: pending.expiresAt,
      // Phase 1: デモ用に確認URLを直接返す
      // Phase 2: メール送信後はこのフィールドを削除
    }, { status: 201 });
  } catch (error) {
    console.error('vacancy inquiry POST error:', error);
    return NextResponse.json(
      { error: '問い合わせの送信に失敗しました' },
      { status: 500 }
    );
  }
}
