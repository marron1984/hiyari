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
    templateText: '書類の提出方法をご案内します。\n\n1. DHPハブにログイン\n2. 「書類提出」メニューを選択\n3. 必要書類をアップロード\n\n不明点は管理者にお問い合わせください。',
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
    templateText: 'シフトの確認方法をご案内します。\n\n1. DHPハブの「勤怠」メニュー\n2. カレンダー表示でシフト確認\n3. 希望変更は管理者へ連絡\n\n急な変更は直接ご連絡ください。',
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
    templateText: '残業申請についてご案内します。\n\n■ 事前申請が原則です\n1. DHPハブで残業申請\n2. 理由と予定時間を入力\n3. 管理者承認後に残業\n\n■ 注意事項\n・月45時間を超える場合は要相談\n\n管理者に確認します。',
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
