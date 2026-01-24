/**
 * /api/os/team
 * チームコンディション取得API（マネージャー用）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBurnoutRiskHeatmap, getInterventions } from '@/lib/chaos';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import { SUPPORT_PURPOSE_TEXT, ONEONONE_PURPOSE_TEXT } from '@/types/chaos';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    if (!userId) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    // 権限チェック（leader以上のみ閲覧可能）
    const allowedRoles = ['leader', 'manager', 'admin', 'exec'];
    if (!userRole || !allowedRoles.includes(userRole)) {
      return NextResponse.json(
        { error: 'この機能を使用する権限がありません' },
        { status: 403 }
      );
    }

    // 全体のバーンアウトリスクヒートマップを取得
    const heatmapData = await getBurnoutRiskHeatmap(DEFAULT_TENANT_ID);

    // 介入タスクも取得
    const interventions = await getInterventions('open', 20);

    // 統計情報の計算
    const totalMembers = heatmapData.length;
    const redCount = heatmapData.filter(d => d.burnoutRiskLevel === 'red').length;
    const yellowCount = heatmapData.filter(d => d.burnoutRiskLevel === 'yellow').length;
    const greenCount = heatmapData.filter(d => d.burnoutRiskLevel === 'green').length;

    const avgFatigue = totalMembers > 0
      ? Math.round(heatmapData.reduce((sum, d) => sum + d.fatigueScore, 0) / totalMembers)
      : 0;
    const avgMentalLoad = totalMembers > 0
      ? Math.round(heatmapData.reduce((sum, d) => sum + d.mentalLoadScore, 0) / totalMembers)
      : 0;

    return NextResponse.json({
      success: true,
      team: {
        members: heatmapData.map(d => ({
          userId: d.userId,
          userName: d.userName || '名前未設定',
          date: d.date,
          fatigueScore: d.fatigueScore,
          mentalLoadScore: d.mentalLoadScore,
          burnoutRiskScore: d.burnoutRiskScore,
          burnoutRiskLevel: d.burnoutRiskLevel,
        })),
        stats: {
          totalMembers,
          redCount,
          yellowCount,
          greenCount,
          avgFatigue,
          avgMentalLoad,
        },
      },
      interventions: interventions.slice(0, 10),
      supportText: SUPPORT_PURPOSE_TEXT,
      oneononeText: ONEONONE_PURPOSE_TEXT,
    });
  } catch (error) {
    console.error('Team API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
