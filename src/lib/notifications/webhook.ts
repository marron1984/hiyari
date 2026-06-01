/**
 * Webhook通知サービス
 *
 * Slack / LINE WORKS への通知送信
 * Webhook URLは環境変数から取得（秘密情報）
 */

import type { AnomalyDetectionResult, AlertNotification } from '@/lib/kpi/types';
import { getSeverityLabel, getAnomalyTypeLabel } from '@/lib/kpi/anomaly-detector';

// 環境変数
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const LINEWORKS_WEBHOOK_URL = process.env.LINEWORKS_WEBHOOK_URL;
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://dhp-hub.example.com';

// 通知結果
export type NotificationResult = {
  channel: 'slack' | 'lineworks';
  success: boolean;
  errorMessage?: string;
};

/**
 * Slackへ通知送信
 */
export async function sendSlackNotification(
  notification: AlertNotification
): Promise<NotificationResult> {
  if (!SLACK_WEBHOOK_URL) {
    return {
      channel: 'slack',
      success: false,
      errorMessage: 'SLACK_WEBHOOK_URL が設定されていません',
    };
  }

  const payload = buildSlackPayload(notification);

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        channel: 'slack',
        success: false,
        errorMessage: `Slack API Error: ${response.status}`,
      };
    }

    return { channel: 'slack', success: true };
  } catch (error) {
    return {
      channel: 'slack',
      success: false,
      errorMessage: `Network Error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * LINE WORKSへ通知送信
 */
export async function sendLineWorksNotification(
  notification: AlertNotification
): Promise<NotificationResult> {
  if (!LINEWORKS_WEBHOOK_URL) {
    return {
      channel: 'lineworks',
      success: false,
      errorMessage: 'LINEWORKS_WEBHOOK_URL が設定されていません',
    };
  }

  const payload = buildLineWorksPayload(notification);

  try {
    const response = await fetch(LINEWORKS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        channel: 'lineworks',
        success: false,
        errorMessage: `LINE WORKS API Error: ${response.status}`,
      };
    }

    return { channel: 'lineworks', success: true };
  } catch (error) {
    return {
      channel: 'lineworks',
      success: false,
      errorMessage: `Network Error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * 両方のチャンネルに通知送信
 */
export async function sendAlertNotifications(
  notification: AlertNotification,
  options: { slack: boolean; lineWorks: boolean } = { slack: true, lineWorks: true }
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  if (options.slack) {
    results.push(await sendSlackNotification(notification));
  }

  if (options.lineWorks) {
    results.push(await sendLineWorksNotification(notification));
  }

  return results;
}

/**
 * Slack Block Kit形式のペイロードを構築
 */
function buildSlackPayload(notification: AlertNotification): object {
  const { anomalies, summary, generatedAt } = notification;

  // 重要度別にグループ化
  const critical = anomalies.filter((a) => a.severity === 'critical');
  const warning = anomalies.filter((a) => a.severity === 'warning');
  const info = anomalies.filter((a) => a.severity === 'info');

  const blocks: object[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚨 KPI異常検知アラート',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: summary,
      },
    },
    { type: 'divider' },
  ];

  // Critical
  if (critical.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔴 重大（${critical.length}件）*`,
      },
    });
    for (const anomaly of critical) {
      blocks.push(buildAnomalyBlock(anomaly));
    }
  }

  // Warning
  if (warning.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚠️ 警告（${warning.length}件）*`,
      },
    });
    for (const anomaly of warning) {
      blocks.push(buildAnomalyBlock(anomaly));
    }
  }

  // Info
  if (info.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*ℹ️ 情報（${info.length}件）*`,
      },
    });
    for (const anomaly of info) {
      blocks.push(buildAnomalyBlock(anomaly));
    }
  }

  // フッター
  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `検知時刻: ${generatedAt.toLocaleString('ja-JP')} | <${APP_BASE_URL}/dashboard/alerts|アラート詳細を確認>`,
        },
      ],
    }
  );

  return { blocks };
}

/**
 * 異常1件分のSlackブロックを構築
 */
function buildAnomalyBlock(anomaly: AnomalyDetectionResult): object {
  const changeText =
    anomaly.changePercent !== null
      ? ` (${anomaly.changePercent >= 0 ? '+' : ''}${anomaly.changePercent}%)`
      : '';

  const link = anomaly.dashboardPath
    ? ` <${APP_BASE_URL}${anomaly.dashboardPath}|詳細>`
    : '';

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `• *${anomaly.kpiName}*: ${anomaly.currentValue ?? 'N/A'}${changeText}\n  ${anomaly.message}${link}`,
    },
  };
}

/**
 * LINE WORKS用のペイロードを構築
 */
function buildLineWorksPayload(notification: AlertNotification): object {
  const { anomalies, summary, generatedAt } = notification;

  // テキストメッセージを構築
  let text = '🚨 【KPI異常検知アラート】\n\n';
  text += `${summary}\n\n`;

  // Critical
  const critical = anomalies.filter((a) => a.severity === 'critical');
  if (critical.length > 0) {
    text += `🔴 重大（${critical.length}件）\n`;
    for (const anomaly of critical) {
      text += `• ${anomaly.kpiName}: ${anomaly.message}\n`;
    }
    text += '\n';
  }

  // Warning
  const warning = anomalies.filter((a) => a.severity === 'warning');
  if (warning.length > 0) {
    text += `⚠️ 警告（${warning.length}件）\n`;
    for (const anomaly of warning) {
      text += `• ${anomaly.kpiName}: ${anomaly.message}\n`;
    }
    text += '\n';
  }

  // Info
  const info = anomalies.filter((a) => a.severity === 'info');
  if (info.length > 0) {
    text += `ℹ️ 情報（${info.length}件）\n`;
    for (const anomaly of info) {
      text += `• ${anomaly.kpiName}: ${anomaly.message}\n`;
    }
    text += '\n';
  }

  text += `---\n`;
  text += `検知時刻: ${generatedAt.toLocaleString('ja-JP')}\n`;
  text += `詳細: ${APP_BASE_URL}/dashboard/alerts`;

  // LINE WORKS Incoming Webhook形式
  return {
    content: {
      type: 'text',
      text,
    },
  };
}

/**
 * 通知サマリーを生成
 */
export function generateNotificationSummary(anomalies: AnomalyDetectionResult[]): string {
  const critical = anomalies.filter((a) => a.severity === 'critical').length;
  const warning = anomalies.filter((a) => a.severity === 'warning').length;
  const info = anomalies.filter((a) => a.severity === 'info').length;

  const parts: string[] = [];
  if (critical > 0) parts.push(`重大 ${critical}件`);
  if (warning > 0) parts.push(`警告 ${warning}件`);
  if (info > 0) parts.push(`情報 ${info}件`);

  if (parts.length === 0) {
    return 'KPIに異常は検出されませんでした。';
  }

  const total = critical + warning + info;
  return `${total}件のKPI異常を検知しました（${parts.join('、')}）。`;
}

/**
 * AlertNotificationオブジェクトを生成
 */
export function createAlertNotification(
  anomalies: AnomalyDetectionResult[]
): AlertNotification {
  return {
    id: `ALERT-${Date.now()}`,
    anomalies,
    generatedAt: new Date(),
    summary: generateNotificationSummary(anomalies),
  };
}

/**
 * Webhook URLが設定されているかチェック
 */
export function checkWebhookConfig(): {
  slack: boolean;
  lineWorks: boolean;
} {
  return {
    slack: !!SLACK_WEBHOOK_URL,
    lineWorks: !!LINEWORKS_WEBHOOK_URL,
  };
}
