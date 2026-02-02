/**
 * Ticket 035 Scope Debug Script
 *
 * スコープ計算のデバッグ
 */

// 先にorg repoをインポートして初期化
import * as orgRepo from '../src/lib/org/repo';

// その後にscope関連
import { createScope, getBusinessUnitIdsFromOrgIds, computeScopeForRole } from '../src/lib/access/scope';
import { inferBusinessUnit, processStaffCreation } from '../src/lib/scope/inferBusinessUnit';
import { listBusinessUnits } from '../src/lib/business/repo';

console.log('========== デバッグ: スコープ計算 ==========\n');

// 1. 組織一覧
console.log('1. 組織一覧:');
const orgs = orgRepo.listOrgUnits({ includeInactive: false });
console.log(`   ${orgs.length} organizations found`);
orgs.slice(0, 5).forEach(o => console.log(`   - ${o.id}: ${o.name}`));

// 2. ユーザーの組織コンテキスト
console.log('\n2. user_staff の組織コンテキスト:');
const staffContext = orgRepo.getUserOrgContext('user_staff');
console.log(`   primaryOrgUnitId: ${staffContext.primaryOrgUnitId}`);
console.log(`   orgUnitIds: ${JSON.stringify(staffContext.orgUnitIds)}`);
console.log(`   memberships count: ${staffContext.memberships.length}`);

// 3. スコープ計算
console.log('\n3. user_staff のスコープ:');
const staffScope = createScope('user_staff', 'staff');
console.log(`   role: ${staffScope.role}`);
console.log(`   orgUnitIds: ${JSON.stringify(staffScope.orgUnitIds)}`);
console.log(`   businessUnitIds: ${JSON.stringify(staffScope.businessUnitIds)}`);

// 4. org → business マッピング
console.log('\n4. org → business マッピング:');
if (staffContext.orgUnitIds.length > 0) {
  const businessIds = getBusinessUnitIdsFromOrgIds(staffContext.orgUnitIds);
  console.log(`   ${staffContext.orgUnitIds} → ${JSON.stringify(businessIds)}`);
} else {
  console.log('   (組織所属なし)');
}

// 5. 事業単位一覧
console.log('\n5. 事業単位一覧:');
const businessUnits = listBusinessUnits(true);
console.log(`   ${businessUnits.length} business units found`);
businessUnits.forEach(b => console.log(`   - ${b.id}: ${b.name} (orgUnitId: ${b.orgUnitId})`));

// 6. 推定テスト
console.log('\n6. 推定テスト (user_staff):');
const inferResult = inferBusinessUnit('user_staff', 'staff');
console.log(`   ok: ${inferResult.ok}`);
if (inferResult.ok) {
  console.log(`   businessUnitId: ${inferResult.businessUnitId}`);
  console.log(`   reason: ${inferResult.reason}`);
} else {
  console.log(`   candidates: ${inferResult.candidates.length}`);
  console.log(`   reason: ${inferResult.reason}`);
}

// 7. 比較: user_manager
console.log('\n7. 比較: user_manager の組織コンテキスト:');
const managerContext = orgRepo.getUserOrgContext('user_manager');
console.log(`   primaryOrgUnitId: ${managerContext.primaryOrgUnitId}`);
console.log(`   orgUnitIds: ${JSON.stringify(managerContext.orgUnitIds)}`);

const managerScope = createScope('user_manager', 'manager');
console.log(`   businessUnitIds: ${JSON.stringify(managerScope.businessUnitIds)}`);
