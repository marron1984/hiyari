/**
 * KPI異常検知 Cron API
 *
 * 定期実行（例：毎日9時）でKPIをチェックし、異常があれば通知
 *
 * 呼び出し例:
 * curl -X POST https://your-domain.com/api/cron/kpi-alert \
 *   -H "Authorization: Bearer ${ALERT_CRON_SECRET}"
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMockKPITimeSeries, getDefaultAlertConfigs } from '@/lib/kpi/mock-data';
import { detectAllAnomalies } from '@/lib/kpi/anomaly-detector';
import {
  sendAlertNotifications,
  createAlertNotification,
  checkWebhookConfig,
} from '@/lib/notifications/webhook';
import { listEnabledAlertConfigs } from '@/lib/kpiDictionary/anomalyRuleRepo';
import type { AlertConfig, AnomalyDetectionResult } from '@/lib/kpi/types';

// Cron認証用シークレット
const ALERT_CRON_SECRET = process.env.ALERT_CRON_SECRET;

/**
 * POST /api/cron/kpi-alert
 *
 * KPI異常検知を実行し、異常があれば通知
 */
export async function POST(request: NextRequest) {
  // 認証チェック
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!ALERT_CRON_SECRET) {
    console.warn('[KPI Alert] ALERT_CRON_SECRET is not configured');
    // 開発環境では警告のみで続行
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
  } else if (token !== ALERT_CRON_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[KPI Alert] Starting anomaly detection...');

    // 1. KPIデータを取得
    const timeSeriesData = getMockKPITimeSeries();

    // 2. DB優先でアラート設定を取得（Task 041: 堅牢化）
    let alertConfigs: AlertConfig[];
    try {
      // DBから有効なルールを取得
      const dbConfigs = listEnabledAlertConfigs();
      if (dbConfigs.length > 0) {
        alertConfigs = dbConfigs;
        console.log(`[KPI Alert] Using ${dbConfigs.length} DB rules`);
      } else {
        // DBにルールがない場合はconfigフォールバック
        alertConfigs = getDefaultAlertConfigs();
        console.log('[KPI Alert] Fallback to config rules');
      }
    } catch (dbError) {
      // DBエラーの場合もconfigフォールバック
      console.warn('[KPI Alert] DB error, falling back to config:', dbError);
      alertConfigs = getDefaultAlertConfigs();
    }

    // 3. 異常検知を実行（壊れたルールはスキップ）
    let anomalies: AnomalyDetectionResult[] = [];
    try {
      anomalies = detectAllAnomalies(timeSeriesData, alertConfigs);
    } catch (detectionError) {
      console.error('[KPI Alert] Detection error:', detectionError);
      // 個別KPIで失敗しても全体は落とさない
      anomalies = [];
    }

    console.log(`[KPI Alert] Detected ${anomalies.length} anomalies`);

    // 異常がなければ終了
    if (anomalies.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No anomalies detected',
        anomalyCount: 0,
        notificationsSent: [],
      });
    }

    // 3. 通知を作成
    const notification = createAlertNotification(anomalies);

    // 4. Webhook設定を確認
    const webhookConfig = checkWebhookConfig();
    console.log('[KPI Alert] Webhook config:', webhookConfig);

    // 5. 通知を送信
    const notificationResults = await sendAlertNotifications(notification, {
      slack: webhookConfig.slack,
      lineWorks: webhookConfig.lineWorks,
    });

    console.log('[KPI Alert] Notification results:', notificationResults);

    // レスポンス
    return NextResponse.json({
      success: true,
      message: `${anomalies.length} anomalies detected and notifications sent`,
      anomalyCount: anomalies.length,
      anomalies: anomalies.map((a) => ({
        kpiId: a.kpiId,
        kpiName: a.kpiName,
        severity: a.severity,
        type: a.anomalyType,
        message: a.message,
      })),
      notificationResults: notificationResults.map((r) => ({
        channel: r.channel,
        success: r.success,
        error: r.errorMessage,
      })),
    });
  } catch (error) {
    console.error('[KPI Alert] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/kpi-alert
 *
 * 現在のKPI状態をプレビュー（通知は送信しない）
 */
export async function GET(request: NextRequest) {
  // 認証チェック（同様）
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (ALERT_CRON_SECRET && token !== ALERT_CRON_SECRET) {
    // GETはクエリパラメータでも認証を許可
    const { searchParams } = new URL(request.url);
    const queryToken = searchParams.get('token');
    if (queryToken !== ALERT_CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  try {
    // KPIデータを取得
    const timeSeriesData = getMockKPITimeSeries();

    // DB優先でアラート設定を取得（Task 041: 堅牢化）
    let alertConfigs: AlertConfig[];
    let configSource = 'config';
    try {
      const dbConfigs = listEnabledAlertConfigs();
      if (dbConfigs.length > 0) {
        alertConfigs = dbConfigs;
        configSource = 'database';
      } else {
        alertConfigs = getDefaultAlertConfigs();
      }
    } catch {
      alertConfigs = getDefaultAlertConfigs();
    }

    // 異常検知を実行（通知なし）
    let anomalies: AnomalyDetectionResult[] = [];
    try {
      anomalies = detectAllAnomalies(timeSeriesData, alertConfigs);
    } catch {
      anomalies = [];
    }

    // Webhook設定状態
    const webhookConfig = checkWebhookConfig();

    return NextResponse.json({
      success: true,
      preview: true,
      anomalyCount: anomalies.length,
      configSource,
      configCount: alertConfigs.length,
      anomalies: anomalies.map((a) => ({
        kpiId: a.kpiId,
        kpiName: a.kpiName,
        severity: a.severity,
        type: a.anomalyType,
        currentValue: a.currentValue,
        previousValue: a.previousValue,
        changePercent: a.changePercent,
        message: a.message,
        dashboardPath: a.dashboardPath,
      })),
      webhookConfig: {
        slackConfigured: webhookConfig.slack,
        lineWorksConfigured: webhookConfig.lineWorks,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[KPI Alert Preview] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
