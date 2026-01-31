// ======== 決裁前レビューゲート ライブラリ ========

import { getAdminDb } from './firebase-admin';
import type {
  ApplicationType,
  ReviewFlag,
  ReviewFlagType,
  FlagConditions,
  ExpenseApplication,
  OvertimeApplication,
  PreReviewResult,
  AIReviewPoint,
  PreReviewLog,
  PreReviewSummary,
  DEFAULT_FLAG_CONDITIONS,
  FLAG_LABELS,
  PRE_REVIEW_LOGS_COLLECTION,
} from '@/types/pre-review';

// コレクション名
const LOGS_COLLECTION = 'pre_review_logs';

// デフォルト条件
const DEFAULT_CONDITIONS: FlagConditions = {
  expense: {
    amountThreshold: 50000,
    frequencyLimit: 10,
    frequencyDays: 30,
    requireAttachmentAbove: 10000,
  },
  overtime: {
    lateNightHour: 22,
    consecutiveDaysLimit: 3,
    monthlyHoursWarning: 30,
    monthlyHoursLimit: 45,
  },
};

// フラグ表示情報
const FLAG_INFO: Record<ReviewFlagType, { title: string; description: string }> = {
  amount_exceeded: {
    title: '金額確認',
    description: '通常より高額な申請です',
  },
  high_frequency: {
    title: '頻度確認',
    description: '申請頻度が多くなっています',
  },
  no_attachment: {
    title: '添付確認',
    description: '領収書・証憑の添付をご確認ください',
  },
  late_night: {
    title: '深夜残業',
    description: '22時以降の残業申請です',
  },
  consecutive_days: {
    title: '連続残業',
    description: '複数日連続の残業申請です',
  },
  weekend_holiday: {
    title: '休日出勤',
    description: '土日祝の残業申請です',
  },
  budget_warning: {
    title: '予算確認',
    description: '部門予算に近づいています',
  },
  unusual_pattern: {
    title: 'パターン確認',
    description: '通常と異なるパターンが検出されました',
  },
};

// ======== フラグ判定 ========

/**
 * 経費申請のフラグを判定
 */
export function checkExpenseFlags(
  application: ExpenseApplication,
  conditions: FlagConditions['expense'] = DEFAULT_CONDITIONS.expense
): ReviewFlag[] {
  const flags: ReviewFlag[] = [];

  // 金額超過チェック
  if (application.amount > conditions.amountThreshold) {
    flags.push({
      type: 'amount_exceeded',
      severity: 'attention',
      title: FLAG_INFO.amount_exceeded.title,
      description: FLAG_INFO.amount_exceeded.description,
      context: {
        amount: application.amount,
        threshold: conditions.amountThreshold,
      },
    });
  }

  // 添付不足チェック
  if (
    application.amount > conditions.requireAttachmentAbove &&
    (!application.attachments || application.attachments.length === 0)
  ) {
    flags.push({
      type: 'no_attachment',
      severity: 'warning',
      title: FLAG_INFO.no_attachment.title,
      description: FLAG_INFO.no_attachment.description,
      context: {
        amount: application.amount,
        requireAbove: conditions.requireAttachmentAbove,
      },
    });
  }

  // 頻度過多チェック
  if (
    application.recentApplicationCount !== undefined &&
    application.recentApplicationCount >= conditions.frequencyLimit
  ) {
    flags.push({
      type: 'high_frequency',
      severity: 'info',
      title: FLAG_INFO.high_frequency.title,
      description: FLAG_INFO.high_frequency.description,
      context: {
        count: application.recentApplicationCount,
        limit: conditions.frequencyLimit,
        days: conditions.frequencyDays,
      },
    });
  }

  return flags;
}

/**
 * 残業申請のフラグを判定
 */
export function checkOvertimeFlags(
  application: OvertimeApplication,
  conditions: FlagConditions['overtime'] = DEFAULT_CONDITIONS.overtime
): ReviewFlag[] {
  const flags: ReviewFlag[] = [];

  // 深夜チェック
  const endHour = parseInt(application.endTime.split(':')[0], 10);
  if (endHour >= conditions.lateNightHour || endHour < 5) {
    flags.push({
      type: 'late_night',
      severity: 'attention',
      title: FLAG_INFO.late_night.title,
      description: FLAG_INFO.late_night.description,
      context: {
        endTime: application.endTime,
        lateNightHour: conditions.lateNightHour,
      },
    });
  }

  // 連続日数チェック
  if (
    application.consecutiveDays !== undefined &&
    application.consecutiveDays >= conditions.consecutiveDaysLimit
  ) {
    flags.push({
      type: 'consecutive_days',
      severity: 'warning',
      title: FLAG_INFO.consecutive_days.title,
      description: FLAG_INFO.consecutive_days.description,
      context: {
        days: application.consecutiveDays,
        limit: conditions.consecutiveDaysLimit,
      },
    });
  }

  // 月間時間チェック
  if (application.monthlyHours !== undefined) {
    const totalHours = application.monthlyHours + application.hours;

    if (totalHours >= conditions.monthlyHoursLimit) {
      flags.push({
        type: 'budget_warning',
        severity: 'attention',
        title: '月間残業上限',
        description: `月間残業時間が${conditions.monthlyHoursLimit}時間を超えます`,
        context: {
          currentHours: application.monthlyHours,
          addingHours: application.hours,
          totalHours,
          limit: conditions.monthlyHoursLimit,
        },
      });
    } else if (totalHours >= conditions.monthlyHoursWarning) {
      flags.push({
        type: 'budget_warning',
        severity: 'info',
        title: '月間残業確認',
        description: `月間残業時間が${conditions.monthlyHoursWarning}時間を超えています`,
        context: {
          currentHours: application.monthlyHours,
          addingHours: application.hours,
          totalHours,
          warning: conditions.monthlyHoursWarning,
        },
      });
    }
  }

  // 土日祝チェック
  const date = new Date(application.date);
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    flags.push({
      type: 'weekend_holiday',
      severity: 'info',
      title: FLAG_INFO.weekend_holiday.title,
      description: FLAG_INFO.weekend_holiday.description,
      context: {
        date: application.date,
        dayOfWeek: dayOfWeek === 0 ? '日曜' : '土曜',
      },
    });
  }

  return flags;
}

// ======== AIレビュー ========

/**
 * AIレビューを実行
 */
export async function generateAIReview(
  applicationType: ApplicationType,
  application: ExpenseApplication | OvertimeApplication,
  flags: ReviewFlag[]
): Promise<{
  points: AIReviewPoint[];
  encouragement: string;
  modelUsed: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('[PreReview] OpenAI APIキーなし、ダミーレビューを返す');
    return generateDummyReview(applicationType, flags);
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(applicationType, application, flags);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('OpenAI API returned empty content');
    }

    const parsed = JSON.parse(content);
    return formatAIReviewResponse(parsed, flags);
  } catch (error) {
    console.error('[PreReview] OpenAI API呼び出しエラー', error);
    return generateDummyReview(applicationType, flags);
  }
}

/**
 * システムプロンプトを構築
 */
function buildSystemPrompt(): string {
  return `あなたは申請者をサポートするAIアシスタントです。
申請内容を確認し、スムーズに承認されるよう整理を手伝います。

## 重要なルール

1. **否定禁止**: 「ダメ」「いけません」「問題があります」は使わない
2. **命令禁止**: 「〜してください」「〜しなさい」は使わない
3. **整理補助のみ**: 判断や評価はせず、確認を促すだけ

## 推奨表現

- 「〜を確認してみましょうか」
- 「〜も添えると分かりやすくなるかもしれません」
- 「〜について、もう少し詳しく書いてみませんか」

## 出力形式（JSON）

{
  "points": [
    {
      "category": "確認カテゴリ",
      "point": "確認ポイント（質問形式）",
      "suggestion": "整理のヒント"
    }
  ],
  "encouragement": "励ましメッセージ"
}

注意:
- pointsは最大3つ
- 全て肯定的・協力的なトーンで
- 「却下」「不備」などの否定的な言葉は使わない`;
}

/**
 * ユーザープロンプトを構築
 */
function buildUserPrompt(
  applicationType: ApplicationType,
  application: ExpenseApplication | OvertimeApplication,
  flags: ReviewFlag[]
): string {
  const flagDescriptions = flags
    .map((f) => `- ${f.title}: ${f.description}`)
    .join('\n');

  if (applicationType === 'expense') {
    const exp = application as ExpenseApplication;
    return `## 申請種別
経費申請

## 申請内容
- 件名: ${exp.title}
- 金額: ${exp.amount.toLocaleString()}円
- カテゴリ: ${exp.category}
- 日付: ${exp.date}
- 説明: ${exp.description || '（なし）'}
- 添付: ${exp.attachments?.length || 0}件

## 確認ポイント
${flagDescriptions}

上記の確認ポイントについて、申請者が自分で整理できるよう、質問形式でサポートしてください。`;
  } else {
    const ot = application as OvertimeApplication;
    return `## 申請種別
残業申請

## 申請内容
- 日付: ${ot.date}
- 時間: ${ot.startTime} 〜 ${ot.endTime}（${ot.hours}時間）
- 理由: ${ot.reason}
- 今月の残業: ${ot.monthlyHours || 0}時間
- 連続日数: ${ot.consecutiveDays || 0}日

## 確認ポイント
${flagDescriptions}

上記の確認ポイントについて、申請者が自分で整理できるよう、質問形式でサポートしてください。`;
  }
}

/**
 * AIレスポンスを整形
 */
function formatAIReviewResponse(
  parsed: any,
  flags: ReviewFlag[]
): {
  points: AIReviewPoint[];
  encouragement: string;
  modelUsed: string;
} {
  const points: AIReviewPoint[] = (parsed.points || [])
    .slice(0, 3)
    .map((point: any, index: number) => ({
      id: `point-${index + 1}`,
      category: point.category || '確認',
      point: point.point || '',
      suggestion: point.suggestion,
      relatedFlag: flags[index]?.type,
    }));

  return {
    points,
    encouragement:
      parsed.encouragement ||
      '確認ありがとうございます。整理できたら申請を進めましょう。',
    modelUsed: 'gpt-4o-mini',
  };
}

/**
 * ダミーレビューを生成
 */
function generateDummyReview(
  applicationType: ApplicationType,
  flags: ReviewFlag[]
): {
  points: AIReviewPoint[];
  encouragement: string;
  modelUsed: string;
} {
  const points: AIReviewPoint[] = flags.slice(0, 3).map((flag, index) => {
    let point = '';
    let suggestion = '';

    switch (flag.type) {
      case 'amount_exceeded':
        point = '金額について、もう少し詳しく説明を加えてみませんか？';
        suggestion = '何のための支出か、具体的に書くと分かりやすくなります';
        break;
      case 'no_attachment':
        point = '領収書やレシートの画像は添付されていますか？';
        suggestion = '証憑があると、承認がスムーズになります';
        break;
      case 'high_frequency':
        point = '今月の申請が多めですが、まとめて申請できるものはありますか？';
        suggestion = '同じカテゴリのものはまとめると効率的です';
        break;
      case 'late_night':
        point = '深夜まで作業が必要だった理由を書いてみませんか？';
        suggestion = '背景が分かると、承認者も状況を理解しやすくなります';
        break;
      case 'consecutive_days':
        point = '連続での残業になっていますが、業務の状況は大丈夫ですか？';
        suggestion = '必要に応じて、上長に相談することも検討してみてください';
        break;
      default:
        point = '内容を確認してみましょうか？';
        suggestion = '分かりやすく書くと、承認がスムーズになります';
    }

    return {
      id: `point-${index + 1}`,
      category: flag.title,
      point,
      suggestion,
      relatedFlag: flag.type,
    };
  });

  return {
    points,
    encouragement:
      applicationType === 'expense'
        ? '経費申請の確認をしています。整理できたら申請を進めましょう。'
        : '残業申請の確認をしています。無理のない範囲で業務を進めてください。',
    modelUsed: 'dummy',
  };
}

// ======== プレレビュー実行 ========

/**
 * プレレビューを実行
 */
export async function runPreReview(
  applicationType: ApplicationType,
  application: ExpenseApplication | OvertimeApplication,
  conditions?: FlagConditions
): Promise<PreReviewResult> {
  const cond = conditions || DEFAULT_CONDITIONS;

  console.log('[PreReview] レビュー開始', {
    type: applicationType,
    applicant: 'applicantId' in application ? application.applicantId : 'unknown',
  });

  // フラグ判定
  const flags =
    applicationType === 'expense'
      ? checkExpenseFlags(application as ExpenseApplication, cond.expense)
      : checkOvertimeFlags(application as OvertimeApplication, cond.overtime);

  const hasFlags = flags.length > 0;

  console.log('[PreReview] フラグ判定結果', {
    hasFlags,
    flagCount: flags.length,
    flags: flags.map((f) => f.type),
  });

  // フラグなしの場合
  if (!hasFlags) {
    return {
      hasFlags: false,
      flags: [],
      canSubmit: true,
      requiresReview: false,
      checkedAt: new Date(),
    };
  }

  // AIレビュー実行
  const aiReview = await generateAIReview(applicationType, application, flags);

  console.log('[PreReview] AIレビュー完了', {
    pointCount: aiReview.points.length,
  });

  return {
    hasFlags: true,
    flags,
    aiReview: {
      ...aiReview,
      reviewedAt: new Date(),
    },
    canSubmit: false,  // 確認完了前はsubmit不可
    requiresReview: true,
    checkedAt: new Date(),
  };
}

// ======== ログ保存 ========

/**
 * プレレビューログを保存
 */
export async function savePreReviewLog(
  log: Omit<PreReviewLog, 'id'>
): Promise<string> {
  console.log('[PreReview] ログ保存', {
    applicationType: log.applicationType,
    flagCount: log.flagCount,
    outcome: log.outcome,
  });

  const docRef = getAdminDb().collection(LOGS_COLLECTION).doc();
  await docRef.set({
    ...log,
    id: docRef.id,
  });

  return docRef.id;
}

/**
 * プレレビューログ一覧を取得
 */
export async function getPreReviewLogs(
  tenantId: string,
  options: {
    applicationType?: ApplicationType;
    applicantId?: string;
    branchId?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ logs: PreReviewLog[]; total: number }> {
  const { applicationType, applicantId, branchId, limit = 20, offset = 0 } = options;

  let queryRef: FirebaseFirestore.Query = getAdminDb()
    .collection(LOGS_COLLECTION)
    .where('tenantId', '==', tenantId);

  if (applicationType) {
    queryRef = queryRef.where('applicationType', '==', applicationType);
  }

  if (applicantId) {
    queryRef = queryRef.where('applicantId', '==', applicantId);
  }

  if (branchId) {
    queryRef = queryRef.where('branchId', '==', branchId);
  }

  queryRef = queryRef.orderBy('reviewedAt', 'desc');

  // 総数取得
  const countSnapshot = await queryRef.count().get();
  const total = countSnapshot.data().count;

  // ページング
  const snapshot = await queryRef.offset(offset).limit(limit).get();

  const logs: PreReviewLog[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      tenantId: data.tenantId,
      applicationType: data.applicationType,
      applicationId: data.applicationId,
      applicantId: data.applicantId,
      applicantName: data.applicantName,
      branchId: data.branchId,
      flags: data.flags || [],
      flagCount: data.flagCount || 0,
      aiReviewPoints: data.aiReviewPoints,
      outcome: data.outcome,
      modificationsMade: data.modificationsMade,
      reviewedAt: data.reviewedAt?.toDate() || new Date(),
      submittedAt: data.submittedAt?.toDate(),
      applicationSummary: data.applicationSummary,
    };
  });

  return { logs, total };
}

// ======== 吉田向けサマリ ========

/**
 * 吉田向けサマリを生成
 */
export async function generatePreReviewSummary(
  tenantId: string,
  periodDays: number = 7
): Promise<PreReviewSummary> {
  const now = new Date();
  const from = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  console.log('[PreReview] サマリ生成', { tenantId, periodDays });

  const snapshot = await getAdminDb()
    .collection(LOGS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('reviewedAt', '>=', from)
    .orderBy('reviewedAt', 'desc')
    .get();

  const logs: PreReviewLog[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      tenantId: data.tenantId,
      applicationType: data.applicationType,
      applicationId: data.applicationId,
      applicantId: data.applicantId,
      applicantName: data.applicantName,
      branchId: data.branchId,
      flags: data.flags || [],
      flagCount: data.flagCount || 0,
      aiReviewPoints: data.aiReviewPoints,
      outcome: data.outcome,
      modificationsMade: data.modificationsMade,
      reviewedAt: data.reviewedAt?.toDate() || new Date(),
      submittedAt: data.submittedAt?.toDate(),
      applicationSummary: data.applicationSummary,
    };
  });

  // 統計計算
  const stats = {
    totalReviews: logs.length,
    expenseReviews: logs.filter((l) => l.applicationType === 'expense').length,
    overtimeReviews: logs.filter((l) => l.applicationType === 'overtime').length,
    byFlag: {} as Record<ReviewFlagType, number>,
    submitted: logs.filter((l) => l.outcome === 'submitted').length,
    modified: logs.filter((l) => l.outcome === 'modified').length,
    cancelled: logs.filter((l) => l.outcome === 'cancelled').length,
  };

  // フラグ別集計
  for (const log of logs) {
    for (const flag of log.flags) {
      const flagType = flag.type as ReviewFlagType;
      stats.byFlag[flagType] = (stats.byFlag[flagType] || 0) + 1;
    }
  }

  // 注意ケース（フラグ2つ以上）
  const attentionCases = logs
    .filter((l) => l.flagCount >= 2)
    .slice(0, 10)
    .map((l) => ({
      logId: l.id,
      applicantName: l.applicantName,
      applicationType: l.applicationType,
      flags: l.flags.map((f) => f.type as ReviewFlagType),
      summary: l.applicationSummary.title || `${l.applicationSummary.date}の申請`,
      reviewedAt: l.reviewedAt.toISOString(),
    }));

  return {
    period: {
      from: from.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    },
    stats,
    attentionCases,
  };
}

// ======== 確認完了処理 ========

/**
 * レビュー確認完了を記録
 */
export async function completePreReview(
  applicationType: ApplicationType,
  application: ExpenseApplication | OvertimeApplication,
  flags: ReviewFlag[],
  outcome: 'submitted' | 'modified' | 'cancelled',
  tenantId: string,
  modificationsMade?: string[]
): Promise<string> {
  const log: Omit<PreReviewLog, 'id'> = {
    tenantId,
    applicationType,
    applicationId: application.id,
    applicantId: application.applicantId,
    applicantName: application.applicantName,
    branchId: application.branchId,
    flags,
    flagCount: flags.length,
    outcome,
    modificationsMade,
    reviewedAt: new Date(),
    submittedAt: outcome === 'submitted' || outcome === 'modified' ? new Date() : undefined,
    applicationSummary:
      applicationType === 'expense'
        ? {
            title: (application as ExpenseApplication).title,
            amount: (application as ExpenseApplication).amount,
            date: (application as ExpenseApplication).date,
          }
        : {
            hours: (application as OvertimeApplication).hours,
            date: (application as OvertimeApplication).date,
          },
  };

  return savePreReviewLog(log);
}
