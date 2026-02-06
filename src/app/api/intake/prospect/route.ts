// ======== 入居希望者 Webhook API ========
// POST /api/intake/prospect
// Yoomから入居希望者データを受信してFirestoreに登録

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  ProspectWebhookPayload,
  ProspectStatus,
  generateProspectKey,
} from '@/types/prospect';
import { getNextInternalNo } from '@/lib/prospect-admin';
import { sanitizeString } from '@/lib/sanitize';

// Firebase Admin初期化（サーバーサイド用）
function getAdminFirestore() {
  if (getApps().length === 0) {
    // 環境変数からサービスアカウント情報を取得
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : undefined;

    if (serviceAccount) {
      initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    } else {
      // Application Default Credentials（Cloud環境用）
      initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }
  }
  return getFirestore();
}

// Webhookトークン検証
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || '';

// テナントID（MVPでは固定）
const DEFAULT_TENANT_ID = 'defaultTenant';

// LINE WORKS通知設定
const LINEWORKS_BOT_ID = process.env.LINEWORKS_BOT_ID || '';
const LINEWORKS_GROUP_ID = process.env.LINEWORKS_GROUP_ID || '';
const LINEWORKS_ACCESS_TOKEN = process.env.LINEWORKS_ACCESS_TOKEN || '';
const LINEWORKS_API_BASE = 'https://www.worksapis.com/v1.0';

/**
 * LINE WORKSにメッセージを送信
 */
async function sendLineWorksNotification(message: string): Promise<boolean> {
  if (!LINEWORKS_ACCESS_TOKEN || !LINEWORKS_BOT_ID || !LINEWORKS_GROUP_ID) {
    console.warn('LINE WORKS credentials not configured, skipping notification');
    return false;
  }

  try {
    const response = await fetch(
      `${LINEWORKS_API_BASE}/bots/${LINEWORKS_BOT_ID}/channels/${LINEWORKS_GROUP_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LINEWORKS_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: {
            type: 'text',
            text: message,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error('LINE WORKS API error:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('LINE WORKS send error:', error);
    return false;
  }
}

/**
 * 通知メッセージをフォーマット
 */
function formatNotificationMessage(data: Record<string, unknown>, prospectId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aa-g.org';
  const lines: string[] = [];

  lines.push('【新規入居希望者】');
  lines.push('');

  if (data.customerName || data['顧客名'] || data['お名前']) {
    lines.push(`■ 顧客名: ${data.customerName || data['顧客名'] || data['お名前']}`);
  }
  if (data.age || data['年齢']) {
    lines.push(`■ 年齢: ${data.age || data['年齢']}歳`);
  }
  if (data.gender || data['性別']) {
    lines.push(`■ 性別: ${data.gender || data['性別']}`);
  }
  if (data.careLevel || data['介護度'] || data['介護度・障害区分']) {
    lines.push(`■ 介護度: ${data.careLevel || data['介護度'] || data['介護度・障害区分']}`);
  }

  lines.push('');

  if (data.desiredFacility || data['入居場所'] || data['希望施設']) {
    lines.push(`■ 希望施設: ${data.desiredFacility || data['入居場所'] || data['希望施設']}`);
  }
  if (data.budget || data['費用']) {
    lines.push(`■ 費用: ${data.budget || data['費用']}`);
  }
  if (data.currentSituation || data['現在状況']) {
    lines.push(`■ 現在状況: ${data.currentSituation || data['現在状況']}`);
  }
  if (data.debtStatus || data['借金有無']) {
    lines.push(`■ 借金有無: ${data.debtStatus || data['借金有無']}`);
  }

  lines.push('');

  if (data.interviewDateTime || data['面談日時']) {
    lines.push(`■ 面談希望: ${data.interviewDateTime || data['面談日時']}`);
  }
  if (data.tourRequestDate || data['見学希望日']) {
    lines.push(`■ 見学希望日: ${data.tourRequestDate || data['見学希望日']}`);
  }

  lines.push('');

  if (data.salesCompanyName || data['営業会社名'] || data['御社名']) {
    lines.push(`■ 営業会社: ${data.salesCompanyName || data['営業会社名'] || data['御社名']}`);
  }
  if (data.salesRepName || data['営業担当者名'] || data['ご担当者名']) {
    lines.push(`■ 営業担当: ${data.salesRepName || data['営業担当者名'] || data['ご担当者名']}`);
  }

  lines.push('');
  lines.push('▼ 詳細はこちら');
  lines.push(`${baseUrl}/dashboard/prospects/${prospectId}`);

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  // 認証チェック
  const token = request.headers.get('X-Webhook-Token');
  if (!token || token !== WEBHOOK_TOKEN) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Invalid or missing webhook token' },
      { status: 401 }
    );
  }

  let payload: ProspectWebhookPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  // 必須フィールドチェック
  if (!payload.source) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'source is required' },
      { status: 400 }
    );
  }

  const extracted = payload.extracted || {};

  // Webhook入力のサニタイズ（外部データのため必須）
  const san = (key: string, ...altKeys: string[]): string | null => {
    for (const k of [key, ...altKeys]) {
      const v = sanitizeString(extracted[k], 500);
      if (v) return v;
    }
    return null;
  };

  try {
    const db = getAdminFirestore();
    const now = Timestamp.now();

    // 社内Noを自動付番（トランザクションで重複を防止）
    const internalNo = await getNextInternalNo();

    // データマッピング（サニタイズ済み）
    const customerName = san('顧客名', 'お名前') || '';
    const ageValue = extracted['年齢'];
    const age = typeof ageValue === 'number' ? ageValue : parseInt(ageValue as string) || null;
    const inquiryDate = san('問い合わせ日') || '';
    const salesCompanyName = san('営業会社名', '御社名') || '';
    const salesRepName = san('営業担当者名', 'ご担当者名') || '';

    // 重複判定キー生成
    const prospectKey = generateProspectKey({
      customerName,
      age: age || undefined,
      inquiryDate,
      salesCompanyName,
      salesRepName,
    });

    // 重複候補検索
    let duplicateCandidates: string[] = [];
    if (prospectKey) {
      const existingQuery = await db
        .collection('prospects')
        .where('tenantId', '==', DEFAULT_TENANT_ID)
        .where('prospectKey', '==', prospectKey)
        .get();

      duplicateCandidates = existingQuery.docs.map((doc) => doc.id);
    }

    // 入居希望者データ作成
    const prospectData = {
      tenantId: DEFAULT_TENANT_ID,
      status: '新規受付' as ProspectStatus,
      receivedAt: payload.meta?.received_at
        ? Timestamp.fromDate(new Date(payload.meta.received_at))
        : now,
      prospectKey,
      createdAt: now,
      createdBy: null,
      createdByName: 'Webhook',

      // 基本情報（自動付番された社内No）
      internalNo,
      statusNote: null,
      assigneeId: null,
      assigneeName: null,

      // 顧客情報（サニタイズ済み）
      customerName: customerName || null,
      age: age,
      gender: san('性別'),
      careLevel: san('介護度', '介護度・障害区分'),
      disabilityCategory: san('障害区分'),

      // 費用
      budget: san('費用'),
      budgetDetail: san('費用詳細'),
      monthlyBudget: san('月額希望'),

      // ADL
      adlSummary: san('ADL状況'),
      adlDetail: san('ADL詳細'),
      adl: {
        standing: san('ADL立位', '立位'),
        bathing: san('入浴'),
        eating: san('食事'),
        toileting: san('排泄'),
        other: san('ADLその他'),
      },

      // 状況
      debtStatus: san('借金有無'),
      currentSituation: san('現在状況'),
      currentAddress: san('現在のお住い・入院病院', '現在のお住い'),
      currentDetail: san('現在の詳細状況'),

      // 入居希望
      desiredFacility: san('入居場所', '希望施設'),
      desiredMoveInDate: san('入居予定日'),
      entertainmentWish: san('エント希望', 'エント'),
      tourRequestDate: san('見学希望日'),

      // 面談・連絡
      interviewDateTime: san('面談日時'),
      keyPerson: san('キーパーソン'),
      otherNotes: san('その他備考', 'その他'),

      // 営業会社
      salesCompanyName: salesCompanyName || null,
      salesRepName: salesRepName || null,
      salesRepContact: san('ご連絡先'),

      // 問い合わせ
      inquiryDate: inquiryDate || null,

      // ソース
      source: sanitizeString(payload.source, 100) || 'unknown',
      rawTranscript: sanitizeString(payload.raw_transcript, 50000),
      rawPayload: extracted,

      // 重複
      duplicateOf: null,
      duplicateCandidates: duplicateCandidates.length > 0 ? duplicateCandidates : null,
    };

    // Firestoreに保存
    const docRef = await db.collection('prospects').add(prospectData);
    const prospectId = docRef.id;

    // 監査ログ
    await db.collection('auditLogs').add({
      tenantId: DEFAULT_TENANT_ID,
      actor: 'webhook',
      actorName: 'Webhook',
      action: 'create',
      entity: 'prospect',
      entityId: prospectId,
      diff: null,
      note: `Source: ${payload.source}`,
      createdAt: now,
    });

    // LINE WORKS通知
    const notificationMessage = formatNotificationMessage(extracted, prospectId);
    const notificationSent = await sendLineWorksNotification(notificationMessage);

    // 通知ログ
    await db.collection('notificationLogs').add({
      tenantId: DEFAULT_TENANT_ID,
      prospectId,
      channel: 'lineworks',
      message: notificationMessage.substring(0, 500),
      status: notificationSent ? 'sent' : 'failed',
      error: notificationSent ? null : 'LINE WORKS notification failed or not configured',
      sentAt: now,
    });

    return NextResponse.json({
      success: true,
      prospectId,
      internalNo,
      duplicateCandidates: duplicateCandidates.length > 0 ? duplicateCandidates : undefined,
      notificationSent,
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET は許可しない
export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed' },
    { status: 405 }
  );
}
