// コンディションスコア API
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isAiVpOwner } from '@/lib/auth';
import { toDate } from '@/lib/date';
import {
  getLatestConditionScores,
  getAlertedStaff,
  getConditionSummary,
  saveConditionScore,
  notifyYoshidaAboutCondition,
  generateMockBehaviorMetrics,
} from '@/lib/condition-analysis';
import {
  collectBehaviorMetrics,
  saveMetricsSnapshot,
  getLatestMetricsSnapshot,
  isLineWorksAdminConfigured,
} from '@/lib/lineworks-admin';

const DEFAULT_TENANT_ID = 'defaultTenant';

// GET: コンディションスコア一覧を取得
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    // AI副社長オーナーまたは管理者チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';
    const isAdmin = ['admin', 'system_admin'].includes(userRole);

    if (!isAiVpOwner(decodedToken.email) && !isAdmin) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all';

    let scores;
    switch (type) {
      case 'alerted':
        scores = await getAlertedStaff(50);
        break;
      case 'summary':
        const summary = await getConditionSummary();
        return NextResponse.json({ success: true, summary });
      default:
        scores = await getLatestConditionScores(50);
    }

    return NextResponse.json({
      success: true,
      scores,
      count: scores.length,
    });
  } catch (error) {
    console.error('Condition API GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: コンディションスコアを計算・保存、または通知を送信
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    // AI副社長オーナーまたは管理者チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';
    const isAdmin = ['admin', 'system_admin'].includes(userRole);

    if (!isAiVpOwner(decodedToken.email) && !isAdmin) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    const body = await request.json();
    const { action, userId, userName, metrics, scoreId } = body;

    switch (action) {
      case 'calculate': {
        // コンディションスコアを計算・保存
        if (!userId || !userName) {
          return NextResponse.json({ error: 'userIdとuserNameは必須です' }, { status: 400 });
        }

        // metricsが指定されていなければ実データを試行→フォールバックでモック
        let behaviorMetrics = metrics;
        if (!behaviorMetrics) {
          const now = new Date();
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const realMetrics = await collectBehaviorMetrics(weekAgo, now);
          behaviorMetrics = realMetrics.get(userId) || generateMockBehaviorMetrics();
        }

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const conditionScore = await saveConditionScore(
          userId,
          userName,
          behaviorMetrics,
          weekAgo,
          now
        );

        // 監査ログ
        await getAdminDb().collection('aiVpAuditLogs').add({
          tenantId: DEFAULT_TENANT_ID,
          actorUserId: decodedToken.uid,
          actorUserName: userData?.name || decodedToken.email || 'Unknown',
          eventType: 'condition_calculated',
          eventMeta: {
            targetUserId: userId,
            score: conditionScore.score,
            alertLevel: conditionScore.alertLevel,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
          success: true,
          conditionScore,
        });
      }

      case 'notify': {
        // 吉田に通知を送信
        if (!scoreId) {
          return NextResponse.json({ error: 'scoreIdは必須です' }, { status: 400 });
        }

        // スコアを取得
        const scoreDoc = await getAdminDb().collection('conditionScores').doc(scoreId).get();
        if (!scoreDoc.exists) {
          return NextResponse.json({ error: 'スコアが見つかりません' }, { status: 404 });
        }

        const scoreData = scoreDoc.data();
        const conditionScore = {
          id: scoreDoc.id,
          tenantId: scoreData?.tenantId,
          userId: scoreData?.userId,
          userName: scoreData?.userName,
          score: scoreData?.score,
          previousScore: scoreData?.previousScore,
          trend: scoreData?.trend,
          metrics: scoreData?.metrics,
          alertLevel: scoreData?.alertLevel,
          alertTriggeredAt: toDate(scoreData?.alertTriggeredAt),
          taskDistributed: scoreData?.taskDistributed,
          loadReduced: scoreData?.loadReduced,
          yoshidaNotified: scoreData?.yoshidaNotified,
          calculatedAt: toDate(scoreData?.calculatedAt) || new Date(),
          periodStart: toDate(scoreData?.periodStart) || new Date(),
          periodEnd: toDate(scoreData?.periodEnd) || new Date(),
        };

        const notified = await notifyYoshidaAboutCondition(conditionScore as any);

        // 監査ログ
        await getAdminDb().collection('aiVpAuditLogs').add({
          tenantId: DEFAULT_TENANT_ID,
          actorUserId: decodedToken.uid,
          actorUserName: userData?.name || decodedToken.email || 'Unknown',
          eventType: 'condition_notified',
          eventMeta: {
            scoreId,
            targetUserId: scoreData?.userId,
            notified,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
          success: true,
          notified,
        });
      }

      case 'batch_calculate': {
        // 全スタッフのコンディションを一括計算
        // LINE WORKSデータがあれば実データ、なければモックデータを使用
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        let metricsMap = await collectBehaviorMetrics(weekAgo, now);
        let source: 'admin_api' | 'firestore_webhook' | 'mock' = isLineWorksAdminConfigured()
          ? 'admin_api'
          : 'firestore_webhook';

        // データがない場合はモックデータにフォールバック
        if (metricsMap.size === 0) {
          source = 'mock';
          const usersSnapshot = await getAdminDb()
            .collection('users')
            .where('tenantId', '==', DEFAULT_TENANT_ID)
            .limit(50)
            .get();

          for (const userDocSnapshot of usersSnapshot.docs) {
            metricsMap.set(userDocSnapshot.id, generateMockBehaviorMetrics());
          }
        }

        // スナップショットを保存
        await saveMetricsSnapshot(metricsMap, weekAgo, now, source);

        const results = [];
        for (const [uid, userMetrics] of metricsMap) {
          const userDocSnapshot = await getAdminDb().collection('users').doc(uid).get();
          const user = userDocSnapshot.data();
          const uName = user?.name || user?.email || 'Unknown';

          const conditionScore = await saveConditionScore(
            uid,
            uName,
            userMetrics,
            weekAgo,
            now
          );

          results.push({
            userId: uid,
            userName: uName,
            score: conditionScore.score,
            alertLevel: conditionScore.alertLevel,
          });
        }

        return NextResponse.json({
          success: true,
          source,
          processedCount: results.length,
          results,
        });
      }

      default:
        return NextResponse.json({ error: '無効なアクションです' }, { status: 400 });
    }
  } catch (error) {
    console.error('Condition API POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
