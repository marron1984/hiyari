// AI副社長 アクション実行API
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { isAiVpOwner } from '@/lib/auth';
import { sendLineWorksMessage } from '@/lib/lineworks';
import type { ActionType, ProposedInquiry, ProposedHiyarihat, ProposedKaizen, ProposedRingi, ProposedLineWorksAlert } from '@/types/ai-vp';

const DEFAULT_TENANT_ID = 'defaultTenant';

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

    // AI副社長オーナーチェック
    if (!isAiVpOwner(decodedToken.email)) {
      return NextResponse.json({ error: 'AI副社長へのアクセス権限がありません' }, { status: 403 });
    }

    // リクエストボディ解析
    const body = await request.json();
    const { actionType, extractionId, payload } = body as {
      actionType: ActionType;
      extractionId: string;
      payload: Record<string, unknown>;
    };

    if (!actionType || !extractionId || !payload) {
      return NextResponse.json({ error: 'actionType, extractionId, payloadは必須です' }, { status: 400 });
    }

    // ユーザー情報取得
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userName = userData?.name || userData?.displayName || decodedToken.email || 'Unknown';
    const userBranchId = userData?.branchId || 'default';

    // アクションレコード作成
    const actionData = {
      tenantId: DEFAULT_TENANT_ID,
      extractionId,
      actionType,
      payload,
      status: 'queued',
      createdAt: FieldValue.serverTimestamp(),
    };

    const actionRef = await getAdminDb().collection('aiVpActions').add(actionData);

    // アクション実行
    let result: { targetEntityType: string; targetEntityId: string } | null = null;
    let errorText: string | null = null;

    try {
      switch (actionType) {
        case 'create_inquiry':
          result = await createInquiry(payload as unknown as ProposedInquiry, decodedToken.uid, userName);
          break;
        case 'create_hiyarihat':
          result = await createHiyarihat(payload as unknown as ProposedHiyarihat, decodedToken.uid, userName, userBranchId);
          break;
        case 'create_kaizen':
          result = await createKaizen(payload as unknown as ProposedKaizen, decodedToken.uid, userName, userBranchId);
          break;
        case 'create_ringi':
          result = await createRingi(payload as unknown as ProposedRingi, decodedToken.uid, userName, userBranchId);
          break;
        case 'notify_lineworks':
          result = await notifyLineWorks(payload as unknown as ProposedLineWorksAlert);
          break;
        default:
          throw new Error(`未対応のアクションタイプ: ${actionType}`);
      }
    } catch (execError) {
      errorText = execError instanceof Error ? execError.message : 'アクション実行エラー';
    }

    // アクション結果更新
    if (result) {
      await actionRef.update({
        status: 'done',
        targetEntityType: result.targetEntityType,
        targetEntityId: result.targetEntityId,
        executedAt: FieldValue.serverTimestamp(),
      });

      // 監査ログ
      await getAdminDb().collection('aiVpAuditLogs').add({
        tenantId: DEFAULT_TENANT_ID,
        actorUserId: decodedToken.uid,
        actorUserName: userName,
        eventType: 'action_executed',
        eventMeta: {
          actionId: actionRef.id,
          actionType,
          targetEntityType: result.targetEntityType,
          targetEntityId: result.targetEntityId,
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        success: true,
        actionId: actionRef.id,
        ...result,
      });
    } else {
      await actionRef.update({
        status: 'failed',
        errorText,
        executedAt: FieldValue.serverTimestamp(),
      });

      // 監査ログ
      await getAdminDb().collection('aiVpAuditLogs').add({
        tenantId: DEFAULT_TENANT_ID,
        actorUserId: decodedToken.uid,
        actorUserName: userName,
        eventType: 'action_failed',
        eventMeta: {
          actionId: actionRef.id,
          actionType,
          errorText,
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        success: false,
        actionId: actionRef.id,
        error: errorText,
      }, { status: 500 });
    }

  } catch (error) {
    console.error('AI VP action API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ========================================
// アクション実行関数
// ========================================

/**
 * 入居希望者を作成
 */
async function createInquiry(
  inquiry: ProposedInquiry,
  userId: string,
  userName: string
): Promise<{ targetEntityType: string; targetEntityId: string }> {
  const prospectData = {
    tenantId: DEFAULT_TENANT_ID,
    status: '新規',
    customerName: inquiry.customerName || '名前未登録',
    age: inquiry.age,
    gender: inquiry.gender,
    careLevel: inquiry.careLevel,
    budget: inquiry.budget,
    currentSituation: inquiry.currentSituation,
    desiredFacility: inquiry.desiredFacility,
    interviewDateTime: inquiry.tourRequestDate,
    salesCompanyName: inquiry.salesCompanyName,
    salesRepName: inquiry.salesRepName,
    otherNotes: inquiry.otherNotes,
    source: 'ai_vp',
    createdBy: userId,
    createdByName: userName,
    receivedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const docRef = await getAdminDb().collection('prospects').add(prospectData);

  return {
    targetEntityType: 'prospect',
    targetEntityId: docRef.id,
  };
}

/**
 * ヒヤリハットを作成
 */
async function createHiyarihat(
  hiyarihat: ProposedHiyarihat,
  userId: string,
  userName: string,
  branchId: string
): Promise<{ targetEntityType: string; targetEntityId: string }> {
  // 日付パース
  let incidentDate = new Date();
  if (hiyarihat.date) {
    const parsed = new Date(hiyarihat.date);
    if (!isNaN(parsed.getTime())) {
      incidentDate = parsed;
    }
  }

  const incidentData = {
    tenantId: DEFAULT_TENANT_ID,
    branchId,
    userId,
    userName,
    date: Timestamp.fromDate(incidentDate),
    timeSlot: hiyarihat.timeSlot || '日中',
    category: hiyarihat.category || 'その他',
    severity: hiyarihat.severity || 2,
    description: hiyarihat.body,
    action: hiyarihat.action || '',
    prevention: hiyarihat.prevention || '',
    source: 'ai_vp',
    isApproved: false,
    isFraud: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const docRef = await getAdminDb().collection('incidents').add(incidentData);

  return {
    targetEntityType: 'incident',
    targetEntityId: docRef.id,
  };
}

/**
 * 改善アイデアを作成
 */
async function createKaizen(
  kaizen: ProposedKaizen,
  userId: string,
  userName: string,
  branchId: string
): Promise<{ targetEntityType: string; targetEntityId: string }> {
  const improvementData = {
    tenantId: DEFAULT_TENANT_ID,
    branchId,
    authorId: userId,
    authorName: userName,
    title: kaizen.title,
    description: kaizen.body,
    category: kaizen.category || 'その他',
    status: 'submitted',
    likes: [],
    likeCount: 0,
    commentCount: 0,
    source: 'ai_vp',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const docRef = await getAdminDb().collection('improvements').add(improvementData);

  return {
    targetEntityType: 'improvement',
    targetEntityId: docRef.id,
  };
}

/**
 * 稟議を作成（下書き状態）
 */
async function createRingi(
  ringi: ProposedRingi,
  userId: string,
  userName: string,
  branchId: string
): Promise<{ targetEntityType: string; targetEntityId: string }> {
  const ringiData = {
    tenantId: DEFAULT_TENANT_ID,
    branchId,
    createdBy: userId,
    createdByName: userName,
    title: ringi.title,
    category: ringi.category || '経費',
    body: ringi.body,
    amount: ringi.amount,
    status: 'draft',
    source: 'ai_vp',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const docRef = await getAdminDb().collection('ringis').add(ringiData);

  return {
    targetEntityType: 'ringi',
    targetEntityId: docRef.id,
  };
}

/**
 * LINE WORKS通知を送信
 */
async function notifyLineWorks(
  alert: ProposedLineWorksAlert
): Promise<{ targetEntityType: string; targetEntityId: string }> {
  const groupId = alert.groupId || process.env.LINEWORKS_GROUP_ID;

  if (!groupId) {
    throw new Error('LINE WORKSグループIDが設定されていません');
  }

  // 緊急度に応じたプレフィックス
  const urgencyPrefix = alert.urgency === 'high' ? '【緊急】' : alert.urgency === 'mid' ? '【重要】' : '';
  const message = `${urgencyPrefix}[AI副社長]\n${alert.message}`;

  await sendLineWorksMessage(groupId, message);

  return {
    targetEntityType: 'lineworks_notification',
    targetEntityId: `${groupId}_${Date.now()}`,
  };
}
