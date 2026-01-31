// ======== 仕訳テンプレート改善提案 ライブラリ ========

import { getAdminDb } from '@/lib/firebase-admin';
import type { AccountingTemplate } from '@/types/accounting-template';
import type { AccountingAIReview } from '@/types/accounting-ai-review';
import {
  type TemplateStats,
  type TemplateSuggestion,
  type ImprovementTrigger,
  type TemplateImprovementAIInput,
  type TemplateImprovementAIOutput,
  type TemplateDiff,
  DEFAULT_IMPROVEMENT_TRIGGER,
  TEMPLATE_STATS_COLLECTION,
  TEMPLATE_SUGGESTIONS_COLLECTION,
  SUGGESTION_EXPIRY_DAYS,
  STATS_PERIOD_DAYS,
} from '@/types/template-improvement';
import { ACCOUNTING_TEMPLATES_COLLECTION } from '@/types/accounting-template';
import { ACCOUNTING_AI_REVIEWS_COLLECTION } from '@/types/accounting-ai-review';

// ======== 統計集計 ========

/**
 * テンプレートの利用統計を集計
 */
export async function aggregateTemplateStats(
  templateId: string,
  tenantId: string
): Promise<TemplateStats> {
  const db = getAdminDb();
  const now = new Date();
  const periodStart = new Date(now.getTime() - STATS_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  // AIレビュー履歴を取得（このテンプレートを使用したもの）
  const reviewsSnapshot = await db
    .collection(ACCOUNTING_AI_REVIEWS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('templateId', '==', templateId)
    .where('createdAt', '>=', periodStart)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const reviews = reviewsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as (AccountingAIReview & { id: string })[];

  // 統計を計算
  let usageCount = 0;
  let aiReviewCount = 0;
  let humanCorrectionCount = 0;
  let amountOutlierCount = 0;
  let accountItemChangeCount = 0;

  const recentUsages: TemplateStats['recentUsages'] = [];

  for (const review of reviews) {
    usageCount++;

    if (review.hasAnomaly) {
      aiReviewCount++;
    }

    if (review.anomalyFlags?.amountOutlier) {
      amountOutlierCount++;
    }

    if (review.anomalyFlags?.accountItemChanged) {
      accountItemChangeCount++;
    }

    if (review.reviewerDecision === 'changed') {
      humanCorrectionCount++;
    }

    // 直近10件の詳細
    if (recentUsages.length < 10) {
      recentUsages.push({
        applicationId: review.applicationId,
        paymentId: review.paymentId,
        date: review.createdAt.toISOString().split('T')[0],
        amount: 0, // 後で取得
        payeeName: '', // 後で取得
        hadAnomaly: review.hasAnomaly,
        humanCorrected: review.reviewerDecision === 'changed',
        correctedAccountItemId: review.reviewerSelectedAccountItemId,
        correctedAccountItemName: undefined,
      });
    }
  }

  // 支払い情報から詳細を補完
  if (recentUsages.length > 0) {
    const paymentIds = recentUsages
      .map(u => u.paymentId)
      .filter((id): id is string => !!id);

    if (paymentIds.length > 0) {
      const paymentsSnapshot = await db
        .collection('payments')
        .where('id', 'in', paymentIds.slice(0, 10))
        .get();

      const paymentsMap = new Map(
        paymentsSnapshot.docs.map(doc => [doc.id, doc.data()])
      );

      for (const usage of recentUsages) {
        if (usage.paymentId && paymentsMap.has(usage.paymentId)) {
          const payment = paymentsMap.get(usage.paymentId)!;
          usage.amount = payment.amount || 0;
          usage.payeeName = payment.payeeName || '';
        }
      }
    }
  }

  const stats: TemplateStats = {
    templateId,
    tenantId,
    usageCount,
    aiReviewCount,
    humanCorrectionCount,
    amountOutlierCount,
    accountItemChangeCount,
    recentUsages,
    periodStart,
    periodEnd: now,
    updatedAt: now,
  };

  return stats;
}

/**
 * 統計を保存
 */
export async function saveTemplateStats(stats: TemplateStats): Promise<void> {
  const db = getAdminDb();
  const docId = `${stats.tenantId}_${stats.templateId}`;

  await db.collection(TEMPLATE_STATS_COLLECTION).doc(docId).set({
    ...stats,
    periodStart: stats.periodStart,
    periodEnd: stats.periodEnd,
    updatedAt: new Date(),
  });
}

/**
 * 統計を取得
 */
export async function getTemplateStats(
  templateId: string,
  tenantId: string
): Promise<TemplateStats | null> {
  const db = getAdminDb();
  const docId = `${tenantId}_${templateId}`;

  const doc = await db.collection(TEMPLATE_STATS_COLLECTION).doc(docId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    ...data,
    periodStart: data.periodStart?.toDate?.() || new Date(),
    periodEnd: data.periodEnd?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
  } as TemplateStats;
}

// ======== トリガー検知 ========

/**
 * 改善トリガーをチェック
 */
export function checkImprovementTrigger(
  stats: TemplateStats,
  trigger: ImprovementTrigger = DEFAULT_IMPROVEMENT_TRIGGER
): {
  triggered: boolean;
  reason: TemplateSuggestion['triggerReason'];
  details: TemplateSuggestion['triggerDetails'];
} {
  const reasons: TemplateSuggestion['triggerReason'][] = [];
  const details: TemplateSuggestion['triggerDetails'] = {};

  // AIレビュー回数チェック
  if (stats.aiReviewCount >= trigger.aiReviewThreshold) {
    reasons.push('ai_review_count');
    details.aiReviewCount = stats.aiReviewCount;
  }

  // 人による修正採用回数チェック
  if (stats.humanCorrectionCount >= trigger.humanCorrectionThreshold) {
    reasons.push('human_correction_count');
    details.humanCorrectionCount = stats.humanCorrectionCount;
  }

  // 金額外れ値継続チェック
  if (stats.amountOutlierCount >= trigger.amountOutlierThreshold) {
    reasons.push('amount_outlier_count');
    details.amountOutlierCount = stats.amountOutlierCount;
  }

  if (reasons.length === 0) {
    return { triggered: false, reason: 'ai_review_count', details };
  }

  return {
    triggered: true,
    reason: reasons.length > 1 ? 'multiple' : reasons[0],
    details,
  };
}

/**
 * トリガーを満たすテンプレートを検索
 */
export async function findTemplatesNeedingImprovement(
  tenantId: string,
  trigger: ImprovementTrigger = DEFAULT_IMPROVEMENT_TRIGGER
): Promise<Array<{ template: AccountingTemplate; stats: TemplateStats; triggerResult: ReturnType<typeof checkImprovementTrigger> }>> {
  const db = getAdminDb();

  // アクティブなテンプレートを取得
  const templatesSnapshot = await db
    .collection(ACCOUNTING_TEMPLATES_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('isActive', '==', true)
    .get();

  const results: Array<{ template: AccountingTemplate; stats: TemplateStats; triggerResult: ReturnType<typeof checkImprovementTrigger> }> = [];

  for (const doc of templatesSnapshot.docs) {
    const template = {
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
    } as AccountingTemplate;

    // 統計を集計
    const stats = await aggregateTemplateStats(template.id, tenantId);

    // トリガーチェック
    const triggerResult = checkImprovementTrigger(stats, trigger);

    if (triggerResult.triggered) {
      // 既存の未処理提案がないかチェック
      const existingSuggestion = await db
        .collection(TEMPLATE_SUGGESTIONS_COLLECTION)
        .where('templateId', '==', template.id)
        .where('status', '==', 'pending')
        .limit(1)
        .get();

      if (existingSuggestion.empty) {
        results.push({ template, stats, triggerResult });
      }
    }
  }

  return results;
}

// ======== AI改善提案生成 ========

/**
 * AI改善提案を生成
 */
export async function generateImprovementSuggestion(
  template: AccountingTemplate,
  stats: TemplateStats,
  triggerResult: ReturnType<typeof checkImprovementTrigger>
): Promise<TemplateSuggestion | null> {
  // AI入力を作成
  const aiInput: TemplateImprovementAIInput = {
    template: {
      id: template.id,
      name: template.name,
      description: template.description,
      matchCondition: template.matchCondition,
      entries: template.entries,
      descriptionTemplate: template.descriptionTemplate,
      priority: template.priority,
    },
    stats: {
      usageCount: stats.usageCount,
      aiReviewCount: stats.aiReviewCount,
      humanCorrectionCount: stats.humanCorrectionCount,
      amountOutlierCount: stats.amountOutlierCount,
      accountItemChangeCount: stats.accountItemChangeCount,
    },
    recentUsages: stats.recentUsages.map(u => ({
      date: u.date,
      amount: u.amount,
      payeeName: u.payeeName,
      hadAnomaly: u.hadAnomaly,
      humanCorrected: u.humanCorrected,
      correctedAccountItemName: u.correctedAccountItemName,
    })),
    triggerReason: triggerResult.reason,
  };

  // AI呼び出し
  const aiOutput = await runImprovementAI(aiInput);

  if (!aiOutput) {
    return null;
  }

  // 提案を作成
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SUGGESTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const suggestion: Omit<TemplateSuggestion, 'id'> = {
    tenantId: template.tenantId,
    templateId: template.id,
    originalTemplate: {
      name: template.name,
      matchCondition: template.matchCondition,
      entries: template.entries,
      descriptionTemplate: template.descriptionTemplate,
      priority: template.priority,
    },
    triggerReason: triggerResult.reason,
    triggerDetails: triggerResult.details,
    stats: {
      usageCount: stats.usageCount,
      aiReviewCount: stats.aiReviewCount,
      humanCorrectionCount: stats.humanCorrectionCount,
      amountOutlierCount: stats.amountOutlierCount,
    },
    aiAnalysis: {
      reason: aiOutput.reason,
      diff: aiOutput.diff,
      confidence: aiOutput.confidence,
      model: 'gpt-4o-mini',
      tokensUsed: 0, // 実際のトークン数は呼び出し時に設定
    },
    status: 'pending',
    createdAt: now,
    expiresAt,
  };

  return suggestion as TemplateSuggestion;
}

/**
 * AI改善分析を実行
 */
async function runImprovementAI(
  input: TemplateImprovementAIInput
): Promise<TemplateImprovementAIOutput | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('[TemplateImprovement] OPENAI_API_KEY未設定');
    return null;
  }

  const systemPrompt = `あなたは経理システムの仕訳テンプレート改善アドバイザーです。
テンプレートの利用状況を分析し、改善提案を行ってください。

以下のルールに従ってください：
1. 改善理由は日本語で簡潔に説明する
2. 差分案はJSONで具体的に示す
3. 確信度は0-100で評価する
4. 不要な変更は提案しない
5. テンプレートの目的を維持しながら精度向上を目指す

改善が必要ない場合は、confidence: 0 で返してください。`;

  const userPrompt = `以下のテンプレートの改善を提案してください。

## テンプレート定義
名前: ${input.template.name}
説明: ${input.template.description || 'なし'}
優先度: ${input.template.priority}

マッチング条件:
${JSON.stringify(input.template.matchCondition, null, 2)}

仕訳明細:
${JSON.stringify(input.template.entries, null, 2)}

摘要テンプレート: ${input.template.descriptionTemplate.template}

## 利用統計（過去90日）
- 利用回数: ${input.stats.usageCount}
- AIレビュー（異常検知）回数: ${input.stats.aiReviewCount}
- 人が修正を採用した回数: ${input.stats.humanCorrectionCount}
- 金額外れ値検知回数: ${input.stats.amountOutlierCount}
- 勘定科目変更検知回数: ${input.stats.accountItemChangeCount}

## 改善トリガー理由
${input.triggerReason}

## 最近の利用例
${input.recentUsages.map(u => `- ${u.date}: ${u.payeeName} ¥${u.amount.toLocaleString()} ${u.hadAnomaly ? '(異常検知)' : ''} ${u.humanCorrected ? `→修正: ${u.correctedAccountItemName}` : ''}`).join('\n')}

以下のJSON形式で回答してください：
{
  "reason": "改善理由（日本語）",
  "diff": {
    "matchCondition": { "before": {...}, "after": {...}, "changes": ["変更内容"] },
    "entries": { "before": [...], "after": [...], "changes": ["変更内容"] },
    "priority": { "before": 数値, "after": 数値 }
  },
  "confidence": 0-100
}

変更が不要な項目はdiffから省略してください。`;

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
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('[TemplateImprovement] OpenAI API error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('[TemplateImprovement] AI応答なし');
      return null;
    }

    const parsed = JSON.parse(content) as TemplateImprovementAIOutput;

    // 確信度が低い場合はnullを返す
    if (parsed.confidence < 30) {
      console.log('[TemplateImprovement] 確信度が低いため提案なし', {
        templateId: input.template.id,
        confidence: parsed.confidence,
      });
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('[TemplateImprovement] AI呼び出しエラー:', error);
    return null;
  }
}

// ======== 提案の保存・取得 ========

/**
 * 提案を保存
 */
export async function saveSuggestion(
  suggestion: Omit<TemplateSuggestion, 'id'>
): Promise<string> {
  const db = getAdminDb();

  const docRef = await db.collection(TEMPLATE_SUGGESTIONS_COLLECTION).add({
    ...suggestion,
    createdAt: suggestion.createdAt,
    expiresAt: suggestion.expiresAt,
  });

  return docRef.id;
}

/**
 * 提案を取得
 */
export async function getSuggestion(id: string): Promise<TemplateSuggestion | null> {
  const db = getAdminDb();
  const doc = await db.collection(TEMPLATE_SUGGESTIONS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.() || new Date(),
    expiresAt: data.expiresAt?.toDate?.() || new Date(),
    reviewedAt: data.reviewedAt?.toDate?.(),
  } as TemplateSuggestion;
}

/**
 * テナントの提案一覧を取得
 */
export async function listSuggestions(
  tenantId: string,
  status?: TemplateSuggestion['status']
): Promise<TemplateSuggestion[]> {
  const db = getAdminDb();

  let query = db
    .collection(TEMPLATE_SUGGESTIONS_COLLECTION)
    .where('tenantId', '==', tenantId);

  if (status) {
    query = query.where('status', '==', status);
  }

  const snapshot = await query.orderBy('createdAt', 'desc').limit(50).get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || new Date(),
      expiresAt: data.expiresAt?.toDate?.() || new Date(),
      reviewedAt: data.reviewedAt?.toDate?.(),
    } as TemplateSuggestion;
  });
}

/**
 * 提案を承認（テンプレートに反映）
 */
export async function acceptSuggestion(
  suggestionId: string,
  reviewerId: string,
  reviewerName: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  const db = getAdminDb();

  const suggestion = await getSuggestion(suggestionId);
  if (!suggestion) {
    return { success: false, error: '提案が見つかりません' };
  }

  if (suggestion.status !== 'pending') {
    return { success: false, error: 'この提案は既に処理済みです' };
  }

  // テンプレートを取得
  const templateDoc = await db
    .collection(ACCOUNTING_TEMPLATES_COLLECTION)
    .doc(suggestion.templateId)
    .get();

  if (!templateDoc.exists) {
    return { success: false, error: 'テンプレートが見つかりません' };
  }

  const template = templateDoc.data() as AccountingTemplate;
  const diff = suggestion.aiAnalysis.diff;

  // 差分を適用
  const updatedData: Partial<AccountingTemplate> = {
    updatedAt: new Date(),
  };

  if (diff.name) {
    updatedData.name = diff.name.after;
  }
  if (diff.matchCondition) {
    updatedData.matchCondition = diff.matchCondition.after;
  }
  if (diff.entries) {
    updatedData.entries = diff.entries.after;
  }
  if (diff.descriptionTemplate) {
    updatedData.descriptionTemplate = diff.descriptionTemplate.after;
  }
  if (diff.priority) {
    updatedData.priority = diff.priority.after;
  }

  // バッチ更新
  const batch = db.batch();

  // テンプレートを更新
  batch.update(templateDoc.ref, updatedData);

  // 提案を承認済みに更新
  batch.update(db.collection(TEMPLATE_SUGGESTIONS_COLLECTION).doc(suggestionId), {
    status: 'accepted',
    reviewedBy: reviewerId,
    reviewedByName: reviewerName,
    reviewedAt: new Date(),
    reviewNote: note,
  });

  await batch.commit();

  console.log('[TemplateImprovement] 提案を承認', {
    suggestionId,
    templateId: suggestion.templateId,
    reviewerName,
  });

  return { success: true };
}

/**
 * 提案を見送り
 */
export async function rejectSuggestion(
  suggestionId: string,
  reviewerId: string,
  reviewerName: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  const db = getAdminDb();

  const suggestion = await getSuggestion(suggestionId);
  if (!suggestion) {
    return { success: false, error: '提案が見つかりません' };
  }

  if (suggestion.status !== 'pending') {
    return { success: false, error: 'この提案は既に処理済みです' };
  }

  await db.collection(TEMPLATE_SUGGESTIONS_COLLECTION).doc(suggestionId).update({
    status: 'rejected',
    reviewedBy: reviewerId,
    reviewedByName: reviewerName,
    reviewedAt: new Date(),
    reviewNote: note,
  });

  console.log('[TemplateImprovement] 提案を見送り', {
    suggestionId,
    templateId: suggestion.templateId,
    reviewerName,
  });

  return { success: true };
}

/**
 * 期限切れ提案を更新
 */
export async function expireSuggestions(): Promise<number> {
  const db = getAdminDb();
  const now = new Date();

  const snapshot = await db
    .collection(TEMPLATE_SUGGESTIONS_COLLECTION)
    .where('status', '==', 'pending')
    .where('expiresAt', '<=', now)
    .limit(100)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { status: 'expired' });
  }
  await batch.commit();

  console.log('[TemplateImprovement] 期限切れ提案を更新', {
    count: snapshot.size,
  });

  return snapshot.size;
}

// ======== バッチ処理 ========

/**
 * 全テナントの改善提案を生成（バッチ用）
 */
export async function generateAllSuggestions(): Promise<{
  processed: number;
  generated: number;
  errors: number;
}> {
  const db = getAdminDb();

  // 全テナントを取得（activityのあるテナント）
  const tenantsSnapshot = await db
    .collection('tenants')
    .where('isActive', '==', true)
    .limit(100)
    .get();

  let processed = 0;
  let generated = 0;
  let errors = 0;

  for (const tenantDoc of tenantsSnapshot.docs) {
    const tenantId = tenantDoc.id;

    try {
      // トリガーを満たすテンプレートを検索
      const candidates = await findTemplatesNeedingImprovement(tenantId);

      for (const { template, stats, triggerResult } of candidates) {
        processed++;

        try {
          // 改善提案を生成
          const suggestion = await generateImprovementSuggestion(
            template,
            stats,
            triggerResult
          );

          if (suggestion) {
            await saveSuggestion(suggestion);
            generated++;

            console.log('[TemplateImprovement] 提案生成', {
              tenantId,
              templateId: template.id,
              templateName: template.name,
              triggerReason: triggerResult.reason,
            });
          }
        } catch (error) {
          console.error('[TemplateImprovement] 提案生成エラー', {
            tenantId,
            templateId: template.id,
            error,
          });
          errors++;
        }
      }
    } catch (error) {
      console.error('[TemplateImprovement] テナント処理エラー', {
        tenantId,
        error,
      });
      errors++;
    }
  }

  // 期限切れ提案を更新
  await expireSuggestions();

  return { processed, generated, errors };
}
