/**
 * leadScore 提案プレビュー API
 *
 * Ticket 124: パッチを適用した設定のプレビュー
 *
 * POST /api/lead-score-suggestions/preview
 *   Body: { suggestionId: string } or { patch: Partial<AiVpConfig> }
 *   - 提案のパッチを現在の設定に適用したプレビューを返す
 *   - 設定は保存しない
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getSuggestionById } from '@/lib/sales/suggestionsRepo';
import { applyPatchPreview } from '@/lib/sales/buildLeadScoreSuggestions';
import { getAiVpConfig } from '@/lib/aiVp/settings';
import type { AiVpConfig } from '@/lib/aiVp/defaultConfig';

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    return await verifyIdToken(authHeader.replace('Bearer ', ''));
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    let patch: Partial<AiVpConfig>;

    if (body.suggestionId) {
      // 提案IDからパッチを取得
      const suggestion = getSuggestionById(body.suggestionId);
      if (!suggestion) {
        return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
      }

      // 提案内の全パッチを統合
      patch = {};
      for (const item of suggestion.suggestions) {
        if (item.suggestedConfigPatch.weights) {
          patch.weights = { ...patch.weights, ...item.suggestedConfigPatch.weights } as AiVpConfig['weights'];
        }
        if (item.suggestedConfigPatch.thresholds) {
          patch.thresholds = { ...patch.thresholds, ...item.suggestedConfigPatch.thresholds } as AiVpConfig['thresholds'];
        }
        if (item.suggestedConfigPatch.diversity) {
          patch.diversity = { ...patch.diversity, ...item.suggestedConfigPatch.diversity } as AiVpConfig['diversity'];
        }
      }
    } else if (body.patch) {
      patch = body.patch;
    } else {
      return NextResponse.json({ error: 'suggestionId or patch is required' }, { status: 400 });
    }

    const currentConfig = getAiVpConfig();
    const previewConfig = applyPatchPreview(patch);

    return NextResponse.json({
      current: currentConfig,
      preview: previewConfig,
      patch,
    });
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }
}
