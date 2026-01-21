// ======== LINE WORKS通知ヘルパー ========

import { Prospect, PROSPECT_STATUS_CONFIG } from '@/types/prospect';
import { createNotificationLog, getRecentNotifications } from './prospect';

// 環境変数からLINE WORKS設定を取得
const LINEWORKS_BOT_ID = process.env.LINEWORKS_BOT_ID || '';
const LINEWORKS_CHANNEL_ID = process.env.LINEWORKS_CHANNEL_ID || '';
const LINEWORKS_GROUP_ID = process.env.LINEWORKS_GROUP_ID || '';
const LINEWORKS_ACCESS_TOKEN = process.env.LINEWORKS_ACCESS_TOKEN || '';

// LINE WORKS API Base URL
const LINEWORKS_API_BASE = 'https://www.worksapis.com/v1.0';

interface LineWorksMessagePayload {
  content: {
    type: 'text';
    text: string;
  };
}

/**
 * LINE WORKSグループにメッセージを送信
 */
export async function sendLineWorksMessage(
  message: string,
  groupId: string = LINEWORKS_GROUP_ID
): Promise<{ success: boolean; error?: string }> {
  if (!LINEWORKS_ACCESS_TOKEN || !LINEWORKS_BOT_ID) {
    console.warn('LINE WORKS credentials not configured');
    return { success: false, error: 'LINE WORKS credentials not configured' };
  }

  try {
    const payload: LineWorksMessagePayload = {
      content: {
        type: 'text',
        text: message,
      },
    };

    const response = await fetch(
      `${LINEWORKS_API_BASE}/bots/${LINEWORKS_BOT_ID}/channels/${groupId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LINEWORKS_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LINE WORKS API error:', response.status, errorText);
      return { success: false, error: `API error: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    console.error('LINE WORKS send error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * 入居希望者の通知メッセージをフォーマット
 */
export function formatProspectNotification(
  prospect: Prospect,
  type: 'new' | 'status_change',
  baseUrl: string
): string {
  const statusConfig = PROSPECT_STATUS_CONFIG[prospect.status];
  const detailUrl = `${baseUrl}/dashboard/prospects/${prospect.id}`;

  const lines: string[] = [];

  if (type === 'new') {
    lines.push('【新規入居希望者】');
  } else {
    lines.push(`【ステータス更新: ${prospect.status}】`);
  }

  lines.push('');

  // 基本情報
  if (prospect.customerName) {
    lines.push(`■ 顧客名: ${prospect.customerName}`);
  }
  if (prospect.age) {
    lines.push(`■ 年齢: ${prospect.age}歳`);
  }
  if (prospect.gender) {
    lines.push(`■ 性別: ${prospect.gender}`);
  }
  if (prospect.careLevel) {
    lines.push(`■ 介護度: ${prospect.careLevel}`);
  }

  lines.push('');

  // 希望情報
  if (prospect.desiredFacility) {
    lines.push(`■ 希望施設: ${prospect.desiredFacility}`);
  }
  if (prospect.budget) {
    lines.push(`■ 費用: ${prospect.budget}`);
  }

  lines.push('');

  // 状況
  if (prospect.currentSituation) {
    lines.push(`■ 現在状況: ${prospect.currentSituation}`);
  }
  if (prospect.debtStatus) {
    lines.push(`■ 借金有無: ${prospect.debtStatus}`);
  }

  lines.push('');

  // 予定
  if (prospect.interviewDateTime) {
    lines.push(`■ 面談希望: ${prospect.interviewDateTime}`);
  }
  if (prospect.tourRequestDate) {
    lines.push(`■ 見学希望日: ${prospect.tourRequestDate}`);
  }

  lines.push('');

  // 営業会社
  if (prospect.salesCompanyName) {
    lines.push(`■ 営業会社: ${prospect.salesCompanyName}`);
  }
  if (prospect.salesRepName) {
    lines.push(`■ 営業担当: ${prospect.salesRepName}`);
  }

  lines.push('');
  lines.push(`▼ 詳細はこちら`);
  lines.push(detailUrl);

  return lines.filter((l) => l !== '' || lines.indexOf(l) === lines.lastIndexOf(l)).join('\n');
}

/**
 * 入居希望者の通知を送信（連投抑止付き）
 */
export async function notifyProspect(
  prospect: Prospect,
  type: 'new' | 'status_change',
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'https://aa-g.org'
): Promise<{ sent: boolean; suppressed: boolean; error?: string }> {
  // 連投抑止チェック（10分以内の通知があればスキップ）
  const recentNotifications = await getRecentNotifications(prospect.id, 10);
  if (recentNotifications.length > 0 && type !== 'new') {
    return { sent: false, suppressed: true };
  }

  const message = formatProspectNotification(prospect, type, baseUrl);
  const result = await sendLineWorksMessage(message);

  // 通知ログを記録
  await createNotificationLog({
    tenantId: prospect.tenantId,
    prospectId: prospect.id,
    channel: 'lineworks',
    message: message.substring(0, 500), // ログは最初の500文字のみ
    status: result.success ? 'sent' : 'failed',
    error: result.error,
  });

  return {
    sent: result.success,
    suppressed: false,
    error: result.error,
  };
}

/**
 * LINE WORKS設定が有効かチェック
 */
export function isLineWorksConfigured(): boolean {
  return !!(LINEWORKS_ACCESS_TOKEN && LINEWORKS_BOT_ID && LINEWORKS_GROUP_ID);
}
