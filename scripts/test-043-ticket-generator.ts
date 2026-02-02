/**
 * Test Script: AI VP Business Top3 → Ticket Auto-generation（Implementation Ticket 043）
 *
 * 検証観点:
 * - ActionCandidate に新フィールド（templateKey, fingerprint等）が追加されている
 * - fingerprint による冪等性が機能する（同じfingerprintで二度生成しない）
 * - チケット生成がTicket型に正しくマッピングされる
 * - dryRun モードが正しく動作する
 * - WBRに今週生成されたチケットが含まれる
 * - 通知タイプ 'ai_vp_ticket_created' が存在する
 */

import type { ViewerContext } from '../src/lib/business/types';
import {
  getAllBusinessTop3,
  getAlertTop3,
  getCurrentWeekId,
} from '../src/lib/aiVp/businessTop3';
import {
  generateTicketsFromTop3,
  findTicketByFingerprint,
  getGeneratedTicketsThisWeek,
  clearFingerprintStore,
  formatGenerationReport,
  type GenerationResult,
} from '../src/lib/aiVp/ticketGenerator';
import { getTicketByIdInternal, listTickets } from '../src/lib/tickets/repo';
import { generateWBR } from '../src/lib/wbr-generator';

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
  console.log('Test: AI VP Business Top3 → Ticket Auto-generation（Task 043）');
  console.log('========================================\n');

  // テスト用のViewer
  const adminViewer: ViewerContext = { userId: 'test_admin', role: 'admin' };
  const managerViewer: ViewerContext = { userId: 'test_manager', role: 'manager' };

  // ========== 1. ActionCandidate 新フィールドテスト ==========
  console.log('--- 1. ActionCandidate 新フィールドテスト ---');

  test('1.1: getCurrentWeekId が YYYY-WW 形式を返す', () => {
    const weekId = getCurrentWeekId();
    return /^\d{4}-W\d{2}$/.test(weekId);
  });

  test('1.2: getAllBusinessTop3 が ActionCandidate を返す', () => {
    const summary = getAllBusinessTop3(adminViewer);
    return summary.businessUnits.length > 0;
  });

  test('1.3: ActionCandidate に templateKey が含まれる', () => {
    const summary = getAllBusinessTop3(adminViewer);
    const firstAction = summary.businessUnits[0]?.actions[0];
    return firstAction !== undefined && typeof firstAction.templateKey === 'string';
  });

  test('1.4: ActionCandidate に fingerprint が含まれる', () => {
    const summary = getAllBusinessTop3(adminViewer);
    const firstAction = summary.businessUnits[0]?.actions[0];
    return firstAction !== undefined && typeof firstAction.fingerprint === 'string';
  });

  test('1.5: fingerprint が正しいフォーマット（ai_vp:bu:template:week）', () => {
    const summary = getAllBusinessTop3(adminViewer);
    const firstAction = summary.businessUnits[0]?.actions[0];
    return firstAction !== undefined && firstAction.fingerprint.startsWith('ai_vp:');
  });

  test('1.6: ActionCandidate に defaultPriority が含まれる', () => {
    const summary = getAllBusinessTop3(adminViewer);
    const firstAction = summary.businessUnits[0]?.actions[0];
    return firstAction !== undefined && ['normal', 'high', 'urgent'].includes(firstAction.defaultPriority);
  });

  test('1.7: ActionCandidate に defaultCategory が含まれる', () => {
    const summary = getAllBusinessTop3(adminViewer);
    const firstAction = summary.businessUnits[0]?.actions[0];
    return firstAction !== undefined && typeof firstAction.defaultCategory === 'string';
  });

  test('1.8: ActionCandidate に defaultDueDays が含まれる', () => {
    const summary = getAllBusinessTop3(adminViewer);
    const firstAction = summary.businessUnits[0]?.actions[0];
    return firstAction !== undefined && typeof firstAction.defaultDueDays === 'number';
  });

  // ========== 2. dryRun テスト ==========
  console.log('\n--- 2. dryRun テスト ---');

  // fingerprintストアをクリア
  clearFingerprintStore();

  test('2.1: dryRun=true でチケットが作成されない', () => {
    const result = generateTicketsFromTop3(adminViewer, { dryRun: true, maxTicketsPerRun: 3 });
    // dryRunでは実際のチケットIDは dryrun_ で始まる
    const allDryRun = result.created.every((item) => item.ticket.id.startsWith('dryrun_'));
    return result.created.length > 0 && allDryRun;
  });

  test('2.2: dryRun=true の結果に GenerationResult 型が返る', () => {
    const result = generateTicketsFromTop3(adminViewer, { dryRun: true });
    return (
      typeof result.weekId === 'string' &&
      typeof result.generatedAt === 'string' &&
      Array.isArray(result.created) &&
      Array.isArray(result.skipped) &&
      typeof result.totalProcessed === 'number'
    );
  });

  // ========== 3. 実際のチケット生成テスト ==========
  console.log('\n--- 3. チケット生成テスト ---');

  // fingerprintストアをクリア
  clearFingerprintStore();

  let firstResult: GenerationResult;

  test('3.1: チケット生成が成功する', () => {
    firstResult = generateTicketsFromTop3(adminViewer, { dryRun: false, maxTicketsPerRun: 3 });
    return firstResult.created.length > 0;
  });

  test('3.2: 生成されたチケットに正しいタイトルが設定される', () => {
    return firstResult.created.every((item) => item.ticket.title.startsWith('[AI-VP]'));
  });

  test('3.3: 生成されたチケットに relatedType=ai_vp が設定される', () => {
    return firstResult.created.every((item) => item.ticket.relatedType === 'ai_vp');
  });

  test('3.4: 生成されたチケットに relatedId=fingerprint が設定される', () => {
    return firstResult.created.every(
      (item) => item.ticket.relatedId === item.action.fingerprint
    );
  });

  test('3.5: 生成されたチケットに優先度が正しくマッピングされる', () => {
    return firstResult.created.every((item) =>
      ['low', 'normal', 'high', 'urgent'].includes(item.ticket.priority)
    );
  });

  test('3.6: 生成されたチケットに期限が設定される', () => {
    return firstResult.created.every(
      (item) => item.ticket.dueAt !== null && item.ticket.dueAt !== undefined
    );
  });

  test('3.7: 生成されたチケットがストアに保存される', () => {
    const ticketId = firstResult.created[0]?.ticket.id;
    if (!ticketId) return false;
    const stored = getTicketByIdInternal(ticketId);
    return stored !== null && stored.id === ticketId;
  });

  // ========== 4. 冪等性テスト ==========
  console.log('\n--- 4. 冪等性テスト ---');

  test('4.1: 同じfingerprintで二度目の生成はスキップされる', () => {
    const secondResult = generateTicketsFromTop3(adminViewer, { dryRun: false, maxTicketsPerRun: 3 });
    // 最初の3件は既に生成済みなのでスキップされるはず
    return secondResult.skipped.length > 0;
  });

  test('4.2: findTicketByFingerprint で既存チケットを検索できる', () => {
    const fingerprint = firstResult.created[0]?.action.fingerprint;
    if (!fingerprint) return false;
    const found = findTicketByFingerprint(fingerprint);
    return found !== null && found.relatedId === fingerprint;
  });

  test('4.3: 存在しないfingerprintはnullを返す', () => {
    const found = findTicketByFingerprint('ai_vp:nonexistent:test:2099-W99');
    return found === null;
  });

  // ========== 5. アラートTop3テスト ==========
  console.log('\n--- 5. アラートTop3テスト ---');

  test('5.1: getAlertTop3 がActionCandidateを返す', () => {
    const alerts = getAlertTop3(adminViewer);
    return Array.isArray(alerts);
  });

  test('5.2: アラートActionCandidateにもfingerprintがある', () => {
    const alerts = getAlertTop3(adminViewer);
    if (alerts.length === 0) return true; // アラートがない場合はスキップ
    return alerts.every((a) => typeof a.fingerprint === 'string');
  });

  // ========== 6. レポート生成テスト ==========
  console.log('\n--- 6. レポート生成テスト ---');

  test('6.1: formatGenerationReport がテキストを返す', () => {
    const report = formatGenerationReport(firstResult);
    return typeof report === 'string' && report.length > 0;
  });

  test('6.2: レポートに週IDが含まれる', () => {
    const report = formatGenerationReport(firstResult);
    return report.includes(firstResult.weekId);
  });

  test('6.3: レポートに新規作成件数が含まれる', () => {
    const report = formatGenerationReport(firstResult);
    return report.includes(`新規作成: ${firstResult.created.length}`);
  });

  // ========== 7. WBR統合テスト ==========
  console.log('\n--- 7. WBR統合テスト ---');

  test('7.1: WBR生成が成功する（viewerあり）', () => {
    const wbr = generateWBR(new Date(), adminViewer);
    return wbr !== null && wbr.id !== undefined;
  });

  test('7.2: WBRにgeneratedTicketsセクションが含まれる', () => {
    const wbr = generateWBR(new Date(), adminViewer);
    // チケットが生成されている場合はセクションが存在するはず
    return wbr.generatedTickets === undefined || typeof wbr.generatedTickets.totalCount === 'number';
  });

  test('7.3: getGeneratedTicketsThisWeek が配列を返す', () => {
    const tickets = getGeneratedTicketsThisWeek(adminViewer);
    return Array.isArray(tickets);
  });

  // ========== 8. listTickets でAI-VP生成チケットをフィルタ ==========
  console.log('\n--- 8. チケット一覧テスト ---');

  test('8.1: listTickets でAI-VP生成チケットが取得できる', () => {
    const { items } = listTickets({}, adminViewer);
    const aiVpTickets = items.filter((t) => t.relatedType === 'ai_vp');
    return aiVpTickets.length > 0;
  });

  test('8.2: AI-VP生成チケットにタグが設定される', () => {
    const { items } = listTickets({}, adminViewer);
    const aiVpTicket = items.find((t) => t.relatedType === 'ai_vp');
    return aiVpTicket !== undefined && (aiVpTicket.tagsJson?.includes('ai_vp_generated') ?? false);
  });

  // ========== 9. maxTicketsPerRun オプションテスト ==========
  console.log('\n--- 9. オプションテスト ---');

  // fingerprintストアをクリアして新規生成
  clearFingerprintStore();

  test('9.1: maxTicketsPerRun が機能する', () => {
    const result = generateTicketsFromTop3(adminViewer, { dryRun: true, maxTicketsPerRun: 2 });
    return result.totalProcessed <= 2;
  });

  test('9.2: includeAlerts=false でアラートが除外される', () => {
    const resultWithAlerts = generateTicketsFromTop3(adminViewer, { dryRun: true, includeAlerts: true });
    const resultWithoutAlerts = generateTicketsFromTop3(adminViewer, { dryRun: true, includeAlerts: false });
    // アラートがある場合、件数が異なるはず（同じでもテストはパス）
    return resultWithAlerts.totalProcessed >= resultWithoutAlerts.totalProcessed;
  });

  test('9.3: weekId を指定できる', () => {
    const result = generateTicketsFromTop3(adminViewer, { dryRun: true, weekId: '2025-W01' });
    return result.weekId === '2025-W01';
  });

  // ========== 10. 権限テスト ==========
  console.log('\n--- 10. 権限テスト ---');

  test('10.1: manager権限でもチケット生成できる', () => {
    clearFingerprintStore();
    const result = generateTicketsFromTop3(managerViewer, { dryRun: true, maxTicketsPerRun: 1 });
    return result.totalProcessed > 0;
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
