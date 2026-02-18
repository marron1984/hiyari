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
import { toDate } from './date';
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
    receivedAt: toDate(data.receivedAt) || new Date(),
    createdAt: toDate(data.createdAt) || new Date(),
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
      receivedAt: toDate(data.receivedAt) || new Date(),
      createdAt: toDate(data.createdAt) || new Date(),
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
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) ?? undefined,
    sentAt: toDate(data.sentAt) ?? undefined,
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
      receivedAt: toDate(data.receivedAt) || new Date(),
      createdAt: toDate(data.createdAt) || new Date(),
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
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) ?? undefined,
      sentAt: toDate(data.sentAt) ?? undefined,
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
      decidedAt: toDate(data.decidedAt) || new Date(),
      createdAt: toDate(data.createdAt) || new Date(),
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
      createdAt: toDate(data.createdAt) || new Date(),
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
 * リスク判定ルール定義
 * weight: スコア重み（高いほど高リスク寄与）
 * negationPenalty: 否定文脈で検出された場合のスコア減算
 */
interface RiskKeywordRule {
  keyword: string;
  weight: number;
  domain: 'finance' | 'hr' | 'legal' | 'safety' | 'reputation' | 'medical' | 'compliance';
}

/**
 * 同義語グループ: メインキーワードに対する別表現
 * リスク判定時にメインキーワードだけでなく同義語も検出対象にする
 */
const RISK_SYNONYMS: Record<string, string[]> = {
  // HR
  '解雇': ['リストラ', 'クビ', '首切り', '雇い止め'],
  '懲戒': ['処分', '訓告', '戒告', '減給処分'],
  'パワハラ': ['パワーハラスメント', '威圧', '恫喝'],
  'セクハラ': ['セクシャルハラスメント', '性的嫌がらせ'],
  '退職勧奨': ['肩たたき', '希望退職'],
  // Safety
  '事故': ['アクシデント', 'インシデント'],
  '怪我': ['けが', 'ケガ', '負傷', '外傷'],
  '骨折': ['ヒビ', '亀裂骨折'],
  '転倒': ['転落', '滑落', 'すべり'],
  '誤薬': ['薬の間違い', '投薬ミス', '服薬ミス'],
  '行方不明': ['所在不明', '不明者', '居場所不明'],
  '離設': ['無断外出', '脱走'],
  // Finance
  '返金': ['払い戻し', '返却金', '返還'],
  '損害賠償': ['賠償請求', '賠償金'],
  '未払い': ['滞納', '未納', '不払い'],
  // Legal
  '訴訟': ['裁判', '法的手続き'],
  '弁護士': ['法律事務所', '顧問弁護士'],
  // Medical
  '容体急変': ['急変', '状態急変', '体調急変'],
  '死亡': ['お亡くなり', '逝去', '永眠'],
  // Reputation
  'クレーム': ['苦情', '不満', '抗議'],
};

/** ドメイン別の重み倍率（安全・医療系は高リスク） */
const DOMAIN_WEIGHT_MULTIPLIERS: Record<string, number> = {
  safety: 1.3,
  medical: 1.3,
  legal: 1.2,
  compliance: 1.1,
  hr: 1.0,
  finance: 1.0,
  reputation: 0.9,
};

/**
 * キーワードまたはその同義語がテキストに含まれるかチェック
 */
function matchesKeywordOrSynonym(text: string, keyword: string): boolean {
  if (text.includes(keyword)) return true;
  const synonyms = RISK_SYNONYMS[keyword];
  if (synonyms) {
    return synonyms.some((syn) => text.includes(syn));
  }
  return false;
}

/**
 * キーワードまたはその同義語の位置を取得（否定文脈チェック用）
 */
function findKeywordOrSynonymIndex(text: string, keyword: string): number {
  const idx = text.indexOf(keyword);
  if (idx >= 0) return idx;
  const synonyms = RISK_SYNONYMS[keyword];
  if (synonyms) {
    for (const syn of synonyms) {
      const synIdx = text.indexOf(syn);
      if (synIdx >= 0) return synIdx;
    }
  }
  return -1;
}

/** 否定文脈パターン: これに続くキーワードはリスクを下げる */
const NEGATION_PATTERNS = [
  'ない', 'ません', 'なし', '不要', '問題なく', '心配なく',
  'ありません', '大丈夫', '解決済み', '対応済み', '完了',
];

/** 低リスク文脈パターン: これらが含まれるとリスクスコアを緩和 */
const LOW_RISK_CONTEXT = [
  '確認方法', '手順', 'マニュアル', 'やり方', '教えて',
  '方法を', 'どうやって', 'どこに', 'どこで', 'いつまで',
  '研修', '勉強会', '予定', 'スケジュール', '一覧',
];

const L3_RULES: RiskKeywordRule[] = [
  // 金銭: 返金・解約等
  { keyword: '返金', weight: 10, domain: 'finance' },
  { keyword: '払い戻し', weight: 10, domain: 'finance' },
  { keyword: 'キャンセル', weight: 8, domain: 'finance' },
  { keyword: '解約', weight: 9, domain: 'finance' },
  { keyword: '損害賠償', weight: 12, domain: 'finance' },
  { keyword: '未払い', weight: 8, domain: 'finance' },
  { keyword: '滞納', weight: 8, domain: 'finance' },
  { keyword: '違約金', weight: 10, domain: 'finance' },
  // 人事: 解雇・懲戒等
  { keyword: '解雇', weight: 12, domain: 'hr' },
  { keyword: '懲戒', weight: 12, domain: 'hr' },
  { keyword: '退職届', weight: 9, domain: 'hr' },
  { keyword: '退職勧奨', weight: 11, domain: 'hr' },
  { keyword: 'パワハラ', weight: 11, domain: 'hr' },
  { keyword: 'セクハラ', weight: 11, domain: 'hr' },
  { keyword: 'ハラスメント', weight: 11, domain: 'hr' },
  { keyword: '労基署', weight: 10, domain: 'hr' },
  { keyword: '労働基準', weight: 10, domain: 'hr' },
  { keyword: '不当解雇', weight: 12, domain: 'hr' },
  // 法務・契約
  { keyword: '契約書', weight: 8, domain: 'legal' },
  { keyword: '弁護士', weight: 10, domain: 'legal' },
  { keyword: '訴訟', weight: 12, domain: 'legal' },
  { keyword: '裁判', weight: 12, domain: 'legal' },
  { keyword: '告訴', weight: 12, domain: 'legal' },
  { keyword: '内容証明', weight: 10, domain: 'legal' },
  { keyword: '示談', weight: 9, domain: 'legal' },
  // 安全
  { keyword: '事故', weight: 10, domain: 'safety' },
  { keyword: '怪我', weight: 9, domain: 'safety' },
  { keyword: '救急', weight: 11, domain: 'safety' },
  { keyword: '転倒', weight: 8, domain: 'safety' },
  { keyword: '骨折', weight: 10, domain: 'safety' },
  { keyword: '誤薬', weight: 11, domain: 'safety' },
  { keyword: '誤嚥', weight: 10, domain: 'safety' },
  { keyword: '窒息', weight: 12, domain: 'safety' },
  { keyword: '行方不明', weight: 12, domain: 'safety' },
  { keyword: '離設', weight: 11, domain: 'safety' },
  { keyword: '徘徊', weight: 8, domain: 'safety' },
  { keyword: '火災', weight: 12, domain: 'safety' },
  // 評判
  { keyword: 'クレーム', weight: 9, domain: 'reputation' },
  { keyword: '苦情', weight: 9, domain: 'reputation' },
  { keyword: '新聞', weight: 8, domain: 'reputation' },
  { keyword: 'マスコミ', weight: 10, domain: 'reputation' },
  { keyword: 'SNS', weight: 7, domain: 'reputation' },
  { keyword: '口コミ', weight: 6, domain: 'reputation' },
  // 医療
  { keyword: '医療判断', weight: 10, domain: 'medical' },
  { keyword: '医療事故', weight: 12, domain: 'medical' },
  { keyword: '容体急変', weight: 11, domain: 'medical' },
  { keyword: '意識不明', weight: 12, domain: 'medical' },
  { keyword: '心肺停止', weight: 12, domain: 'medical' },
  { keyword: '死亡', weight: 12, domain: 'medical' },
  // 行政
  { keyword: '行政指導', weight: 10, domain: 'compliance' },
  { keyword: '行政からの指導', weight: 10, domain: 'compliance' },
  { keyword: '監査指摘', weight: 9, domain: 'compliance' },
  { keyword: '改善命令', weight: 11, domain: 'compliance' },
  { keyword: '業務停止', weight: 12, domain: 'compliance' },
  { keyword: '取消', weight: 10, domain: 'compliance' },
  { keyword: '指定取消', weight: 12, domain: 'compliance' },
];

const L2_RULES: RiskKeywordRule[] = [
  // 家族・紹介
  { keyword: '紹介会社', weight: 6, domain: 'reputation' },
  { keyword: 'ご家族', weight: 5, domain: 'reputation' },
  { keyword: '家族', weight: 4, domain: 'reputation' },
  { keyword: '苦言', weight: 6, domain: 'reputation' },
  // 経費
  { keyword: '経費', weight: 4, domain: 'finance' },
  { keyword: '購入', weight: 3, domain: 'finance' },
  { keyword: '立替', weight: 4, domain: 'finance' },
  { keyword: '見積', weight: 3, domain: 'finance' },
  { keyword: '発注', weight: 4, domain: 'finance' },
  { keyword: '稟議', weight: 5, domain: 'finance' },
  { keyword: '予算', weight: 4, domain: 'finance' },
  // 人事
  { keyword: '採用', weight: 5, domain: 'hr' },
  { keyword: '退職', weight: 6, domain: 'hr' },
  { keyword: '残業', weight: 4, domain: 'hr' },
  { keyword: '休暇', weight: 3, domain: 'hr' },
  { keyword: '有給', weight: 3, domain: 'hr' },
  { keyword: '給与', weight: 5, domain: 'hr' },
  { keyword: '賞与', weight: 5, domain: 'hr' },
  { keyword: '昇給', weight: 4, domain: 'hr' },
  { keyword: '人事異動', weight: 6, domain: 'hr' },
  // 契約（情報確認レベル）
  { keyword: '契約', weight: 5, domain: 'finance' },
  { keyword: '支払い', weight: 4, domain: 'finance' },
  { keyword: '請求', weight: 4, domain: 'finance' },
  { keyword: '振込', weight: 4, domain: 'finance' },
  // 行政（情報確認レベル）
  { keyword: '行政', weight: 5, domain: 'compliance' },
  { keyword: '監査', weight: 5, domain: 'compliance' },
  { keyword: '法務', weight: 5, domain: 'legal' },
  // 医療（情報確認レベル）
  { keyword: '医療', weight: 4, domain: 'medical' },
  { keyword: '診断', weight: 4, domain: 'medical' },
  { keyword: '処置', weight: 4, domain: 'medical' },
  { keyword: '投薬', weight: 4, domain: 'medical' },
  // 例外処理
  { keyword: '例外', weight: 4, domain: 'compliance' },
  { keyword: '特別対応', weight: 5, domain: 'compliance' },
];

/** L3閾値（この点数以上でL3） */
const L3_THRESHOLD = 8;
/** L2閾値（この点数以上でL2） */
const L2_THRESHOLD = 4;

/**
 * 否定文脈でキーワードが使われているか検出
 * キーワード（または同義語）の前後30文字以内に否定表現があればtrue
 */
function isInNegationContext(text: string, keyword: string): boolean {
  const idx = findKeywordOrSynonymIndex(text, keyword);
  if (idx < 0) return false;

  // キーワード前後の文脈を取得（30文字に拡大）
  const contextStart = Math.max(0, idx - 30);
  const contextEnd = Math.min(text.length, idx + keyword.length + 30);
  const context = text.slice(contextStart, contextEnd);

  return NEGATION_PATTERNS.some((neg) => context.includes(neg));
}

/**
 * 低リスク文脈（質問・手順確認等）かを判定
 */
function isLowRiskContext(text: string): boolean {
  let lowRiskCount = 0;
  for (const pattern of LOW_RISK_CONTEXT) {
    if (text.includes(pattern)) lowRiskCount++;
  }
  return lowRiskCount >= 2;
}

/**
 * メッセージのリスクレベルを判定
 *
 * スコアベースの多段階判定:
 * 1. L3/L2キーワードの重み付きスコアを計算
 * 2. 否定文脈の場合はスコアを減算
 * 3. 低リスク文脈（手順確認等）の場合はスコアを緩和
 * 4. 複数ドメイン該当で追加スコア（複合リスク）
 * 5. 閾値判定でL1/L2/L3を決定
 */
export function determineRiskLevel(text: string): AiReplyRiskLevel {
  let l3Score = 0;
  let l2Score = 0;
  const matchedDomains = new Set<string>();

  // L3キーワードスキャン（同義語対応）
  for (const rule of L3_RULES) {
    if (matchesKeywordOrSynonym(text, rule.keyword)) {
      const inNeg = isInNegationContext(text, rule.keyword);
      const domainMultiplier = DOMAIN_WEIGHT_MULTIPLIERS[rule.domain] || 1.0;
      const baseWeight = inNeg ? Math.max(rule.weight - 6, 1) : rule.weight;
      l3Score += Math.round(baseWeight * domainMultiplier);
      matchedDomains.add(rule.domain);
    }
  }

  // L2キーワードスキャン（同義語対応）
  for (const rule of L2_RULES) {
    if (matchesKeywordOrSynonym(text, rule.keyword)) {
      const inNeg = isInNegationContext(text, rule.keyword);
      const domainMultiplier = DOMAIN_WEIGHT_MULTIPLIERS[rule.domain] || 1.0;
      const baseWeight = inNeg ? Math.max(rule.weight - 3, 0) : rule.weight;
      l2Score += Math.round(baseWeight * domainMultiplier);
      matchedDomains.add(rule.domain);
    }
  }

  // 複合ドメインボーナス: 2ドメイン以上同時ヒットで追加リスク
  if (matchedDomains.size >= 3) {
    l3Score += 4;
  } else if (matchedDomains.size >= 2) {
    l3Score += 2;
  }

  // 低リスク文脈（手順・確認の質問）ならスコアを半減
  if (isLowRiskContext(text)) {
    l3Score = Math.floor(l3Score * 0.5);
    l2Score = Math.floor(l2Score * 0.5);
  }

  // 閾値判定
  if (l3Score >= L3_THRESHOLD) {
    return 'L3';
  }
  if (l2Score >= L2_THRESHOLD || l3Score >= L2_THRESHOLD) {
    return 'L2';
  }

  return 'L1';
}

/**
 * リスク判定の詳細スコアを返す（デバッグ・監査用）
 */
export function determineRiskLevelDetailed(text: string): {
  level: AiReplyRiskLevel;
  l3Score: number;
  l2Score: number;
  matchedDomains: string[];
  matchedKeywords: string[];
  negatedKeywords: string[];
  isLowRiskContext: boolean;
} {
  let l3Score = 0;
  let l2Score = 0;
  const matchedDomains = new Set<string>();
  const matchedKeywords: string[] = [];
  const negatedKeywords: string[] = [];

  for (const rule of L3_RULES) {
    if (matchesKeywordOrSynonym(text, rule.keyword)) {
      const inNeg = isInNegationContext(text, rule.keyword);
      const domainMultiplier = DOMAIN_WEIGHT_MULTIPLIERS[rule.domain] || 1.0;
      if (inNeg) {
        negatedKeywords.push(rule.keyword);
        l3Score += Math.round(Math.max(rule.weight - 6, 1) * domainMultiplier);
      } else {
        l3Score += Math.round(rule.weight * domainMultiplier);
      }
      matchedKeywords.push(rule.keyword);
      matchedDomains.add(rule.domain);
    }
  }

  for (const rule of L2_RULES) {
    if (matchesKeywordOrSynonym(text, rule.keyword)) {
      const inNeg = isInNegationContext(text, rule.keyword);
      const domainMultiplier = DOMAIN_WEIGHT_MULTIPLIERS[rule.domain] || 1.0;
      if (inNeg) {
        negatedKeywords.push(rule.keyword);
        l2Score += Math.round(Math.max(rule.weight - 3, 0) * domainMultiplier);
      } else {
        l2Score += Math.round(rule.weight * domainMultiplier);
      }
      matchedKeywords.push(rule.keyword);
      matchedDomains.add(rule.domain);
    }
  }

  if (matchedDomains.size >= 3) l3Score += 4;
  else if (matchedDomains.size >= 2) l3Score += 2;

  const lowRisk = isLowRiskContext(text);
  if (lowRisk) {
    l3Score = Math.floor(l3Score * 0.5);
    l2Score = Math.floor(l2Score * 0.5);
  }

  let level: AiReplyRiskLevel = 'L1';
  if (l3Score >= L3_THRESHOLD) level = 'L3';
  else if (l2Score >= L2_THRESHOLD || l3Score >= L2_THRESHOLD) level = 'L2';

  return {
    level,
    l3Score,
    l2Score,
    matchedDomains: Array.from(matchedDomains),
    matchedKeywords,
    negatedKeywords,
    isLowRiskContext: lowRisk,
  };
}

/**
 * メッセージのカテゴリを判定
 *
 * スコアベースの判定: 最もスコアが高いカテゴリを選択
 */
export function determineCategory(text: string): AiReplyCategory {
  // カテゴリキーワード（重み付き）
  const categoryRules: Record<Exclude<AiReplyCategory, 'general'>, { keyword: string; weight: number }[]> = {
    nyukyo: [
      { keyword: '入居', weight: 5 }, { keyword: '見学', weight: 5 },
      { keyword: '退去', weight: 4 }, { keyword: '空室', weight: 4 },
      { keyword: '入所', weight: 4 }, { keyword: '待機', weight: 3 },
      { keyword: 'ケアプラン', weight: 3 }, { keyword: '要介護', weight: 3 },
      { keyword: '利用者', weight: 2 }, { keyword: '入居者', weight: 3 },
    ],
    sales: [
      { keyword: '紹介会社', weight: 6 }, { keyword: '営業', weight: 4 },
      { keyword: '案件', weight: 3 }, { keyword: '見込み', weight: 3 },
      { keyword: '紹介', weight: 2 }, { keyword: '問い合わせ', weight: 2 },
      { keyword: '成約', weight: 4 }, { keyword: '商談', weight: 4 },
    ],
    expense: [
      { keyword: '経費', weight: 5 }, { keyword: '支払い', weight: 4 },
      { keyword: '返金', weight: 4 }, { keyword: '請求', weight: 4 },
      { keyword: '立替', weight: 5 }, { keyword: '購入', weight: 3 },
      { keyword: '見積', weight: 3 }, { keyword: '予算', weight: 3 },
      { keyword: '稟議', weight: 3 }, { keyword: '発注', weight: 3 },
      { keyword: '振込', weight: 4 }, { keyword: '納品', weight: 3 },
    ],
    hr: [
      { keyword: '採用', weight: 5 }, { keyword: '退職', weight: 5 },
      { keyword: '労務', weight: 5 }, { keyword: '残業', weight: 4 },
      { keyword: '休暇', weight: 4 }, { keyword: '有給', weight: 4 },
      { keyword: '給与', weight: 5 }, { keyword: '賞与', weight: 5 },
      { keyword: '面接', weight: 4 }, { keyword: 'シフト', weight: 3 },
      { keyword: '人事', weight: 4 }, { keyword: '異動', weight: 4 },
      { keyword: '昇給', weight: 4 }, { keyword: '社会保険', weight: 4 },
      { keyword: '雇用', weight: 4 }, { keyword: '研修', weight: 3 },
    ],
    risk: [
      { keyword: 'クレーム', weight: 6 }, { keyword: '事故', weight: 6 },
      { keyword: '苦情', weight: 5 }, { keyword: 'トラブル', weight: 4 },
      { keyword: '行政', weight: 4 }, { keyword: '法務', weight: 5 },
      { keyword: '弁護士', weight: 5 }, { keyword: '監査', weight: 4 },
      { keyword: '怪我', weight: 5 }, { keyword: '転倒', weight: 5 },
      { keyword: '誤薬', weight: 6 }, { keyword: '離設', weight: 5 },
      { keyword: '虐待', weight: 6 }, { keyword: '感染', weight: 4 },
    ],
    ops: [
      { keyword: '打刻', weight: 5 }, { keyword: '勤怠', weight: 4 },
      { keyword: 'パスワード', weight: 5 }, { keyword: 'システム', weight: 3 },
      { keyword: '手順', weight: 3 }, { keyword: '方法', weight: 2 },
      { keyword: 'ログイン', weight: 4 }, { keyword: 'エラー', weight: 3 },
      { keyword: '設定', weight: 2 }, { keyword: '操作', weight: 3 },
      { keyword: 'マニュアル', weight: 3 }, { keyword: 'アップロード', weight: 3 },
    ],
  };

  const scores: Record<string, number> = {};

  for (const [category, rules] of Object.entries(categoryRules)) {
    let score = 0;
    for (const rule of rules) {
      if (matchesKeywordOrSynonym(text, rule.keyword)) {
        score += rule.weight;
      }
    }
    scores[category] = score;
  }

  // 最高スコアのカテゴリを選択
  let bestCategory: AiReplyCategory = 'general';
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as AiReplyCategory;
    }
  }

  return bestCategory;
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

  // フッター追加（吉田署名）
  reply += `\n\n${AI_REPLY_FOOTER}`;

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

この内容は重要な判断が必要なので、確認して改めて連絡します。

しばらくお待ちください。

${AI_REPLY_FOOTER}`;
  }

  if (riskLevel === 'L2') {
    return `ご質問ありがとうございます。

確認の上、追ってご連絡いたします。

${AI_REPLY_FOOTER}`;
  }

  // L1
  return `ご質問ありがとうございます。

詳細を確認中です。しばらくお待ちください。

${AI_REPLY_FOOTER}`;
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

// ======== FAQテンプレート初期化 ========

/**
 * 初期FAQテンプレート（20本）
 */
export const INITIAL_TEMPLATES: Omit<AiTemplate, 'id' | 'createdAt'>[] = [
  // L1テンプレート（自動返信OK）
  {
    key: 'ops_document_submit',
    title: '書類提出方法',
    category: 'ops',
    riskLevel: 'L1',
    templateText: '書類の提出方法をご案内します。\n\n1. AA-HUBにログイン\n2. 「書類提出」メニューを選択\n3. 必要書類をアップロード\n\n不明点は管理者にお問い合わせください。',
    keywords: ['書類', '提出', 'アップロード', 'どこに'],
  },
  {
    key: 'ops_attendance_fix',
    title: '打刻修正方法',
    category: 'ops',
    riskLevel: 'L1',
    templateText: '打刻修正の手順をご案内します。\n\n1. 勤怠画面で「修正申請」を選択\n2. 修正理由を入力\n3. 管理者承認後に反映\n\n誤打刻が多い場合は管理者に相談してください。',
    keywords: ['打刻', '修正', '勤怠', '間違え'],
  },
  {
    key: 'ops_shift_check',
    title: 'シフト確認方法',
    category: 'ops',
    riskLevel: 'L1',
    templateText: 'シフトの確認方法をご案内します。\n\n1. AA-HUBの「勤怠」メニュー\n2. カレンダー表示でシフト確認\n3. 希望変更は管理者へ連絡\n\n急な変更は直接ご連絡ください。',
    keywords: ['シフト', '確認', '予定', 'スケジュール'],
  },
  {
    key: 'nyukyo_required_docs',
    title: '入居必要書類案内',
    category: 'nyukyo',
    riskLevel: 'L1',
    templateText: '入居に必要な書類は以下の通りです。\n\n■ 必須書類\n・身分証明書（写真付き）\n・健康保険証\n・介護保険証\n・診断書（3ヶ月以内）\n\n■ 該当者のみ\n・生活保護受給証明書\n・後見人関係書類\n\n詳細は担当者にご確認ください。',
    keywords: ['書類', '必要', '入居', '準備'],
  },
  {
    key: 'nyukyo_tour_guide',
    title: '見学案内',
    category: 'nyukyo',
    riskLevel: 'L1',
    templateText: '見学についてご案内します。\n\n■ 見学可能時間\n10:00〜16:00（要予約）\n\n■ 所要時間\n約1時間\n\n■ 持ち物\n特になし\n\n日程調整は担当者にご連絡ください。',
    keywords: ['見学', '案内', '予約', 'ツアー'],
  },
  {
    key: 'ops_password_reset',
    title: 'パスワードリセット',
    category: 'ops',
    riskLevel: 'L1',
    templateText: 'パスワードのリセット方法をご案内します。\n\n1. ログイン画面で「パスワードを忘れた」を選択\n2. 登録メールアドレスを入力\n3. 届いたメールのリンクから再設定\n\nメールが届かない場合は管理者にご連絡ください。',
    keywords: ['パスワード', 'リセット', 'ログイン', '忘れた'],
  },
  {
    key: 'ops_system_trouble',
    title: 'システムトラブル対応',
    category: 'ops',
    riskLevel: 'L1',
    templateText: 'システムトラブル時の対応をご案内します。\n\n■ まず試すこと\n1. ブラウザの更新（F5キー）\n2. キャッシュクリア\n3. 別ブラウザで試す\n\n解決しない場合は管理者に連絡してください。',
    keywords: ['システム', 'トラブル', 'エラー', '動かない'],
  },
  {
    key: 'general_consultation',
    title: '相談受付',
    category: 'general',
    riskLevel: 'L1',
    requiredFieldsJson: JSON.stringify(['相談内容', '緊急度']),
    templateText: 'ご相談ありがとうございます。\n\n内容を確認し、適切な担当者におつなぎします。\n\n■ 確認させてください\n・具体的な内容\n・緊急度（すぐ/今日中/今週中）\n\nお待ちください。',
    keywords: ['相談', '聞きたい', '確認', '質問'],
  },
  // L2テンプレート（管理者承認）
  {
    key: 'sales_referral_reply',
    title: '紹介会社への返信',
    category: 'sales',
    riskLevel: 'L2',
    templateText: '紹介会社への返信文案です。\n\n---\nいつもお世話になっております。\nご紹介いただいた件、以下の通りご報告いたします。\n\n[報告内容を記載]\n\n引き続きよろしくお願いいたします。\n---\n\n※ 管理者確認後に送信します。',
    keywords: ['紹介会社', '返信', '連絡', '報告'],
  },
  {
    key: 'sales_family_contact',
    title: 'ご家族への連絡',
    category: 'sales',
    riskLevel: 'L2',
    templateText: 'ご家族への連絡文案です。\n\n---\n○○様\n\nいつもお世話になっております。\n[連絡内容を記載]\n\nご不明点がございましたらお気軽にお問い合わせください。\n---\n\n※ 管理者確認後に送信します。',
    keywords: ['家族', '連絡', 'ご家族', '報告'],
  },
  {
    key: 'expense_small_purchase',
    title: '小口購入の確認',
    category: 'expense',
    riskLevel: 'L2',
    templateText: '小口購入についてご案内します。\n\n■ 1万円未満の場合\n・事後報告で対応可能\n・レシート保管必須\n\n■ 1万円以上の場合\n・事前承認が必要\n・稟議申請をしてください\n\n管理者に確認します。',
    keywords: ['購入', '経費', '買い物', '立替'],
  },
  {
    key: 'hr_overtime_request',
    title: '残業申請の確認',
    category: 'hr',
    riskLevel: 'L2',
    templateText: '残業申請についてご案内します。\n\n■ 事前申請が原則です\n1. AA-HUBで残業申請\n2. 理由と予定時間を入力\n3. 管理者承認後に残業\n\n■ 注意事項\n・月45時間を超える場合は要相談\n\n管理者に確認します。',
    keywords: ['残業', '申請', '超過', '延長'],
  },
  // L3テンプレート（吉田承認必須）
  {
    key: 'expense_refund',
    title: '返金対応',
    category: 'expense',
    riskLevel: 'L3',
    requiredFieldsJson: JSON.stringify(['契約書番号', '入居期間', '返金理由']),
    templateText: '返金に関するご質問ですね。\n\n金銭に関わる判断は吉田の承認が必要です。\n\n■ 確認事項\n・契約書番号\n・入居期間\n・返金の理由\n\nこれらの情報を整理して、吉田に確認します。',
    keywords: ['返金', '返却', '払い戻し', 'キャンセル'],
  },
  {
    key: 'hr_employment',
    title: '採用・雇用関連',
    category: 'hr',
    riskLevel: 'L3',
    templateText: '採用・雇用に関するご質問ですね。\n\n人事に関わる判断は吉田の承認が必要です。\n\n内容を整理して、吉田に確認します。\n\n緊急の場合は直接吉田にご連絡ください。',
    keywords: ['採用', '雇用', '面接', '入社', '退職'],
  },
  {
    key: 'hr_discipline',
    title: '労務問題対応',
    category: 'hr',
    riskLevel: 'L3',
    templateText: '労務に関するご相談ですね。\n\n内容が重要なため、吉田の判断が必要です。\n\n■ 対応の流れ\n1. 状況を整理\n2. 吉田に報告\n3. 対応方針を決定\n\n緊急の場合は直接吉田にご連絡ください。',
    keywords: ['トラブル', '問題', 'ハラスメント', '懲戒'],
  },
  {
    key: 'risk_complaint',
    title: 'クレーム対応',
    category: 'risk',
    riskLevel: 'L3',
    requiredFieldsJson: JSON.stringify(['発生日時', '相手方', 'クレーム内容', '現状']),
    templateText: 'クレームに関するご報告ですね。\n\nクレーム対応は吉田の判断が必要です。\n\n■ 確認事項\n・発生日時\n・相手方（ご家族/紹介会社等）\n・クレーム内容\n・現状\n\nこれらを整理して、至急吉田に報告します。',
    keywords: ['クレーム', '苦情', '怒り', 'トラブル', '問題'],
  },
  {
    key: 'risk_accident',
    title: '事故対応',
    category: 'risk',
    riskLevel: 'L3',
    requiredFieldsJson: JSON.stringify(['発生日時', '場所', '状況', '対応済み事項']),
    templateText: '事故に関するご報告ですね。\n\n■ まず確認\n・怪我人の有無と状態\n・救急/警察への連絡有無\n\n■ 報告事項\n・発生日時\n・場所\n・状況\n・対応済み事項\n\n至急吉田に報告します。',
    keywords: ['事故', '怪我', '転倒', '救急'],
  },
  {
    key: 'risk_legal',
    title: '法務・行政対応',
    category: 'risk',
    riskLevel: 'L3',
    templateText: '法務・行政に関するご質問ですね。\n\n法的な判断は吉田の確認が必要です。\n\n■ 確認事項\n・関係機関（行政/弁護士等）\n・内容の概要\n・期限の有無\n\n至急吉田に確認します。',
    keywords: ['行政', '法務', '弁護士', '監査', '指導'],
  },
  {
    key: 'expense_contract',
    title: '契約・支払い判断',
    category: 'expense',
    riskLevel: 'L3',
    requiredFieldsJson: JSON.stringify(['契約相手', '金額', '契約内容']),
    templateText: '契約・支払いに関するご質問ですね。\n\n金銭に関わる判断は吉田の承認が必要です。\n\n■ 確認事項\n・契約相手\n・金額\n・契約内容\n\n吉田に確認します。',
    keywords: ['契約', '支払い', '請求', '振込'],
  },
  {
    key: 'risk_medical',
    title: '医療判断',
    category: 'risk',
    riskLevel: 'L3',
    templateText: '医療に関するご質問ですね。\n\n医療の判断は吉田の確認が必要です。\n\n■ 緊急の場合\n・すぐに救急（119）に連絡\n・その後で報告\n\n■ 緊急でない場合\n・状況を整理して報告\n\n吉田に確認します。',
    keywords: ['医療', '病院', '診断', '処置', '緊急'],
  },
];

/**
 * FAQテンプレートを初期化（存在しない場合のみ）
 */
export async function initializeAiTemplates(
  userEmail: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ created: number; existing: number }> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  let created = 0;
  let existing = 0;

  for (const template of INITIAL_TEMPLATES) {
    // 既存チェック
    const q = query(
      collection(firestore, 'aiTemplates'),
      where('tenantId', '==', tenantId),
      where('key', '==', template.key)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      await addDoc(collection(firestore, 'aiTemplates'), {
        tenantId,
        ...template,
        createdAt: Timestamp.now(),
      });
      created++;
    } else {
      existing++;
    }
  }

  return { created, existing };
}

/**
 * メッセージを処理してAI返信を生成
 */
export async function processMessageAndGenerateReply(
  message: LwMessage,
  userEmail: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiReply> {
  assertAiVpOwner(userEmail);

  // テンプレートを取得
  const templates = await getAiTemplates(userEmail, tenantId);

  // リスクレベルとカテゴリを判定
  const riskLevel = determineRiskLevel(message.text);
  const category = determineCategory(message.text);

  // マッチするテンプレートを検索
  const matchedTemplate = await findMatchingTemplate(message.text, templates);

  // 返信テキストを生成
  let draftText: string;
  let templateId: string | undefined;

  if (matchedTemplate) {
    draftText = generateReplyFromTemplate(matchedTemplate, message);
    templateId = matchedTemplate.id;
  } else {
    draftText = generateDefaultReply(category, riskLevel);
  }

  // エスカレーション理由
  let escalationReason: string | undefined;
  if (riskLevel === 'L3') {
    escalationReason = '高リスク判定のため吉田承認が必要です';
  } else if (riskLevel === 'L2') {
    escalationReason = '中リスク判定のため管理者承認が必要です';
  }

  // AI返信を作成
  const reply = await createAiReply({
    messageId: message.id,
    riskLevel,
    category,
    draftText,
    templateId,
    escalationReason,
  }, tenantId);

  return reply;
}
