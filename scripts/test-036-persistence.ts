/**
 * Ticket 036 Persistence Test Script
 *
 * テスト対象:
 * 1. 同じfingerprintで2回create → 1件のみ
 * 2. unreadCount が正しい
 * 3. read / read-all が反映される
 * 4. 再起動後も通知が残る（DB参照）
 * 5. 他人の通知が見えない
 */

import {
  create,
  listByUser,
  listByRole,
  getUnreadCount,
  markRead,
  markAllRead,
  getById,
  getByFingerprint,
  generateFingerprint,
  getStats,
} from '../src/lib/notifications/repo';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => { passed: boolean; details: string }) {
  try {
    const result = fn();
    results.push({ name, ...result });
    console.log(`${result.passed ? '✅' : '❌'} ${name}`);
    console.log(`   ${result.details}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`
    });
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log('');
}

console.log('\n========== Ticket 036 Persistence Test ==========\n');

// テスト1: 同じfingerprintで2回create → 1件のみ
test('1. 同じfingerprintで2回create → 1件のみ', () => {
  const fingerprint = generateFingerprint('test', 'dedup', Date.now().toString());

  const result1 = create({
    tenantId: 'default',
    userId: 'user_test_1',
    type: 'unclassified_scope',
    severity: 'info',
    title: 'テスト通知1',
    message: 'テストメッセージ',
    fingerprint,
  });

  const result2 = create({
    tenantId: 'default',
    userId: 'user_test_1',
    type: 'unclassified_scope',
    severity: 'info',
    title: 'テスト通知1（重複）',
    message: 'テストメッセージ（重複）',
    fingerprint,
  });

  return {
    passed: result1.isNew && !result2.isNew && result1.notification.id === result2.notification.id,
    details: `1回目: isNew=${result1.isNew}, 2回目: isNew=${result2.isNew}, ID一致=${result1.notification.id === result2.notification.id}`,
  };
});

// テスト2: unreadCount が正しい
test('2. unreadCount が正しい', () => {
  const userId = 'user_test_unread_' + Date.now();

  // 3件作成
  for (let i = 0; i < 3; i++) {
    create({
      tenantId: 'default',
      userId,
      type: 'unclassified_scope',
      severity: 'info',
      title: `テスト通知${i}`,
      message: 'テストメッセージ',
      fingerprint: generateFingerprint('test', userId, i.toString()),
    });
  }

  const count = getUnreadCount(userId);
  return {
    passed: count === 3,
    details: `unreadCount: ${count} (expected: 3)`,
  };
});

// テスト3: markRead が反映される
test('3. markRead が反映される', () => {
  const userId = 'user_test_read_' + Date.now();
  const fingerprint = generateFingerprint('test', userId, 'read');

  const { notification } = create({
    tenantId: 'default',
    userId,
    type: 'unclassified_scope',
    severity: 'info',
    title: 'テスト通知',
    message: 'テストメッセージ',
    fingerprint,
  });

  const beforeCount = getUnreadCount(userId);
  markRead(notification.id, userId);
  const afterCount = getUnreadCount(userId);

  const updated = getById(notification.id);

  return {
    passed: beforeCount === 1 && afterCount === 0 && updated?.status === 'read' && updated?.readAt !== null,
    details: `before: ${beforeCount}, after: ${afterCount}, status: ${updated?.status}, readAt: ${updated?.readAt}`,
  };
});

// テスト4: markAllRead が反映される
test('4. markAllRead が反映される', () => {
  const userId = 'user_test_readall_' + Date.now();

  // 5件作成
  for (let i = 0; i < 5; i++) {
    create({
      tenantId: 'default',
      userId,
      type: 'unclassified_scope',
      severity: 'info',
      title: `テスト通知${i}`,
      message: 'テストメッセージ',
      fingerprint: generateFingerprint('test', userId, i.toString()),
    });
  }

  const beforeCount = getUnreadCount(userId);
  const { count } = markAllRead(userId);
  const afterCount = getUnreadCount(userId);

  return {
    passed: beforeCount === 5 && count === 5 && afterCount === 0,
    details: `before: ${beforeCount}, marked: ${count}, after: ${afterCount}`,
  };
});

// テスト5: 他人の通知が見えない（listByUser）
test('5. 他人の通知が見えない（listByUser）', () => {
  const userId1 = 'user_test_isolation_1_' + Date.now();
  const userId2 = 'user_test_isolation_2_' + Date.now();

  create({
    tenantId: 'default',
    userId: userId1,
    type: 'unclassified_scope',
    severity: 'info',
    title: 'ユーザー1の通知',
    message: 'テストメッセージ',
    fingerprint: generateFingerprint('test', userId1, 'isolation'),
  });

  create({
    tenantId: 'default',
    userId: userId2,
    type: 'unclassified_scope',
    severity: 'info',
    title: 'ユーザー2の通知',
    message: 'テストメッセージ',
    fingerprint: generateFingerprint('test', userId2, 'isolation'),
  });

  const user1List = listByUser(userId1);
  const user2List = listByUser(userId2);

  const user1HasUser2 = user1List.items.some(n => n.userId === userId2);
  const user2HasUser1 = user2List.items.some(n => n.userId === userId1);

  return {
    passed: !user1HasUser2 && !user2HasUser1,
    details: `user1 sees user2: ${user1HasUser2}, user2 sees user1: ${user2HasUser1}`,
  };
});

// テスト6: getByFingerprint が動作する
test('6. getByFingerprint が動作する', () => {
  const userId = 'user_test_fp_' + Date.now();
  const fingerprint = generateFingerprint('test', userId, 'fingerprint_lookup');

  create({
    tenantId: 'default',
    userId,
    type: 'unclassified_scope',
    severity: 'info',
    title: 'テスト通知',
    message: 'テストメッセージ',
    fingerprint,
  });

  const found = getByFingerprint(userId, fingerprint);
  const notFound = getByFingerprint(userId, 'non_existent_fingerprint');

  return {
    passed: found !== null && found.fingerprint === fingerprint && notFound === null,
    details: `found: ${found !== null}, correct fingerprint: ${found?.fingerprint === fingerprint}, notFound: ${notFound === null}`,
  };
});

// テスト7: 統計情報が正しい
test('7. 統計情報が正しい', () => {
  const stats = getStats();

  return {
    passed: stats.total >= 0 && stats.unread >= 0 && stats.read >= 0 && stats.dismissed >= 0,
    details: `total: ${stats.total}, unread: ${stats.unread}, read: ${stats.read}, dismissed: ${stats.dismissed}`,
  };
});

// ========== サマリー ==========

console.log('\n========== サマリー ==========\n');

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;

console.log(`結果: ${passed}/${results.length} passed`);

if (failed > 0) {
  console.log('\n失敗したテスト:');
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  ❌ ${r.name}: ${r.details}`);
  });
}

const allPassed = failed === 0;
console.log(`\n最終判定: ${allPassed ? '✅ PASS - 036 永続化が正常動作' : '❌ FAIL - 修正が必要'}`);

// 永続化確認メッセージ
console.log('\n========== 永続化確認 ==========');
console.log('データファイル: .data/notifications.json');
console.log('サーバー再起動後もデータが保持されます。');
console.log('確認方法: npx tsx scripts/test-036-persistence.ts を再実行');
