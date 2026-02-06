/**
 * 空室問い合わせ自動返信テンプレート
 *
 * Ticket 078: 空室問い合わせ 自動返信（テンプレ）
 *
 * verified後にユーザーへ送る自動返信メッセージを生成
 */

// ========== 型定義 ==========

/**
 * 自動返信テンプレート変数
 */
export interface AutoReplyVariables {
  name: string;
  businessUnitName: string;
  buildingName?: string;
  contactMethod: 'email' | 'phone' | 'both';
  ticketId: string;
  receiptNumber: string;
  expectedResponseTime: string;
}

/**
 * 自動返信メッセージ
 */
export interface AutoReplyMessage {
  title: string;
  body: string;
  receiptNumber: string;
  expectedResponseTime: string;
  additionalInfo: string[];
}

// ========== テンプレート ==========

/**
 * 画面表示用テンプレート
 */
const SCREEN_TEMPLATE = {
  title: 'お問い合わせを受け付けました',
  bodyTemplate: `
{{name}}様

このたびは{{businessUnitName}}へのお問い合わせをいただき、誠にありがとうございます。
{{buildingNameLine}}

■ 受付番号: {{receiptNumber}}

担当者より{{expectedResponseTime}}にご連絡いたします。
{{contactMethodNote}}

ご不明な点がございましたら、受付番号をお伝えの上、お気軽にお問い合わせください。
`.trim(),
};

/**
 * メール用テンプレート（Phase 2用）
 */
const EMAIL_TEMPLATE = {
  subject: '【{{businessUnitName}}】お問い合わせを受け付けました（受付番号: {{receiptNumber}}）',
  bodyTemplate: `
{{name}}様

このたびは{{businessUnitName}}へのお問い合わせをいただき、
誠にありがとうございます。
{{buildingNameLine}}

以下の内容でお問い合わせを受け付けました。

━━━━━━━━━━━━━━━━━━━━
■ 受付番号: {{receiptNumber}}
■ ご連絡目安: {{expectedResponseTime}}
━━━━━━━━━━━━━━━━━━━━

{{contactMethodNote}}

ご不明な点がございましたら、受付番号をお伝えの上、
お気軽にお問い合わせください。

※このメールは自動送信です。
  直接返信いただいても対応できません。

──────────────────────────
{{businessUnitName}}
──────────────────────────
`.trim(),
};

// ========== ヘルパー ==========

/**
 * 受付番号を生成（ticketIdの短縮版）
 */
export function generateReceiptNumber(ticketId: string): string {
  // ticket_xxx_yyy_zzz → INQ-zzz
  const parts = ticketId.split('_');
  const suffix = parts[parts.length - 1]?.slice(-6).toUpperCase() || ticketId.slice(-6).toUpperCase();
  return `INQ-${suffix}`;
}

/**
 * 連絡方法に応じたメモを生成
 */
function getContactMethodNote(method: 'email' | 'phone' | 'both'): string {
  switch (method) {
    case 'email':
      return 'ご登録いただいたメールアドレスへご連絡いたします。';
    case 'phone':
      return 'ご登録いただいたお電話番号へご連絡いたします。\n※平日 9:00〜18:00 の間でのご連絡となります。';
    case 'both':
      return 'ご登録いただいたメールアドレスまたはお電話番号へご連絡いたします。';
    default:
      return '';
  }
}

/**
 * 連絡予定時間を取得
 */
export function getExpectedResponseTime(): string {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // 土日
  if (day === 0 || day === 6) {
    return '翌営業日中';
  }

  // 18時以降
  if (hour >= 18) {
    return '翌営業日中';
  }

  // 16時以降
  if (hour >= 16) {
    return '翌営業日の午前中';
  }

  // それ以外
  return '本日中';
}

/**
 * テンプレート変数を置換
 */
function replaceVariables(template: string, variables: AutoReplyVariables): string {
  let result = template;

  result = result.replace(/\{\{name\}\}/g, variables.name || 'お客様');
  result = result.replace(/\{\{businessUnitName\}\}/g, variables.businessUnitName || '当施設');
  result = result.replace(/\{\{receiptNumber\}\}/g, variables.receiptNumber);
  result = result.replace(/\{\{expectedResponseTime\}\}/g, variables.expectedResponseTime);
  result = result.replace(/\{\{contactMethodNote\}\}/g, getContactMethodNote(variables.contactMethod));

  // 建物名（ある場合のみ行を表示）
  if (variables.buildingName) {
    result = result.replace(/\{\{buildingNameLine\}\}/g, `お問い合わせ施設: ${variables.buildingName}`);
  } else {
    result = result.replace(/\{\{buildingNameLine\}\}/g, '');
  }

  // 空行の重複を削除
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

// ========== メイン関数 ==========

/**
 * 画面表示用の自動返信メッセージを生成
 */
export function generateAutoReplyForScreen(variables: AutoReplyVariables): AutoReplyMessage {
  const body = replaceVariables(SCREEN_TEMPLATE.bodyTemplate, variables);

  const additionalInfo: string[] = [];

  if (variables.contactMethod === 'phone') {
    additionalInfo.push('お電話は平日 9:00〜18:00 の間でのご連絡となります');
  }

  additionalInfo.push('ご不明な点があれば受付番号をお伝えください');

  return {
    title: SCREEN_TEMPLATE.title,
    body,
    receiptNumber: variables.receiptNumber,
    expectedResponseTime: variables.expectedResponseTime,
    additionalInfo,
  };
}

/**
 * メール用の自動返信メッセージを生成（Phase 2用）
 */
export function generateAutoReplyForEmail(variables: AutoReplyVariables): {
  subject: string;
  body: string;
} {
  const subject = replaceVariables(EMAIL_TEMPLATE.subject, variables);
  const body = replaceVariables(EMAIL_TEMPLATE.bodyTemplate, variables);

  return { subject, body };
}

/**
 * 内部向け要約通知を生成
 */
export function generateInternalSummary(
  ticketId: string,
  name: string,
  buildingName: string | undefined,
  contactMethod: 'email' | 'phone' | 'both',
  desiredMoveIn: string | undefined,
  conditions: string | undefined
): string {
  const parts: string[] = [
    `[問い合わせ受付] ${name}様`,
  ];

  if (buildingName) {
    parts.push(`施設: ${buildingName}`);
  }

  if (desiredMoveIn) {
    parts.push(`入居希望: ${desiredMoveIn}`);
  }

  if (conditions) {
    parts.push(`条件: ${conditions.slice(0, 50)}${conditions.length > 50 ? '...' : ''}`);
  }

  const contactLabel = contactMethod === 'email' ? 'メール' : contactMethod === 'phone' ? '電話' : 'メール/電話';
  parts.push(`連絡先: ${contactLabel}`);

  return parts.join(' / ');
}
