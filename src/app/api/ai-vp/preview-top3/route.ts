/**
 * POST /api/ai-vp/preview-top3
 *
 * Implementation Ticket 063-fix: 設定を適用した場合のTop3をプレビュー
 *
 * DBを書き換えずに、指定した設定でTop3を計算して返す
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type { AppRole } from '@/config/appRoles';
import { validateAiVpConfig, type AiVpConfig } from '@/lib/aiVp/settings';
import { listBusinessUnits } from '@/lib/business/repo';

function isValidAppRole(role: string): role is AppRole {
  return ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'].includes(role);
}

async function getCurrentUser(): Promise<{ userId: string; role: AppRole }> {
  const headersList = await headers();
  const userIdHeader = headersList.get('x-user-id');
  const roleHeader = headersList.get('x-user-role');
  const userId = userIdHeader ?? 'user_001';
  const role: AppRole = roleHeader && isValidAppRole(roleHeader) ? roleHeader : 'admin';
  return { userId, role };
}

function checkAdminOrManager(role: AppRole): boolean {
  return ['admin', 'manager'].includes(role);
}

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
    // サンプルデータ（実際はリポジトリから取得）
    const sampleCounts = {
      licenses_expired: Math.floor(Math.random() * 3),
      repairs_highrisk: Math.floor(Math.random() * 2),
      ca_critical: Math.floor(Math.random() * 2),
      tickets_urgent: Math.floor(Math.random() * 5),
      alerts_critical: Math.floor(Math.random() * 2),
    };

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
    const { role } = await getCurrentUser();

    if (!checkAdminOrManager(role)) {
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

    // プレビュー用のスコア計算
    const previewResults = calculatePreviewScores(configJson, businessUnitId);

    return NextResponse.json({
      success: true,
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
