// ======== AI副社長「今日のTODO」要約生成ライブラリ ========

import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import type {
  TodoItem,
  TodoRole,
  TodoPriority,
  TodoSource,
  TodoSummary,
  TodoSummaryInput,
  TodoHighlight,
  TodoSummaryResult,
  RoleToneConfig,
} from '@/types/todo';

const DEFAULT_TENANT_ID = 'defaultTenant';
const TODO_SUMMARIES_COLLECTION = 'todoSummaries';

// ======== ロール別トーン設定 ========

const ROLE_TONE_CONFIG: Record<TodoRole, RoleToneConfig> = {
  exec: {
    greeting: 'おはようございます。',
    urgentPrefix: '本日最優先で対応が必要な案件があります。',
    normalPrefix: '本日の確認事項をお伝えします。',
    closingPhrase: 'ご確認をお願いいたします。',
  },
  manager: {
    greeting: 'おはようございます。',
    urgentPrefix: '至急確認が必要な項目があります。',
    normalPrefix: '本日のTODOをまとめました。',
    closingPhrase: 'ご対応よろしくお願いします。',
  },
  staff: {
    greeting: 'おはようございます！',
    urgentPrefix: '急ぎの対応が必要です。',
    normalPrefix: '今日やることをまとめました。',
    closingPhrase: '確認してね。',
  },
};

// ======== ソースラベル ========

const SOURCE_LABELS: Record<TodoSource, string> = {
  OVERTIME: '勤怠',
  APPROVAL: '承認待ち',
  SALES: '営業',
  DOCUMENT: '書類',
  PROSPECT: '入居対応',
};

// ======== AI入力形式 ========

/**
 * AI要約用のアイテム形式
 */
interface AiSummaryItem {
  priority: TodoPriority;
  facts: string;   // 事実（何が起きているか）
  action: string;  // アクション（何をするか）
}

/**
 * AI入力形式
 */
interface AiInputFormat {
  role: TodoRole;
  items: AiSummaryItem[];
}

/**
 * TODOからAI入力形式に変換
 */
function buildAiInput(todos: TodoItem[], role: TodoRole): AiInputFormat {
  const items: AiSummaryItem[] = todos
    .filter((t) => !t.isCompleted)
    .sort((a, b) => {
      const priorityOrder: Record<TodoPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 5)
    .map((todo) => ({
      priority: todo.priority,
      facts: buildFacts(todo),
      action: buildAction(todo),
    }));

  return { role, items };
}

/**
 * 事実を生成（何が起きているか）
 */
function buildFacts(todo: TodoItem): string {
  const source = SOURCE_LABELS[todo.source];

  switch (todo.source) {
    case 'OVERTIME':
      if (todo.title.includes('NG')) {
        return '未申請残業が1件';
      }
      return `勤怠異常が1件（${todo.title}）`;

    case 'APPROVAL':
      const days = todo.staleDays ? `${todo.staleDays}日滞留` : '';
      return `承認待ちが1件${days ? `（${days}）` : ''}`;

    case 'SALES':
      return `営業案件が${todo.staleDays || 7}日以上停滞`;

    case 'DOCUMENT':
      return `未提出書類が1件`;

    case 'PROSPECT':
      return `入居対応が1件`;

    default:
      return todo.title;
  }
}

/**
 * アクションを生成（何をするか）
 */
function buildAction(todo: TodoItem): string {
  switch (todo.source) {
    case 'OVERTIME':
      return '本人への確認';

    case 'APPROVAL':
      return '承認対応';

    case 'SALES':
      return 'フォローアップ確認';

    case 'DOCUMENT':
      return '提出依頼';

    case 'PROSPECT':
      return '進捗確認';

    default:
      return '対応確認';
  }
}

// ======== 構造化データ作成 ========

/**
 * TODOリストから要約用の構造化データを作成
 */
export function buildSummaryInput(
  todos: TodoItem[],
  role: TodoRole,
  date: string
): TodoSummaryInput {
  // 優先度別カウント
  const stats = {
    total: todos.length,
    high: todos.filter((t) => t.priority === 'HIGH').length,
    medium: todos.filter((t) => t.priority === 'MEDIUM').length,
    low: todos.filter((t) => t.priority === 'LOW').length,
    completed: todos.filter((t) => t.isCompleted).length,
  };

  // ハイライト抽出（優先度順、最大5件）
  const highlights: TodoHighlight[] = todos
    .filter((t) => !t.isCompleted)
    .sort((a, b) => {
      const priorityOrder: Record<TodoPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 5)
    .map((todo) => ({
      priority: todo.priority,
      source: todo.source,
      title: todo.title,
      urgencyReason: buildUrgencyReason(todo),
    }));

  return {
    date,
    role,
    stats,
    highlights,
  };
}

/**
 * 緊急性の理由を生成
 */
function buildUrgencyReason(todo: TodoItem): string | undefined {
  if (todo.priority === 'HIGH') {
    if (todo.source === 'OVERTIME') {
      return '残業NG/労務リスク';
    }
    if (todo.staleDays && todo.staleDays >= 3) {
      return `${todo.staleDays}日滞留`;
    }
    return '即対応必要';
  }

  if (todo.staleDays && todo.staleDays >= 2) {
    return `${todo.staleDays}日滞留`;
  }

  if (todo.dueDate) {
    const today = new Date();
    const due = new Date(todo.dueDate);
    const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 0) {
      return '期限超過';
    }
    if (daysUntil <= 3) {
      return `期限${daysUntil}日以内`;
    }
  }

  return undefined;
}

// ======== ルールベース要約 ========

/**
 * ルールベースで要約を生成（AIフォールバック用）
 */
export function generateRuleBasedSummary(input: TodoSummaryInput): string {
  const tone = ROLE_TONE_CONFIG[input.role];
  const parts: string[] = [];

  // 挨拶
  parts.push(tone.greeting);

  // TODOがない場合
  if (input.stats.total === 0) {
    parts.push('本日のTODOはありません。');
    return parts.join('');
  }

  // 緊急案件がある場合
  if (input.stats.high > 0) {
    parts.push(tone.urgentPrefix);

    const highItems = input.highlights.filter((h) => h.priority === 'HIGH');
    if (highItems.length > 0) {
      const item = highItems[0];
      const reason = item.urgencyReason ? `（${item.urgencyReason}）` : '';
      parts.push(`${SOURCE_LABELS[item.source]}関連で${reason}「${item.title}」への対応が必要です。`);
    }
  } else {
    parts.push(tone.normalPrefix);

    // 通常案件
    const sourceCounts: Partial<Record<TodoSource, number>> = {};
    input.highlights.forEach((h) => {
      sourceCounts[h.source] = (sourceCounts[h.source] || 0) + 1;
    });

    const sourceList = Object.entries(sourceCounts)
      .map(([source, count]) => `${SOURCE_LABELS[source as TodoSource]}${count}件`)
      .join('、');

    if (sourceList) {
      parts.push(`${sourceList}の確認をお願いします。`);
    }
  }

  // 全体統計（execとmanager向け）
  if (input.role !== 'staff' && input.stats.total > 0) {
    const remaining = input.stats.total - input.stats.completed;
    if (remaining > 0) {
      parts.push(`全${input.stats.total}件中、${remaining}件が未完了です。`);
    }
  }

  return parts.join('');
}

// ======== AI要約生成 ========

/**
 * AI用プロンプトを生成（新形式：facts/action）
 */
function buildAiPrompt(aiInput: AiInputFormat, stats: { total: number; high: number }): string {
  // アイテムをJSON形式で表示
  const itemsJson = JSON.stringify(aiInput, null, 2);

  return `あなたは業務アシスタントです。
以下の業務一覧を、重要度の高い順に、
3文以内の自然な日本語で要約してください。

・事実を正確に
・行動が分かる表現で
・命令口調や過度な敬語は使わない
・判断や推測はしない

${itemsJson}

【補足】
- 全${stats.total}件中、緊急（HIGH）が${stats.high}件
- 対象者: ${aiInput.role === 'exec' ? '経営層' : aiInput.role === 'manager' ? 'マネージャー' : 'スタッフ'}

要約:`;
}

/**
 * 旧形式のAIプロンプト（フォールバック用）
 */
function buildAiPromptLegacy(input: TodoSummaryInput): string {
  const tone = ROLE_TONE_CONFIG[input.role];

  const roleDescription = {
    exec: '経営者（社長・役員）',
    manager: 'マネージャー・リーダー',
    staff: '現場スタッフ',
  };

  return `あなたはAI副社長として、毎朝のTODO要約を作成します。

【重要ルール】
- 3文以内で簡潔に
- 事実のみを述べる（判断・推測・アドバイスは禁止）
- 「〜してください」「〜すべき」などの指示は禁止
- 数値や件数は正確に
- 敬語レベルは対象者に合わせる

【対象者】
ロール: ${roleDescription[input.role]}

【トーン設定】
- 挨拶: ${tone.greeting}
- 緊急時: ${tone.urgentPrefix}
- 通常時: ${tone.normalPrefix}
- 締め: ${tone.closingPhrase}

【本日のTODOデータ】
日付: ${input.date}
合計: ${input.stats.total}件
- HIGH（緊急）: ${input.stats.high}件
- MEDIUM（重要）: ${input.stats.medium}件
- LOW（通常）: ${input.stats.low}件
- 完了済み: ${input.stats.completed}件

【主要案件】
${input.highlights.length === 0
  ? '特になし'
  : input.highlights.map((h, i) => {
      const reason = h.urgencyReason ? ` [${h.urgencyReason}]` : '';
      return `${i + 1}. [${h.priority}] ${SOURCE_LABELS[h.source]}: ${h.title}${reason}`;
    }).join('\n')
}

【出力】
3文以内の自然な日本語で要約を出力してください。JSON形式は不要です。`;
}

/**
 * AIで要約を生成（新形式）
 */
async function generateAiSummary(
  input: TodoSummaryInput,
  todos: TodoItem[]
): Promise<TodoSummaryResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, using rule-based summary');
    return {
      success: true,
      summary: generateRuleBasedSummary(input),
      generatedBy: 'rule',
    };
  }

  // TODOがない場合はルールベース
  if (todos.length === 0 || input.stats.total === 0) {
    return {
      success: true,
      summary: generateRuleBasedSummary(input),
      generatedBy: 'rule',
    };
  }

  try {
    const client = new Anthropic({ apiKey });

    // 新形式の入力を構築
    const aiInput = buildAiInput(todos, input.role);
    const prompt = buildAiPrompt(aiInput, {
      total: input.stats.total,
      high: input.stats.high,
    });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const response = message.content[0].type === 'text' ? message.content[0].text : '';

    // 要約が長すぎる場合はルールベースにフォールバック
    const sentences = response.split(/[。！？]/).filter(Boolean);
    if (sentences.length > 4) {
      console.warn('AI summary too long, using rule-based fallback');
      return {
        success: true,
        summary: generateRuleBasedSummary(input),
        generatedBy: 'rule',
      };
    }

    return {
      success: true,
      summary: response.trim(),
      generatedBy: 'ai',
    };
  } catch (error) {
    console.error('AI summary generation failed:', error);
    return {
      success: true,
      summary: generateRuleBasedSummary(input),
      generatedBy: 'rule',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ======== 要約保存・取得 ========

/**
 * ロール別に要約を生成して保存
 */
export async function generateAndSaveSummaries(
  todos: TodoItem[],
  date: string
): Promise<{ role: TodoRole; summary: TodoSummary }[]> {
  const db = getAdminDb();
  const roles: TodoRole[] = ['exec', 'manager', 'staff'];
  const results: { role: TodoRole; summary: TodoSummary }[] = [];

  for (const role of roles) {
    // ロールに該当するTODOをフィルタ
    const roleTodos = todos.filter((t) => t.userRole === role);

    // 構造化データを作成
    const input = buildSummaryInput(roleTodos, role, date);

    // AI要約を生成（todosも渡す）
    const summaryResult = await generateAiSummary(input, roleTodos);

    const summary: TodoSummary = {
      tenantId: DEFAULT_TENANT_ID,
      date,
      role,
      summary: summaryResult.summary,
      generatedBy: summaryResult.generatedBy,
      stats: {
        total: input.stats.total,
        high: input.stats.high,
        medium: input.stats.medium,
        low: input.stats.low,
      },
      createdAt: new Date(),
    };

    // Firestoreに保存
    const docRef = await db.collection(TODO_SUMMARIES_COLLECTION).add({
      ...summary,
      createdAt: FieldValue.serverTimestamp(),
    });

    summary.id = docRef.id;
    results.push({ role, summary });
  }

  return results;
}

/**
 * 指定日の要約を取得
 * 注意: インデックス制限を回避するため、最小限のクエリでJS側フィルタ
 */
export async function getTodoSummary(
  date: string,
  role: TodoRole
): Promise<TodoSummary | null> {
  const db = getAdminDb();

  try {
    // 最小限のwhere条件（tenantId + date）でクエリ
    const snapshot = await db
      .collection(TODO_SUMMARIES_COLLECTION)
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .where('date', '==', date)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    if (snapshot.empty) {
      return null;
    }

    // JS側でroleフィルタ
    const filtered = snapshot.docs
      .map((doc) => ({ doc, data: doc.data() }))
      .filter(({ data }) => data.role === role)
      .sort((a, b) => {
        const aTime = a.data.createdAt?.toDate?.()?.getTime() || 0;
        const bTime = b.data.createdAt?.toDate?.()?.getTime() || 0;
        return bTime - aTime;
      });

    if (filtered.length === 0) {
      return null;
    }

    const { doc, data } = filtered[0];

    return {
      id: doc.id,
      tenantId: data.tenantId,
      date: data.date,
      role: data.role,
      userId: data.userId,
      summary: data.summary,
      generatedBy: data.generatedBy,
      stats: data.stats,
      createdAt: data.createdAt?.toDate?.() || new Date(),
    };
  } catch (error) {
    console.error('getTodoSummary error:', error);
    return null;
  }
}

/**
 * 全ロールの要約を取得
 */
export async function getAllTodoSummaries(
  date: string
): Promise<Record<TodoRole, TodoSummary | null>> {
  const roles: TodoRole[] = ['exec', 'manager', 'staff'];
  const result: Record<TodoRole, TodoSummary | null> = {
    exec: null,
    manager: null,
    staff: null,
  };

  for (const role of roles) {
    result[role] = await getTodoSummary(date, role);
  }

  return result;
}
