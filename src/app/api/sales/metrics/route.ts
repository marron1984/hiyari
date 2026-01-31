// /api/sales/metrics - 営業メトリクスAPI
// キャッシュ禁止、エラーハンドリング付き

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import { toDate } from '@/lib/date';

const DEFAULT_TENANT_ID = 'defaultTenant';

// 有効データ開始日時（2026-01-12 13:49 JST = 2026-01-12 04:49 UTC）
const PROSPECTS_ACTIVE_FROM = new Date('2026-01-12T04:49:00.000Z');

// キャッシュを完全に無効化
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Warning {
  label: string;
  code: string;
  message: string;
}

interface SalesMetricsResponse {
  success: boolean;
  // salesDeals集計
  deals: {
    total: number;
    active: number;
    completed: number;
    lost: number;
    byStatus: Record<string, number>;
    bySource: Record<string, { total: number; completed: number }>;
  };
  // CV率（分母0はnull）
  rates: {
    totalCv: number | null;
    teleapoCv: number | null;
    shiryouCv: number | null;
  };
  // 入居希望者（prospects）KPI - 2026-01-12 13:49以降のみ
  prospects: {
    total: number;
    kpiTotal: number; // 時間スコープ適用後
    byStatus: Record<string, number>;
    expectedMoveIns: number;
    rankDistribution: { A: number; B: number; C: number; D: number };
  };
  // パイプライン（LD/V/M）
  pipeline: {
    ld: number; // リード（新規受付）
    v: number;  // 訪問・見学設定済
    m: number;  // 申込中〜入居待ち
    cvRate: number | null; // M/LD
  };
  // メタ情報
  updatedAt: string;
  warnings: Warning[];
  // デバッグ情報（debug=1時のみ）
  debug?: {
    queryScope: string;
    prospectsQueried: number;
    prospectsFiltered: number;
    dealsQueried: number;
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const warnings: Warning[] = [];

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

    // ユーザー情報取得
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    // デバッグモード判定（execのみ）
    const debugMode = request.nextUrl.searchParams.get('debug') === '1' && hasMinRole(userRole, 'admin');

    // ===== salesDeals取得（シンプルなクエリ）=====
    let dealsData: { total: number; active: number; completed: number; lost: number; byStatus: Record<string, number>; bySource: Record<string, { total: number; completed: number }> } = {
      total: 0,
      active: 0,
      completed: 0,
      lost: 0,
      byStatus: {},
      bySource: {},
    };
    let dealsQueried = 0;

    try {
      const dealsSnap = await db
        .collection('salesDeals')
        .where('tenantId', '==', DEFAULT_TENANT_ID)
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();

      dealsQueried = dealsSnap.size;

      dealsSnap.docs.forEach((doc) => {
        const deal = doc.data();
        const status = deal.status as string;
        const source = deal.source as string || 'その他';

        dealsData.total++;
        dealsData.byStatus[status] = (dealsData.byStatus[status] || 0) + 1;

        if (status === '請求書到着') {
          dealsData.completed++;
        } else if (status === '失注') {
          dealsData.lost++;
        } else {
          dealsData.active++;
        }

        // ソース別集計
        if (!dealsData.bySource[source]) {
          dealsData.bySource[source] = { total: 0, completed: 0 };
        }
        dealsData.bySource[source].total++;
        if (status === '請求書到着') {
          dealsData.bySource[source].completed++;
        }
      });
    } catch (err) {
      warnings.push({
        label: 'deals',
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'salesDeals取得エラー',
      });
    }

    // ===== prospects取得（2026-01-12 13:49以降のみ）=====
    let prospectsData = {
      total: 0,
      kpiTotal: 0,
      byStatus: {} as Record<string, number>,
      expectedMoveIns: 0,
      rankDistribution: { A: 0, B: 0, C: 0, D: 0 },
    };
    let pipelineData = {
      ld: 0,
      v: 0,
      m: 0,
      cvRate: null as number | null,
    };
    let prospectsQueried = 0;
    let prospectsFiltered = 0;

    try {
      // シンプルなクエリ: tenantIdのみでフィルタ、集計はアプリ側
      const prospectsSnap = await db
        .collection('prospects')
        .where('tenantId', '==', DEFAULT_TENANT_ID)
        .limit(2000)
        .get();

      prospectsQueried = prospectsSnap.size;

      prospectsSnap.docs.forEach((doc) => {
        const prospect = doc.data();
        const status = prospect.status as string;

        prospectsData.total++;

        // KPIスコープ: 2026-01-12 13:49以降のみ（receivedAt > inquiryDate > createdAt）
        let baseDate: Date | null = null;
        if (prospect.receivedAt) {
          baseDate = toDate(prospect.receivedAt);
        } else if (prospect.inquiryDate) {
          const parsed = new Date(prospect.inquiryDate);
          if (!isNaN(parsed.getTime())) baseDate = parsed;
        } else if (prospect.createdAt) {
          baseDate = toDate(prospect.createdAt);
        }

        const isKpiTarget = baseDate !== null && baseDate >= PROSPECTS_ACTIVE_FROM;

        if (!isKpiTarget) {
          return; // このレコードはKPI対象外
        }

        prospectsFiltered++;
        prospectsData.kpiTotal++;
        prospectsData.byStatus[status] = (prospectsData.byStatus[status] || 0) + 1;

        // パイプライン集計（LD/V/M）
        if (status === '新規受付' || status === '折返し待ち') {
          pipelineData.ld++;
        } else if (status === '面談設定済' || status === '見学設定済') {
          pipelineData.v++;
        } else if (['申込中', '審査中', '入居待ち'].includes(status)) {
          pipelineData.m++;
        }

        // 入居決定をカウント（CV計算用）
        if (status === '入居決定') {
          // CVはM→入居決定
        }
      });

      // CV率計算（M / LD）
      const totalFunnel = pipelineData.ld + pipelineData.v + pipelineData.m;
      if (totalFunnel > 0) {
        const decided = prospectsData.byStatus['入居決定'] || 0;
        pipelineData.cvRate = Math.round((decided / totalFunnel) * 100);
      }

      // ランク分布（簡易版 - スコアリング関数は別途）
      // 本来はscoringを使うが、ここではステータスベースで簡易集計
      const activeCount = prospectsData.kpiTotal - (prospectsData.byStatus['クローズ'] || 0) - (prospectsData.byStatus['見送り'] || 0) - (prospectsData.byStatus['入居決定'] || 0);
      prospectsData.rankDistribution = {
        A: prospectsData.byStatus['入居待ち'] || 0,
        B: (prospectsData.byStatus['申込中'] || 0) + (prospectsData.byStatus['審査中'] || 0),
        C: (prospectsData.byStatus['面談設定済'] || 0) + (prospectsData.byStatus['見学設定済'] || 0),
        D: (prospectsData.byStatus['新規受付'] || 0) + (prospectsData.byStatus['折返し待ち'] || 0),
      };

      // 見込み数（簡易版）
      prospectsData.expectedMoveIns = prospectsData.rankDistribution.A * 0.9 +
        prospectsData.rankDistribution.B * 0.5 +
        prospectsData.rankDistribution.C * 0.2 +
        prospectsData.rankDistribution.D * 0.05;
      prospectsData.expectedMoveIns = Math.round(prospectsData.expectedMoveIns * 10) / 10;

    } catch (err) {
      warnings.push({
        label: 'prospects',
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'prospects取得エラー',
      });
    }

    // ===== CV率計算（safeRate） =====
    const safeRate = (n: number, d: number): number | null => {
      if (d === 0) return null;
      return Math.round((n / d) * 100);
    };

    const rates = {
      totalCv: safeRate(dealsData.completed, dealsData.completed + dealsData.lost),
      teleapoCv: dealsData.bySource['テレアポ']
        ? safeRate(dealsData.bySource['テレアポ'].completed, dealsData.bySource['テレアポ'].total)
        : null,
      shiryouCv: dealsData.bySource['資料送付']
        ? safeRate(dealsData.bySource['資料送付'].completed, dealsData.bySource['資料送付'].total)
        : null,
    };

    // ===== レスポンス構築 =====
    const response: SalesMetricsResponse = {
      success: true,
      deals: dealsData,
      rates,
      prospects: prospectsData,
      pipeline: pipelineData,
      updatedAt: new Date().toISOString(),
      warnings,
    };

    // デバッグ情報
    if (debugMode) {
      response.debug = {
        queryScope: `receivedAt >= 2026-01-12 13:49 JST`,
        prospectsQueried,
        prospectsFiltered,
        dealsQueried,
      };
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    console.error('Sales metrics API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        warnings,
        updatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
