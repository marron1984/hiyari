// ======== AI副社長 LINE WORKSメッセージ処理 ========

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { isAiVpOwner } from './auth';
import {
  LwMessage,
  LwThread,
  AiReply,
  AiTemplate,
  AiApproval,
  AiReplyRiskLevel,
  AiReplyCategory,
  AiReplyStatus,
  AI_REPLY_FOOTER,
} from '@/types/ai-vp';

function getDb() {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

// ======== 権限チェック ========

function assertAiVpOwner(email?: string): void {
  if (!isAiVpOwner(email)) {
    throw new Error('AI副社長機能へのアクセス権限がありません');
  }
}

// ======== LINE WORKSメッセージ ========

/**
 * LINE WORKSメッセージを保存
 */
export async function saveLwMessage(
  data: {
    messageId: string;
    roomId: string;
    threadId?: string;
    senderId: string;
    senderName: string;
    senderRole?: 'staff' | 'manager' | 'exec';
    text: string;
    attachmentsJson?: string;
  },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<LwMessage> {
  const firestore = getDb();

  const now = Timestamp.now();
  const docData = {
    tenantId,
    ...data,
    receivedAt: now,
    createdAt: now,
  };

  const docRef = await addDoc(collection(firestore, 'lwMessages'), docData);

  return {
    id: docRef.id,
    ...data,
    receivedAt: new Date(),
    createdAt: new Date(),
  };
}

/**
 * LINE WORKSメッセージを取得
 */
export async function getLwMessage(
  id: string,
  userEmail: string
): Promise<LwMessage | null> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const docRef = doc(firestore, 'lwMessages', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    messageId: data.messageId,
    roomId: data.roomId,
    threadId: data.threadId,
    senderId: data.senderId,
    senderName: data.senderName,
    senderRole: data.senderRole,
    text: data.text,
    attachmentsJson: data.attachmentsJson,
    receivedAt: data.receivedAt?.toDate() || new Date(),
    createdAt: data.createdAt?.toDate() || new Date(),
  };
}

/**
 * LINE WORKSメッセージ一覧を取得
 */
export async function getLwMessages(
  userEmail: string,
  limitCount: number = 50,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<LwMessage[]> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const q = query(
    collection(firestore, 'lwMessages'),
    where('tenantId', '==', tenantId),
    orderBy('receivedAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      messageId: data.messageId,
      roomId: data.roomId,
      threadId: data.threadId,
      senderId: data.senderId,
      senderName: data.senderName,
      senderRole: data.senderRole,
      text: data.text,
      attachmentsJson: data.attachmentsJson,
      receivedAt: data.receivedAt?.toDate() || new Date(),
      createdAt: data.createdAt?.toDate() || new Date(),
    };
  });
}

// ======== AI返信 ========

/**
 * AI返信を作成
 */
export async function createAiReply(
  data: {
    messageId: string;
    riskLevel: AiReplyRiskLevel;
    category: AiReplyCategory;
    draftText: string;
    templateId?: string;
    escalationReason?: string;
  },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiReply> {
  const firestore = getDb();

  // L1は自動的にsent可能状態、L2/L3は承認待ち
  const status: AiReplyStatus = data.riskLevel === 'L1' ? 'draft' : 'pending_approval';

  const now = Timestamp.now();
  const docData = {
    tenantId,
    ...data,
    status,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(collection(firestore, 'aiReplies'), docData);

  return {
    id: docRef.id,
    ...data,
    status,
    createdAt: new Date(),
  };
}

/**
 * AI返信を取得
 */
export async function getAiReply(
  id: string,
  userEmail: string
): Promise<AiReply | null> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const docRef = doc(firestore, 'aiReplies', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    messageId: data.messageId,
    riskLevel: data.riskLevel,
    category: data.category,
    draftText: data.draftText,
    finalText: data.finalText,
    status: data.status,
    referencesJson: data.referencesJson,
    templateId: data.templateId,
    modelConfigVersion: data.modelConfigVersion,
    escalationReason: data.escalationReason,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate(),
    sentAt: data.sentAt?.toDate(),
  };
}

/**
 * AI返信一覧を取得（メッセージ付き）
 */
export async function getAiRepliesWithMessages(
  userEmail: string,
  filters?: {
    status?: AiReplyStatus;
    riskLevel?: AiReplyRiskLevel;
  },
  limitCount: number = 50,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<(LwMessage & { reply?: AiReply })[]> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  // メッセージを取得
  const messagesQuery = query(
    collection(firestore, 'lwMessages'),
    where('tenantId', '==', tenantId),
    orderBy('receivedAt', 'desc'),
    limit(limitCount)
  );
  const messagesSnapshot = await getDocs(messagesQuery);

  const messages: LwMessage[] = messagesSnapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      messageId: data.messageId,
      roomId: data.roomId,
      threadId: data.threadId,
      senderId: data.senderId,
      senderName: data.senderName,
      senderRole: data.senderRole,
      text: data.text,
      attachmentsJson: data.attachmentsJson,
      receivedAt: data.receivedAt?.toDate() || new Date(),
      createdAt: data.createdAt?.toDate() || new Date(),
    };
  });

  // 返信を取得
  const repliesQuery = query(
    collection(firestore, 'aiReplies'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
    limit(limitCount * 2)
  );
  const repliesSnapshot = await getDocs(repliesQuery);

  const repliesMap = new Map<string, AiReply>();
  repliesSnapshot.docs.forEach((d) => {
    const data = d.data();
    const reply: AiReply = {
      id: d.id,
      messageId: data.messageId,
      riskLevel: data.riskLevel,
      category: data.category,
      draftText: data.draftText,
      finalText: data.finalText,
      status: data.status,
      referencesJson: data.referencesJson,
      templateId: data.templateId,
      escalationReason: data.escalationReason,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
      sentAt: data.sentAt?.toDate(),
    };
    repliesMap.set(data.messageId, reply);
  });

  // メッセージと返信を結合
  let results = messages.map((msg) => ({
    ...msg,
    reply: repliesMap.get(msg.id),
  }));

  // フィルター適用
  if (filters?.status) {
    results = results.filter((r) => r.reply?.status === filters.status);
  }
  if (filters?.riskLevel) {
    results = results.filter((r) => r.reply?.riskLevel === filters.riskLevel);
  }

  return results;
}

/**
 * AI返信を更新
 */
export async function updateAiReply(
  id: string,
  updates: {
    draftText?: string;
    finalText?: string;
    status?: AiReplyStatus;
  },
  userEmail: string
): Promise<void> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const updateData: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
  };

  if (updates.draftText !== undefined) {
    updateData.draftText = updates.draftText;
  }
  if (updates.finalText !== undefined) {
    updateData.finalText = updates.finalText;
  }
  if (updates.status !== undefined) {
    updateData.status = updates.status;
    if (updates.status === 'sent') {
      updateData.sentAt = Timestamp.now();
    }
  }

  await updateDoc(doc(firestore, 'aiReplies', id), updateData);
}

// ======== AI承認 ========

/**
 * AI承認を作成
 */
export async function createAiApproval(
  data: {
    replyId: string;
    approverId: string;
    approverName: string;
    decision: 'approve' | 'revise' | 'reject';
    note?: string;
    revisedText?: string;
  },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiApproval> {
  const firestore = getDb();

  const now = Timestamp.now();
  const docData = {
    tenantId,
    ...data,
    decidedAt: now,
    createdAt: now,
  };

  const docRef = await addDoc(collection(firestore, 'aiApprovals'), docData);

  return {
    id: docRef.id,
    ...data,
    decidedAt: new Date(),
    createdAt: new Date(),
  };
}

/**
 * AI承認履歴を取得
 */
export async function getAiApprovals(
  replyId: string,
  userEmail: string
): Promise<AiApproval[]> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const q = query(
    collection(firestore, 'aiApprovals'),
    where('replyId', '==', replyId),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      replyId: data.replyId,
      approverId: data.approverId,
      approverName: data.approverName,
      decision: data.decision,
      note: data.note,
      revisedText: data.revisedText,
      decidedAt: data.decidedAt?.toDate() || new Date(),
      createdAt: data.createdAt?.toDate() || new Date(),
    };
  });
}

// ======== FAQテンプレート ========

/**
 * FAQテンプレート一覧を取得
 */
export async function getAiTemplates(
  userEmail: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiTemplate[]> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const q = query(
    collection(firestore, 'aiTemplates'),
    where('tenantId', '==', tenantId),
    orderBy('category', 'asc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      key: data.key,
      title: data.title,
      category: data.category,
      riskLevel: data.riskLevel,
      requiredFieldsJson: data.requiredFieldsJson,
      templateText: data.templateText,
      keywords: data.keywords,
      createdAt: data.createdAt?.toDate() || new Date(),
    };
  });
}

/**
 * テンプレートをキーワードで検索
 */
export async function findMatchingTemplate(
  text: string,
  templates: AiTemplate[]
): Promise<AiTemplate | null> {
  const normalizedText = text.toLowerCase();

  // キーワードマッチングでスコアリング
  const scored = templates.map((tpl) => {
    let score = 0;
    if (tpl.keywords) {
      for (const keyword of tpl.keywords) {
        if (normalizedText.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }
    }
    return { template: tpl, score };
  });

  // スコアが最も高いテンプレートを返す
  scored.sort((a, b) => b.score - a.score);

  if (scored[0]?.score > 0) {
    return scored[0].template;
  }

  return null;
}

// ======== リスク判定 ========

/**
 * メッセージのリスクレベルを判定
 */
export function determineRiskLevel(text: string): AiReplyRiskLevel {
  const normalizedText = text.toLowerCase();

  // L3キーワード（高リスク）
  const l3Keywords = [
    '返金', '払い戻し', 'キャンセル',
    '契約', '支払い', '請求', '振込',
    '採用', '解雇', '退職', '懲戒',
    'クレーム', '苦情', 'トラブル',
    '事故', '怪我', '救急',
    '行政', '法務', '弁護士', '監査',
    '医療', '診断', '処置',
  ];

  for (const keyword of l3Keywords) {
    if (normalizedText.includes(keyword)) {
      return 'L3';
    }
  }

  // L2キーワード（中リスク）
  const l2Keywords = [
    '紹介会社', '家族', 'ご家族',
    '経費', '購入', '立替',
    '残業', '休暇', '有給',
    '例外', '特別',
  ];

  for (const keyword of l2Keywords) {
    if (normalizedText.includes(keyword)) {
      return 'L2';
    }
  }

  // それ以外はL1
  return 'L1';
}

/**
 * メッセージのカテゴリを判定
 */
export function determineCategory(text: string): AiReplyCategory {
  const normalizedText = text.toLowerCase();

  // カテゴリキーワードマッピング
  const categoryKeywords: Record<AiReplyCategory, string[]> = {
    nyukyo: ['入居', '見学', '書類', '契約', '退去'],
    sales: ['紹介会社', '営業', '案件', '見込み'],
    expense: ['経費', '支払い', '返金', '請求', '立替', '購入'],
    hr: ['採用', '退職', '労務', '残業', '休暇', '有給', '給与'],
    risk: ['クレーム', '事故', '苦情', 'トラブル', '行政', '法務'],
    ops: ['打刻', '勤怠', 'シフト', 'パスワード', 'システム', '手順', '方法'],
    general: [],
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (normalizedText.includes(keyword)) {
        return category as AiReplyCategory;
      }
    }
  }

  return 'general';
}

// ======== AI返信生成 ========

/**
 * テンプレートから返信を生成
 */
export function generateReplyFromTemplate(
  template: AiTemplate,
  _message: LwMessage
): string {
  // テンプレートテキストを基本に返信を生成
  let reply = template.templateText;

  // 不足情報の質問を追加
  if (template.requiredFieldsJson) {
    try {
      const requiredFields = JSON.parse(template.requiredFieldsJson) as string[];
      if (requiredFields.length > 0) {
        reply += '\n\n【確認させてください】\n';
        requiredFields.forEach((field, idx) => {
          reply += `${idx + 1}. ${field}\n`;
        });
      }
    } catch {
      // JSON parse error - skip
    }
  }

  // フッター追加
  reply += `\n\n※ ${AI_REPLY_FOOTER}`;

  return reply;
}

/**
 * デフォルト返信を生成
 */
export function generateDefaultReply(
  category: AiReplyCategory,
  riskLevel: AiReplyRiskLevel
): string {
  if (riskLevel === 'L3') {
    return `ご質問ありがとうございます。

この内容は重要な判断が必要なため、吉田に確認します。

しばらくお待ちください。

※ ${AI_REPLY_FOOTER}`;
  }

  if (riskLevel === 'L2') {
    return `ご質問ありがとうございます。

確認の上、追ってご連絡いたします。

※ ${AI_REPLY_FOOTER}`;
  }

  // L1
  return `ご質問ありがとうございます。

詳細を確認中です。しばらくお待ちください。

※ ${AI_REPLY_FOOTER}`;
}

// ======== 監査ログ ========

/**
 * AI返信の監査ログを作成
 */
export async function createAiReplyAuditLog(
  data: {
    replyId: string;
    action: string;
    actorId?: string;
    actorName?: string;
    details?: Record<string, unknown>;
    dryRun?: boolean;
  },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<void> {
  const firestore = getDb();

  await addDoc(collection(firestore, 'aiReplyAuditLogs'), {
    tenantId,
    ...data,
    createdAt: Timestamp.now(),
  });
}
