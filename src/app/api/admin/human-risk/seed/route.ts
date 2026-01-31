// ======== 人材リスク予測 ダミーデータ投入 API ========
// 管理者専用・一時利用

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

const ASSESSMENTS_COLLECTION = 'human_risk_assessments';

export async function POST() {
  // TODO: 本番では管理者ロールチェックを入れること

  try {
    const now = new Date();
    const assessmentRef = getAdminDb().collection(ASSESSMENTS_COLLECTION).doc();

    await assessmentRef.set({
      id: assessmentRef.id,
      tenantId: 'default',
      period: '2026-01',
      branchId: 'nishiyodogawa',
      branchName: '西淀川',
      totalScore: 72,
      riskLevel: 'warning',
      scores: [
        { category: 'operational_load', score: 20, label: '稼働負荷', factors: ['欠勤率上昇'], trend: 'worsening' },
        { category: 'behavioral_change', score: 18, label: '行動変化', factors: ['夜間稼働増加'], trend: 'worsening' },
        { category: 'emotional_temperature', score: 18, label: '感情温度', factors: ['残業集中'], trend: 'worsening' },
        { category: 'operational_distortion', score: 16, label: '運営歪み', factors: ['人件費率上昇'], trend: 'stable' },
      ],
      mainFactors: [
        { id: 'factor-1', category: 'operational_load', title: '欠勤率上昇', description: '拠点全体で欠勤率が上昇傾向にあります', impact: 'high', dataPoints: ['欠勤率上昇'] },
        { id: 'factor-2', category: 'behavioral_change', title: '夜間稼働増加', description: '夜間稼働が増加している傾向が見られます', impact: 'high', dataPoints: ['夜間稼働増加'] },
        { id: 'factor-3', category: 'emotional_temperature', title: '残業集中', description: '残業が一部に集中している傾向が見られます', impact: 'medium', dataPoints: ['残業集中'] },
      ],
      suggestedActions: [
        { id: 'action-1', title: '業務量の可視化と再配分', description: '拠点全体の業務量と人員配置を可視化し、バランスを確認してみると良いかもしれません', category: 'workload', priority: 'high', note: '稼働負荷が高めの傾向' },
        { id: 'action-2', title: 'チームミーティングの実施', description: '拠点内でのコミュニケーション機会を設けることを検討してみてはいかがでしょうか', category: 'communication', priority: 'high', note: 'チームの状況把握' },
      ],
      aiComment: {
        summary: '西淀川は現在警戒すべき傾向と考えられます。',
        observation: '主に欠勤率上昇、夜間稼働増加、残業集中の傾向が見られます。',
        consideration: '状況の推移を注視し、必要に応じて対応を検討することをお勧めします。',
      },
      disclaimer: 'この分析は統計データに基づく参考情報です。個人の離職予測や評価は含まれていません。最終的な判断は人間が行ってください。',
      assessedAt: now,
      createdAt: now,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[HumanRisk/Seed] 投入エラー:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '投入に失敗しました' },
      { status: 500 }
    );
  }
}
