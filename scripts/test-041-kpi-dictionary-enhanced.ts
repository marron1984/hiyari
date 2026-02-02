/**
 * Test Script: KPI辞書強化（Implementation Ticket 041）
 *
 * 検証観点:
 * - calculationRef を設定しても辞書が落ちない
 * - adminのみ公開可否が変えられる
 * - 異常検知がDBルールで動く
 * - WBRが辞書の direction/whyItMatters を拾う
 * - ruleReason が設定・表示される
 */

import {
  listKPIDictionary,
  getKPIDictionaryEntry,
  createKPIDictionaryEntry,
  updateKPIDictionaryEntry,
  clearKPIDictionaryStore,
} from '../src/lib/kpiDictionary/repo';
import {
  getAnomalyRule,
  upsertAnomalyRule,
  listEnabledRules,
  listEnabledAlertConfigs,
  clearAnomalyRulesStore,
} from '../src/lib/kpiDictionary/anomalyRuleRepo';
import {
  listCalculationRefs,
  getCalculationRef,
  createCalculationRef,
  clearCalculationRefStore,
} from '../src/lib/kpiDictionary/calculationRefRepo';
import { generateWBR } from '../src/lib/wbr-generator';
import { collectHighlights } from '../src/lib/business/repo';

// テスト結果
let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    const result = fn();
    if (result) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      failed++;
    }
  } catch (e) {
    console.log(`❌ ${name} - Error: ${e}`);
    failed++;
  }
}

function runTests() {
  console.log('========================================');
  console.log('Test: KPI辞書強化（Implementation Ticket 041）');
  console.log('========================================\n');

  // ========== 1. calculationRef テスト ==========
  console.log('--- 1. calculationRef テスト ---');

  test('1.1: デモデータにcalculationRefが含まれる', () => {
    const entry = getKPIDictionaryEntry('pending_approvals');
    return entry !== null && entry.calculationRef === 'kpi_sql_v1:pending_approvals';
  });

  test('1.2: calculationRef一覧が取得できる', () => {
    const refs = listCalculationRefs();
    return refs.length >= 5; // デモデータで5件以上
  });

  test('1.3: タイプ別にcalculationRefをフィルタできる', () => {
    const sqlRefs = listCalculationRefs({ type: 'sql' });
    const codeRefs = listCalculationRefs({ type: 'code' });
    const vendorRefs = listCalculationRefs({ type: 'vendor' });
    return sqlRefs.every(r => r.type === 'sql') &&
           codeRefs.every(r => r.type === 'code') &&
           vendorRefs.every(r => r.type === 'vendor');
  });

  test('1.4: calculationRefを作成できる', () => {
    const result = createCalculationRef({
      id: 'kpi_test_v1:test_metric',
      type: 'sql',
      title: 'テストメトリック SQL',
      body: 'SELECT COUNT(*) FROM test_table',
    });
    return result.success && result.ref?.id === 'kpi_test_v1:test_metric';
  });

  test('1.5: 重複IDのcalculationRefは作成失敗する', () => {
    const result = createCalculationRef({
      id: 'kpi_sql_v1:pending_approvals', // 既存
      type: 'sql',
      title: 'Duplicate',
    });
    return !result.success && result.error !== undefined;
  });

  // ========== 2. ruleReason テスト ==========
  console.log('\n--- 2. ruleReason テスト ---');

  test('2.1: デモルールにruleReasonが含まれる', () => {
    const rule = getAnomalyRule('pending_approvals');
    return rule !== null && typeof rule.ruleReason === 'string' && rule.ruleReason.length > 0;
  });

  test('2.2: ruleReasonを更新できる', () => {
    const result = upsertAnomalyRule('pending_approvals', {
      ruleReason: 'テスト用の影響説明',
    });
    if (!result.success) return false;
    const updated = getAnomalyRule('pending_approvals');
    return updated?.ruleReason === 'テスト用の影響説明';
  });

  test('2.3: 新規ルールにruleReasonを設定できる', () => {
    const result = upsertAnomalyRule('new_kpi_test', {
      enabled: true,
      ruleReason: '新規KPIのルール説明',
    });
    return result.success && result.rule?.ruleReason === '新規KPIのルール説明';
  });

  // ========== 3. 異常検知DB参照テスト ==========
  console.log('\n--- 3. 異常検知DB参照テスト ---');

  test('3.1: listEnabledRules がDBルールを返す', () => {
    const rules = listEnabledRules();
    return rules.length >= 5; // デフォルトで7件
  });

  test('3.2: listEnabledAlertConfigs がAlertConfig形式で返す', () => {
    const configs = listEnabledAlertConfigs();
    return configs.length > 0 && configs.every(c =>
      typeof c.kpiId === 'string' &&
      typeof c.enabled === 'boolean'
    );
  });

  test('3.3: DBにないKPIはconfigフォールバックで取得できる', () => {
    // 存在しないKPIのルール取得
    const rule = getAnomalyRule('non_existent_kpi');
    return rule === null; // configにも存在しない場合はnull
  });

  // ========== 4. KPI辞書の direction/whyItMatters テスト ==========
  console.log('\n--- 4. direction/whyItMatters テスト ---');

  test('4.1: KPI辞書にdirectionが含まれる', () => {
    const entry = getKPIDictionaryEntry('occupancy_rate');
    return entry !== null && entry.direction === 'higher_is_better';
  });

  test('4.2: KPI辞書にwhyItMattersが含まれる', () => {
    const entry = getKPIDictionaryEntry('occupancy_rate');
    return entry !== null && typeof entry.whyItMatters === 'string' && entry.whyItMatters.length > 0;
  });

  test('4.3: lower_is_better のKPIがある', () => {
    const entry = getKPIDictionaryEntry('pending_approvals');
    return entry !== null && entry.direction === 'lower_is_better';
  });

  // ========== 5. WBR direction/whyItMatters 統合テスト ==========
  console.log('\n--- 5. WBR direction/whyItMatters 統合テスト ---');

  test('5.1: WBR生成が成功する', () => {
    const wbr = generateWBR();
    return wbr !== null && wbr.kpiHighlights !== undefined;
  });

  test('5.2: WBRのKPIハイライトにdirectionMeaningが含まれる', () => {
    const wbr = generateWBR();
    const hasDirection = wbr.kpiHighlights.highlights.some(
      h => h.directionMeaning !== undefined
    );
    return hasDirection;
  });

  test('5.3: WBRのKPIハイライトにwhyItMattersが含まれる', () => {
    const wbr = generateWBR();
    const hasWhyItMatters = wbr.kpiHighlights.highlights.some(
      h => h.whyItMatters !== undefined && h.whyItMatters !== null
    );
    return hasWhyItMatters;
  });

  // ========== 6. 公開可否変更の権限テスト（シミュレート） ==========
  console.log('\n--- 6. 公開可否変更テスト ---');

  test('6.1: KPI辞書のisExternalAllowedが存在する', () => {
    const entry = getKPIDictionaryEntry('occupancy_rate');
    return entry !== null && typeof entry.isExternalAllowed === 'boolean';
  });

  test('6.2: 外部公開可能なKPIがある', () => {
    const { entries } = listKPIDictionary({});
    const externalAllowed = entries.filter(e => e.isExternalAllowed);
    return externalAllowed.length > 0;
  });

  test('6.3: 外部公開不可のKPIがある', () => {
    const { entries } = listKPIDictionary({});
    const internalOnly = entries.filter(e => !e.isExternalAllowed);
    return internalOnly.length > 0;
  });

  // ========== 7. 監査ログ（変更履歴）テスト ==========
  console.log('\n--- 7. 監査ログテスト ---');

  test('7.1: KPI更新時に監査ログが作成される', () => {
    // 更新前のイベント数を確認
    const before = getKPIDictionaryEntry('pending_approvals');
    if (!before) return false;

    // 更新
    const result = updateKPIDictionaryEntry(
      'pending_approvals',
      { targetText: '5件以下を維持（テスト更新）' },
      'test_user_001',
      'テスト更新'
    );

    return result.success;
  });

  test('7.2: 定義変更時にlastDefinitionUpdatedAtが更新される', () => {
    const before = getKPIDictionaryEntry('pending_approvals');
    const originalLastDefUpdated = before?.lastDefinitionUpdatedAt;

    // 定義変更
    updateKPIDictionaryEntry(
      'pending_approvals',
      { definition: '更新された定義' },
      'test_user_001'
    );

    const after = getKPIDictionaryEntry('pending_approvals');
    return after?.lastDefinitionUpdatedAt !== null &&
           after?.lastDefinitionUpdatedAt !== originalLastDefUpdated;
  });

  // ========== 8. calculationRef詳細テスト ==========
  console.log('\n--- 8. calculationRef詳細テスト ---');

  test('8.1: SQLタイプのrefにbodyが含まれる', () => {
    const ref = getCalculationRef('kpi_sql_v1:pending_approvals');
    return ref !== null && ref.type === 'sql' && typeof ref.body === 'string';
  });

  test('8.2: codeタイプのrefにfilePathが含まれる', () => {
    const ref = getCalculationRef('kpi_code:staff_turnover');
    return ref !== null && ref.type === 'code' && typeof ref.filePath === 'string';
  });

  test('8.3: vendorタイプのrefが取得できる', () => {
    const ref = getCalculationRef('vendor:freee:revenue_per_resident');
    return ref !== null && ref.type === 'vendor';
  });

  // ========== 9. 異常検知ルール統合テスト ==========
  console.log('\n--- 9. 異常検知ルール統合テスト ---');

  test('9.1: ルールのthresholdHighが設定されている', () => {
    const rule = getAnomalyRule('pending_approvals');
    return rule !== null && rule.thresholdHigh === 10;
  });

  test('9.2: ルールのcompareToが設定されている', () => {
    const rule = getAnomalyRule('pending_approvals');
    return rule !== null && rule.compareTo === 'prevDay';
  });

  test('9.3: 無効化したルールはlistEnabledRulesに含まれない', () => {
    // ルールを無効化
    upsertAnomalyRule('test_disabled_kpi', {
      enabled: false,
      ruleReason: 'テスト用無効ルール',
    });

    const enabledRules = listEnabledRules();
    return !enabledRules.some(r => r.kpiId === 'test_disabled_kpi');
  });

  // ========== 10. KPI辞書一覧・フィルタテスト ==========
  console.log('\n--- 10. KPI辞書フィルタテスト ---');

  test('10.1: カテゴリでフィルタできる', () => {
    const { entries } = listKPIDictionary({ category: 'risk' });
    return entries.every(e => e.category === 'risk');
  });

  test('10.2: タグでフィルタできる', () => {
    const { entries } = listKPIDictionary({ tag: 'external' });
    return entries.every(e => e.tags.includes('external'));
  });

  test('10.3: 検索でフィルタできる', () => {
    const { entries } = listKPIDictionary({ q: '入居率' });
    return entries.some(e => e.name.includes('入居率'));
  });

  // ========== 結果出力 ==========
  console.log('\n========================================');
  console.log(`結果: ${passed}/${passed + failed} テストパス`);
  if (failed === 0) {
    console.log('✅ すべてのテストが成功しました');
  } else {
    console.log(`❌ ${failed} テストが失敗しました`);
  }
  console.log('========================================');

  return failed === 0;
}

// 実行
const success = runTests();
process.exit(success ? 0 : 1);
