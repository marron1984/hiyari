/**
 * POST /api/ai-vp/preview-top3
 *
 * Implementation Ticket 063-fix / 068: 設定を適用した場合のTop3をプレビュー
 *
 * DBを書き換えずに、指定した設定でTop3を計算して返す
 * Ticket 068: 現設定 vs 編集中の比較表示を追加
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import { validateAiVpConfig, getAiVpConfig, type AiVpConfig } from '@/lib/aiVp/settings';
import { listBusinessUnits } from '@/lib/business/repo';

function checkAdminOrManager(role: AppRole): boolean {
  return ['admin', 'manager'].includes(role);
}

/**
 * 固定のサンプルデータ（プレビュー比較用）
 * 毎回同じデータを使うことで、設定変更の影響を正確に比較できる
 */
const SAMPLE_COUNTS: Record<string, Record<string, number>> = {
  bu_001: {
    licenses_expired: 2,
    repairs_highrisk: 1,
    ca_critical: 3,
    tickets_urgent: 4,
    alerts_critical: 1,
  },
  bu_002: {
    licenses_expired: 1,
    repairs_highrisk: 2,
    ca_critical: 1,
    tickets_urgent: 2,
    alerts_critical: 0,
  },
  bu_003: {
    licenses_expired: 0,
    repairs_highrisk: 3,
    ca_critical: 0,
    tickets_urgent: 5,
    alerts_critical: 2,
  },
};

/**
 * プレビュー用のスコア計算（簡易版）
 *
 * 実際のbusinessTop3.tsの計算ロジックを参照しつつ、
 * 設定のみを変えてスコアを再計算する
 */
function calculatePreviewScores(config: AiVpConfig, businessUnitId?: string) {
  // 代表的な事業を取得
  const businessUnits = listBusinessUnits();
  const targetBUs = businessUnitId
    ? businessUnits.filter((bu) => bu.id === businessUnitId)
    : businessUnits.slice(0, 3);

  // 各事業でサンプルスコアを計算
  const results = targetBUs.map((bu) => {
    // サンプルデータ（固定値で比較可能に）
    const sampleCounts = SAMPLE_COUNTS[bu.id] ?? SAMPLE_COUNTS['bu_001'];

    // スコア計算
    const candidates = [
      {
        key: 'licenses_expired',
        label: '資格期限切れ',
        count: sampleCounts.licenses_expired,
        weight: config.weights.licenses_expired,
        score: sampleCounts.licenses_expired * config.weights.licenses_expired,
      },
      {
        key: 'repairs_highrisk',
        label: '高リスク修繕',
        count: sampleCounts.repairs_highrisk,
        weight: config.weights.repairs_highrisk,
        score: sampleCounts.repairs_highrisk * config.weights.repairs_highrisk,
      },
      {
        key: 'ca_critical',
        label: '重大是正措置',
        count: sampleCounts.ca_critical,
        weight: config.weights.ca_critical,
        score: sampleCounts.ca_critical * config.weights.ca_critical,
      },
      {
        key: 'tickets_urgent',
        label: '緊急チケット',
        count: sampleCounts.tickets_urgent,
        weight: config.weights.tickets_urgent,
        score: sampleCounts.tickets_urgent * config.weights.tickets_urgent,
      },
      {
        key: 'alerts_critical',
        label: '重大アラート',
        count: sampleCounts.alerts_critical,
        weight: config.weights.alerts_critical,
        score: sampleCounts.alerts_critical * config.weights.alerts_critical,
      },
    ];

    // スコア順にソートしてTop3を取得
    const top3Limit = config.diversity.top3Limit ?? 3;
    const top3 = candidates
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, top3Limit);

    const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);

    return {
      businessUnitId: bu.id,
      businessUnitName: bu.name,
      top3,
      totalScore,
    };
  });

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!checkAdminOrManager(user.role as AppRole)) {
      return NextResponse.json(
        { error: 'Admin or manager access required' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { configJson, businessUnitId } = body as {
      configJson?: AiVpConfig;
      businessUnitId?: string;
    };

    if (!configJson) {
      return NextResponse.json(
        { error: 'configJson is required' },
        { status: 400 }
      );
    }

    // バリデーション（保存はしない）
    const validation = validateAiVpConfig(configJson);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Validation failed', errors: validation.errors },
        { status: 400 }
      );
    }

    // Ticket 068: 現設定を取得
    const currentConfig = getAiVpConfig();

    // 現設定でのスコア計算
    const currentResults = calculatePreviewScores(currentConfig, businessUnitId);

    // 編集中設定でのスコア計算
    const previewResults = calculatePreviewScores(configJson, businessUnitId);

    return NextResponse.json({
      success: true,
      // Ticket 068: 現設定 vs 編集中の比較表示
      comparison: {
        generatedAt: new Date().toISOString(),
        isPreview: true,
        // 現設定のTop3
        current: {
          label: '現設定',
          businessUnits: currentResults,
        },
        // 編集中のTop3
        preview: {
          label: '編集中',
          businessUnits: previewResults,
        },
      },
      // 後方互換: 従来のpreviewフィールドも維持
      preview: {
        generatedAt: new Date().toISOString(),
        isPreview: true,
        businessUnits: previewResults,
      },
      note: 'これはプレビューです。実際のデータは保存されていません。',
    });
  } catch (error) {
    console.error('[API /ai-vp/preview-top3] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
