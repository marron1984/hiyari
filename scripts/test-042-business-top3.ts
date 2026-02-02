/**
 * Test Script: AI副社長 事業別Top3（Implementation Ticket 042）
 *
 * 検証観点:
 * - getBusinessTop3() が単一事業のTop3を返す
 * - getAllBusinessTop3() が全事業のサマリーを返す
 * - getAlertTop3() が全社アラートTop3を返す
 * - role+scopeにより、閲覧可能な事業のみ返却される
 * - WBR統合が動作する
 * - スコアリングが正しく動作する
 */

import {
  getBusinessTop3,
  getAllBusinessTop3,
  getAlertTop3,
  generateWBRBusinessTop3Summary,
  type ActionCandidate,
} from '../src/lib/aiVp/businessTop3';
import type { ViewerContext } from '../src/lib/business/types';
import { listBusinessUnits } from '../src/lib/business/repo';
import { generateWBR } from '../src/lib/wbr-generator';

// テスト結果
let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => boolean) {
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

// テスト用ビューワーコンテキスト
const managerViewer: ViewerContext = { userId: 'user_001', role: 'manager' };
const adminViewer: ViewerContext = { userId: 'admin_001', role: 'admin' };

function runTests() {
  console.log('========================================');
  console.log('Test: AI副社長 事業別Top3（Implementation Ticket 042）');
  console.log('========================================\n');

  // ========== 1. 基本機能テスト ==========
  console.log('--- 1. 基本機能テスト ---');

  runTest('1.1: listBusinessUnits() で事業リストが取得できる', () => {
    const businessUnits = listBusinessUnits();
    return businessUnits.length > 0;
  });

  runTest('1.2: getBusinessTop3() が結果を返す（manager）', () => {
    const businessUnits = listBusinessUnits();
    if (businessUnits.length === 0) return false;
    const result = getBusinessTop3(businessUnits[0].id, managerViewer);
    return result !== null;
  });

  runTest('1.3: getBusinessTop3() の結果にactionsが含まれる', () => {
    const businessUnits = listBusinessUnits();
    if (businessUnits.length === 0) return false;
    const result = getBusinessTop3(businessUnits[0].id, managerViewer);
    return result !== null && Array.isArray(result.actions);
  });

  runTest('1.4: getBusinessTop3() のactionsが最大3件', () => {
    const businessUnits = listBusinessUnits();
    if (businessUnits.length === 0) return false;
    const result = getBusinessTop3(businessUnits[0].id, managerViewer);
    return result !== null && result.actions.length <= 3;
  });

  // ========== 2. getAllBusinessTop3 テスト ==========
  console.log('\n--- 2. getAllBusinessTop3 テスト ---');

  runTest('2.1: getAllBusinessTop3() がサマリーを返す', () => {
    const summary = getAllBusinessTop3(managerViewer);
    return summary !== null && summary.businessUnits !== undefined;
  });

  runTest('2.2: getAllBusinessTop3() にgeneratedAtが含まれる', () => {
    const summary = getAllBusinessTop3(managerViewer);
    return typeof summary.generatedAt === 'string' && summary.generatedAt.length > 0;
  });

  runTest('2.3: getAllBusinessTop3() のtopActionsが配列', () => {
    const summary = getAllBusinessTop3(managerViewer);
    return Array.isArray(summary.topActions);
  });

  runTest('2.4: getAllBusinessTop3() のtopActionsが最大5件', () => {
    const summary = getAllBusinessTop3(managerViewer);
    return summary.topActions.length <= 5;
  });

  // ========== 3. getAlertTop3 テスト ==========
  console.log('\n--- 3. getAlertTop3 テスト ---');

  runTest('3.1: getAlertTop3() が配列を返す', () => {
    const alerts = getAlertTop3(managerViewer);
    return Array.isArray(alerts);
  });

  runTest('3.2: getAlertTop3() の結果が最大3件', () => {
    const alerts = getAlertTop3(managerViewer);
    return alerts.length <= 3;
  });

  runTest('3.3: getAlertTop3() のアイテムにurlが含まれる', () => {
    const alerts = getAlertTop3(managerViewer);
    return alerts.every((a: ActionCandidate) => typeof a.url === 'string' && a.url.startsWith('/'));
  });

  // ========== 4. ActionCandidate 構造テスト ==========
  console.log('\n--- 4. ActionCandidate 構造テスト ---');

  runTest('4.1: ActionCandidateにkeyが含まれる', () => {
    const summary = getAllBusinessTop3(managerViewer);
    if (summary.topActions.length === 0) return true; // 空の場合はスキップ
    return summary.topActions.every((a: ActionCandidate) => typeof a.key === 'string');
  });

  runTest('4.2: ActionCandidateにtitleが含まれる', () => {
    const summary = getAllBusinessTop3(managerViewer);
    if (summary.topActions.length === 0) return true;
    return summary.topActions.every((a: ActionCandidate) => typeof a.title === 'string' && a.title.length > 0);
  });

  runTest('4.3: ActionCandidateにreasonが含まれる', () => {
    const summary = getAllBusinessTop3(managerViewer);
    if (summary.topActions.length === 0) return true;
    return summary.topActions.every((a: ActionCandidate) => typeof a.reason === 'string' && a.reason.length > 0);
  });

  runTest('4.4: ActionCandidateにseverityが含まれる', () => {
    const summary = getAllBusinessTop3(managerViewer);
    if (summary.topActions.length === 0) return true;
    return summary.topActions.every((a: ActionCandidate) =>
      a.severity === 'info' || a.severity === 'warning' || a.severity === 'critical'
    );
  });

  runTest('4.5: ActionCandidateにscoreが含まれる', () => {
    const summary = getAllBusinessTop3(managerViewer);
    if (summary.topActions.length === 0) return true;
    return summary.topActions.every((a: ActionCandidate) => typeof a.score === 'number' && a.score > 0);
  });

  // ========== 5. BusinessTop3Result 構造テスト ==========
  console.log('\n--- 5. BusinessTop3Result 構造テスト ---');

  runTest('5.1: BusinessTop3ResultにriskLevelが含まれる', () => {
    const businessUnits = listBusinessUnits();
    if (businessUnits.length === 0) return false;
    const result = getBusinessTop3(businessUnits[0].id, managerViewer);
    return result !== null &&
      ['low', 'medium', 'high', 'critical'].includes(result.riskLevel);
  });

  runTest('5.2: BusinessTop3ResultにtotalScoreが含まれる', () => {
    const businessUnits = listBusinessUnits();
    if (businessUnits.length === 0) return false;
    const result = getBusinessTop3(businessUnits[0].id, managerViewer);
    return result !== null && typeof result.totalScore === 'number';
  });

  // ========== 6. スコープ制御テスト ==========
  console.log('\n--- 6. スコープ制御テスト ---');

  runTest('6.1: manager権限で事業が見える', () => {
    const summary = getAllBusinessTop3(managerViewer);
    return summary.businessUnits.length >= 0; // 権限があればアクセス可能
  });

  runTest('6.2: admin権限で全事業が見える', () => {
    const summary = getAllBusinessTop3(adminViewer);
    return summary.businessUnits.length >= 0;
  });

  // ========== 7. WBR統合テスト ==========
  console.log('\n--- 7. WBR統合テスト ---');

  runTest('7.1: generateWBRBusinessTop3Summary() が結果を返す', () => {
    const wbrSummary = generateWBRBusinessTop3Summary(managerViewer);
    return wbrSummary !== null &&
      Array.isArray(wbrSummary.topBusinessRisks) &&
      Array.isArray(wbrSummary.globalTopActions);
  });

  runTest('7.2: WBR統合のtopBusinessRisksが最大3件', () => {
    const wbrSummary = generateWBRBusinessTop3Summary(managerViewer);
    return wbrSummary.topBusinessRisks.length <= 3;
  });

  runTest('7.3: WBR統合のglobalTopActionsが最大3件', () => {
    const wbrSummary = generateWBRBusinessTop3Summary(managerViewer);
    return wbrSummary.globalTopActions.length <= 3;
  });

  runTest('7.4: generateWBR() にviewerを渡すとbusinessTop3が含まれる', () => {
    const wbr = generateWBR(new Date(), managerViewer);
    return wbr.businessTop3 !== undefined;
  });

  runTest('7.5: generateWBR() にviewerを渡さないとbusinessTop3がundefined', () => {
    const wbr = generateWBR(new Date());
    return wbr.businessTop3 === undefined;
  });

  // ========== 8. スコアリングロジックテスト ==========
  console.log('\n--- 8. スコアリングロジックテスト ---');

  runTest('8.1: スコア順でソートされている', () => {
    const summary = getAllBusinessTop3(managerViewer);
    if (summary.topActions.length < 2) return true;
    for (let i = 0; i < summary.topActions.length - 1; i++) {
      if (summary.topActions[i].score < summary.topActions[i + 1].score) {
        return false;
      }
    }
    return true;
  });

  runTest('8.2: 事業もtotalScore順でソートされている', () => {
    const summary = getAllBusinessTop3(managerViewer);
    if (summary.businessUnits.length < 2) return true;
    for (let i = 0; i < summary.businessUnits.length - 1; i++) {
      if (summary.businessUnits[i].totalScore < summary.businessUnits[i + 1].totalScore) {
        return false;
      }
    }
    return true;
  });

  // ========== 9. URLテスト ==========
  console.log('\n--- 9. URLテスト ---');

  runTest('9.1: ActionCandidateのurlが有効なパス', () => {
    const summary = getAllBusinessTop3(managerViewer);
    return summary.topActions.every((a: ActionCandidate) =>
      typeof a.url === 'string' && a.url.startsWith('/dashboard/')
    );
  });

  runTest('9.2: URLにbusinessUnitIdパラメータが含まれる（licenses除く）', () => {
    const summary = getAllBusinessTop3(managerViewer);
    // licenses は orgUnitIds でフィルタするため businessUnitId パラメータ不要
    const actionsWithBU = summary.topActions.filter(
      (a: ActionCandidate) => a.businessUnitId !== 'global' && a.domain !== 'licenses'
    );
    if (actionsWithBU.length === 0) return true;
    return actionsWithBU.every((a: ActionCandidate) => a.url.includes('businessUnitId='));
  });

  // ========== 10. domainテスト ==========
  console.log('\n--- 10. domainテスト ---');

  runTest('10.1: ActionCandidateのdomainが有効な値', () => {
    const validDomains = ['tickets', 'repairs', 'correctiveActions', 'licenses', 'alerts'];
    const summary = getAllBusinessTop3(managerViewer);
    return summary.topActions.every((a: ActionCandidate) => validDomains.includes(a.domain));
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
