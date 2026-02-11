/**
 * 外部限定空室情報API
 *
 * Ticket 070: 空室 外部提示システム
 *
 * GET /api/external/vacancies - 外部限定空室一覧（external accounts認証）
 *
 * - external accounts の policy と businessUnit scope を適用
 * - 詳細条件を追加表示
 * - external_audit_logs に閲覧記録
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listVacancyUnits,
  addViewLog,
  seedVacancyUnitsIfEmpty,
} from '@/lib/vacancyUnits/repo';
import { toPublicVacancyUnit } from '@/lib/vacancyUnits/types';
import {
  getExternalUserById,
  getAccessPolicy,
  addAuditLog,
} from '@/lib/external-accounts/repo.firestore';

export async function GET(request: NextRequest) {
  try {
    // シードデータ初期化
    seedVacancyUnitsIfEmpty();

    // 外部ユーザー認証（ヘッダーからトークンを取得）
    // 本番ではJWT等のトークン検証を行う
    const authHeader = request.headers.get('x-external-user-id');

    if (!authHeader) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    // 外部ユーザー取得（デモ用に admin viewer で取得）
    const externalUser = await getExternalUserById(authHeader, {
      userId: 'system',
      role: 'admin',
    });

    if (!externalUser) {
      return NextResponse.json(
        { error: '外部ユーザーが見つかりません' },
        { status: 401 }
      );
    }

    if (externalUser.status !== 'active') {
      return NextResponse.json(
        { error: 'アカウントが無効です' },
        { status: 403 }
      );
    }

    // 有効期限チェック
    if (externalUser.expiresAt && new Date(externalUser.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'アカウントの有効期限が切れています' },
        { status: 403 }
      );
    }

    // アクセスポリシー取得
    const policy = await getAccessPolicy(externalUser.id);
    const allowedBusinessUnitIds = policy?.allowBusinessUnitIds ?? [];

    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId') ?? undefined;
    const area = searchParams.get('area') ?? undefined;

    // ビジネスユニットスコープの適用
    let filterBusinessUnitId = businessUnitId;
    if (allowedBusinessUnitIds.length > 0) {
      // ポリシーで制限されている場合
      if (businessUnitId && !allowedBusinessUnitIds.includes(businessUnitId)) {
        return NextResponse.json(
          { error: 'この事業単位へのアクセス権がありません' },
          { status: 403 }
        );
      }
      // 指定がない場合は許可されたユニットのみ取得
      // (複数対応: 全て取得してからフィルタ)
    }

    // 空室ユニット取得（active のみ）
    const { items } = listVacancyUnits({
      businessUnitId: filterBusinessUnitId,
      status: 'active',
      area,
    });

    // ビジネスユニットスコープでフィルタ
    let filteredItems = items;
    if (allowedBusinessUnitIds.length > 0) {
      filteredItems = items.filter(item =>
        allowedBusinessUnitIds.includes(item.businessUnitId)
      );
    }

    // 公開情報のみに変換（ただし外部限定では詳細条件を含めてもよい）
    const publicItems = filteredItems.map(toPublicVacancyUnit);

    // 監査ログ記録
    await addAuditLog(
      externalUser.id,
      'view',
      'vacancies',
      null,
      JSON.stringify({
        businessUnitId: filterBusinessUnitId,
        area,
        count: publicItems.length,
      }),
      null,
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      request.headers.get('user-agent') ?? null
    );

    // 閲覧ログ記録
    addViewLog({
      viewerType: 'external_account',
      externalUserId: externalUser.id,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      items: publicItems,
      totalCount: publicItems.length,
      externalUser: {
        id: externalUser.id,
        displayName: externalUser.displayName,
        organization: externalUser.organization,
      },
    });
  } catch (error) {
    console.error('external vacancies GET error:', error);
    return NextResponse.json(
      { error: '空室情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
