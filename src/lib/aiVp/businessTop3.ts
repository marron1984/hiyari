/**
 * AI副社長 - 事業別Top3アクション
 *
 * businessUnit ごとに "今週やるべきTop3" をルールベースで算出
 * 根拠（どの指標/滞留/期限超過/リスクから出たか）が1行で説明される
 *
 * Task 042: AI VP Business Top3 Implementation
 */

import type { ViewerContext } from '@/lib/business/types';
import { listBusinessUnits, getBusinessUnitById } from '@/lib/business/repo';
import { createScope, isBusinessUnitInScope } from '@/lib/access/scope';
import * as ticketsRepo from '@/lib/tickets/repo';
import * as repairsRepo from '@/lib/repairs/repo';
import * as correctiveActionsRepo from '@/lib/correctiveActions/repo';
import * as licensesRepo from '@/lib/licenses/repo';
import * as alertsRepo from '@/lib/alerts/repo';
import {
  getEffectiveWeights,
  getEffectiveThresholds,
  getEffectiveDiversity,
} from './scoringSettings';

// ========== 型定義 ==========

export type ActionSeverity = 'info' | 'warning' | 'critical';

// Task 043: チケット生成用のデフォルト設定
export type ActionPriority = 'normal' | 'high' | 'urgent';
export type ActionCategory = 'ops' | 'facility' | 'compliance' | 'hr' | 'general';

export interface ActionCandidate {
  key: string;               // unique identifier
  businessUnitId: string;
  businessUnitName: string;
  title: string;             // 表示用タイトル
  reason: string;            // 1行根拠
  score: number;             // スコア
  url: string;               // 遷移先URL
  severity: ActionSeverity;
  domain: string;            // tickets/repairs/correctiveActions/licenses/alerts
  count: number;             // 対象件数

  // Task 043: チケット自動生成用フィールド
  templateKey: string;              // 例: "licenses_expired"
  fingerprint: string;              // 冪等キー: `ai_vp:${businessUnitId}:${templateKey}:${YYYY-WW}`
  defaultPriority: ActionPriority;  // チケットの優先度
  defaultCategory: ActionCategory;  // チケットのカテゴリ
  defaultDueDays: number;           // 期限（現在から何日後）
  suggestedAssigneeRole?: string;   // 推奨担当ロール
}

export interface BusinessTop3Result {
  businessUnitId: string;
  businessUnitName: string;
  businessUnitType: string;  // 事業種別（表示用）
  actions: ActionCandidate[];  // Top3（最大3件）
  totalScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface BusinessTop3Summary {
  generatedAt: string;
  businessUnits: BusinessTop3Result[];
  topActions: ActionCandidate[];  // 全事業のTop5
}

// ========== スコアリング設定 ==========
// Task 062: 管理画面から調整可能な設定を使用

/**
 * スコアリング重みを取得（管理画面設定を反映）
 */
function getScoringWeights() {
  return getEffectiveWeights();
}

// ========== ヘルパー関数 ==========

function determineSeverity(score: number): ActionSeverity {
  const thresholds = getEffectiveThresholds();
  if (score >= thresholds.severityCritical) return 'critical';
  if (score >= thresholds.severityWarning) return 'warning';
  return 'info';
}

function determineRiskLevel(totalScore: number): 'low' | 'medium' | 'high' | 'critical' {
  const thresholds = getEffectiveThresholds();
  if (totalScore >= thresholds.riskCritical) return 'critical';
  if (totalScore >= thresholds.riskHigh) return 'high';
  if (totalScore >= thresholds.riskMedium) return 'medium';
  return 'low';
}

/**
 * Task 043: 現在の週を YYYY-WW 形式で取得
 */
export function getCurrentWeekId(date: Date = new Date()): string {
  const year = date.getFullYear();
  const firstDay = new Date(year, 0, 1);
  const pastDays = (date.getTime() - firstDay.getTime()) / 86400000;
  const week = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Task 043: 冪等キー（fingerprint）を生成
 */
function generateFingerprint(
  businessUnitId: string,
  templateKey: string,
  weekId: string = getCurrentWeekId()
): string {
  return `ai_vp:${businessUnitId}:${templateKey}:${weekId}`;
}

// ========== アクション候補生成 ==========

/**
 * 単一事業のアクション候補を生成
 */
function generateActionCandidates(
  businessUnitId: string,
  businessUnitName: string,
  viewer: ViewerContext
): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];
  const buQuery = `?businessUnitId=${businessUnitId}`;

  // ---------- チケット ----------
  const ticketStats = ticketsRepo.getTicketStats(
    { userId: viewer.userId, role: viewer.role },
    { businessUnitId }
  );

  if (ticketStats.urgentOpen > 0) {
    const templateKey = 'tickets_urgent';
    const score = ticketStats.urgentOpen * getScoringWeights().tickets_urgentOpen;
    candidates.push({
      key: `${businessUnitId}:tickets:urgent`,
      businessUnitId,
      businessUnitName,
      title: `緊急チケット ${ticketStats.urgentOpen}件`,
      reason: `優先度「緊急」のチケットが${ticketStats.urgentOpen}件未対応。早急な対応が必要です。`,
      score,
      url: `/dashboard/tickets${buQuery}&priority=urgent`,
      severity: determineSeverity(score),
      domain: 'tickets',
      count: ticketStats.urgentOpen,
      templateKey,
      fingerprint: generateFingerprint(businessUnitId, templateKey),
      defaultPriority: 'urgent',
      defaultCategory: 'ops',
      defaultDueDays: 1,
      suggestedAssigneeRole: 'manager',
    });
  }

  if (ticketStats.overdue > 0) {
    const templateKey = 'tickets_overdue';
    const score = ticketStats.overdue * getScoringWeights().tickets_overdue;
    candidates.push({
      key: `${businessUnitId}:tickets:overdue`,
      businessUnitId,
      businessUnitName,
      title: `期限超過チケット ${ticketStats.overdue}件`,
      reason: `期限を超過したチケットが${ticketStats.overdue}件。対応遅延が発生しています。`,
      score,
      url: `/dashboard/tickets${buQuery}&status=overdue`,
      severity: determineSeverity(score),
      domain: 'tickets',
      count: ticketStats.overdue,
      templateKey,
      fingerprint: generateFingerprint(businessUnitId, templateKey),
      defaultPriority: 'high',
      defaultCategory: 'ops',
      defaultDueDays: 3,
      suggestedAssigneeRole: 'leader',
    });
  }

  // ---------- 修繕 ----------
  const repairStats = repairsRepo.getStats(
    { userId: viewer.userId, role: viewer.role },
    { businessUnitId }
  );

  if (repairStats.highRiskOpen > 0) {
    const templateKey = 'repairs_highRisk';
    const score = repairStats.highRiskOpen * getScoringWeights().repairs_highRiskOpen;
    candidates.push({
      key: `${businessUnitId}:repairs:highRisk`,
      businessUnitId,
      businessUnitName,
      title: `高リスク修繕 ${repairStats.highRiskOpen}件`,
      reason: `安全性に関わる高リスク修繕が${repairStats.highRiskOpen}件未対応。事故リスクがあります。`,
      score,
      url: `/dashboard/repairs${buQuery}&risk=high`,
      severity: determineSeverity(score),
      domain: 'repairs',
      count: repairStats.highRiskOpen,
      templateKey,
      fingerprint: generateFingerprint(businessUnitId, templateKey),
      defaultPriority: 'urgent',
      defaultCategory: 'facility',
      defaultDueDays: 2,
      suggestedAssigneeRole: 'manager',
    });
  }

  if (repairStats.overdue > 0) {
    const templateKey = 'repairs_overdue';
    const score = repairStats.overdue * getScoringWeights().repairs_overdue;
    candidates.push({
      key: `${businessUnitId}:repairs:overdue`,
      businessUnitId,
      businessUnitName,
      title: `期限超過修繕 ${repairStats.overdue}件`,
      reason: `修繕期限を超過した案件が${repairStats.overdue}件。施設環境に影響する可能性。`,
      score,
      url: `/dashboard/repairs${buQuery}&status=overdue`,
      severity: determineSeverity(score),
      domain: 'repairs',
      count: repairStats.overdue,
      templateKey,
      fingerprint: generateFingerprint(businessUnitId, templateKey),
      defaultPriority: 'high',
      defaultCategory: 'facility',
      defaultDueDays: 5,
      suggestedAssigneeRole: 'leader',
    });
  }

  // ---------- 是正措置 ----------
  const caStats = correctiveActionsRepo.getStats(
    { userId: viewer.userId, role: viewer.role },
    { businessUnitId }
  );

  if (caStats.criticalOpen > 0) {
    const templateKey = 'ca_critical';
    const score = caStats.criticalOpen * getScoringWeights().correctiveActions_criticalOpen;
    candidates.push({
      key: `${businessUnitId}:ca:critical`,
      businessUnitId,
      businessUnitName,
      title: `重大是正措置 ${caStats.criticalOpen}件`,
      reason: `重大な是正措置が${caStats.criticalOpen}件未完了。監査・コンプライアンスリスクがあります。`,
      score,
      url: `/dashboard/corrective-actions${buQuery}&severity=critical`,
      severity: determineSeverity(score),
      domain: 'correctiveActions',
      count: caStats.criticalOpen,
      templateKey,
      fingerprint: generateFingerprint(businessUnitId, templateKey),
      defaultPriority: 'urgent',
      defaultCategory: 'compliance',
      defaultDueDays: 3,
      suggestedAssigneeRole: 'manager',
    });
  }

  if (caStats.overdue > 0) {
    const templateKey = 'ca_overdue';
    const score = caStats.overdue * getScoringWeights().correctiveActions_overdue;
    candidates.push({
      key: `${businessUnitId}:ca:overdue`,
      businessUnitId,
      businessUnitName,
      title: `期限超過是正措置 ${caStats.overdue}件`,
      reason: `是正措置の期限を超過した案件が${caStats.overdue}件。改善計画の見直しが必要。`,
      score,
      url: `/dashboard/corrective-actions${buQuery}&status=overdue`,
      severity: determineSeverity(score),
      domain: 'correctiveActions',
      count: caStats.overdue,
      templateKey,
      fingerprint: generateFingerprint(businessUnitId, templateKey),
      defaultPriority: 'high',
      defaultCategory: 'compliance',
      defaultDueDays: 5,
      suggestedAssigneeRole: 'leader',
    });
  }

  // ---------- 資格 ----------
  const businessUnit = getBusinessUnitById(businessUnitId);
  const orgUnitIds = businessUnit?.orgUnitId ? [businessUnit.orgUnitId] : undefined;
  const licenseStats = licensesRepo.getStats(
    { userId: viewer.userId, role: viewer.role },
    { orgUnitIds }
  );

  if (licenseStats && licenseStats.expired > 0) {
    const templateKey = 'licenses_expired';
    const score = licenseStats.expired * getScoringWeights().licenses_expired;
    candidates.push({
      key: `${businessUnitId}:licenses:expired`,
      businessUnitId,
      businessUnitName,
      title: `資格期限切れ ${licenseStats.expired}件`,
      reason: `有効期限切れの資格が${licenseStats.expired}件。法令違反のリスクがあります。即時対応が必要。`,
      score,
      url: `/dashboard/licenses?status=expired`,
      severity: 'critical',
      domain: 'licenses',
      count: licenseStats.expired,
      templateKey,
      fingerprint: generateFingerprint(businessUnitId, templateKey),
      defaultPriority: 'urgent',
      defaultCategory: 'hr',
      defaultDueDays: 1,
      suggestedAssigneeRole: 'manager',
    });
  }

  if (licenseStats && licenseStats.expiring30 > 0) {
    const templateKey = 'licenses_expiring30';
    const score = licenseStats.expiring30 * getScoringWeights().licenses_expiring30;
    candidates.push({
      key: `${businessUnitId}:licenses:expiring30`,
      businessUnitId,
      businessUnitName,
      title: `資格期限迫る ${licenseStats.expiring30}件`,
      reason: `30日以内に期限切れとなる資格が${licenseStats.expiring30}件。更新手続きを開始してください。`,
      score,
      url: `/dashboard/licenses?status=expiring`,
      severity: determineSeverity(score),
      domain: 'licenses',
      count: licenseStats.expiring30,
      templateKey,
      fingerprint: generateFingerprint(businessUnitId, templateKey),
      defaultPriority: 'normal',
      defaultCategory: 'hr',
      defaultDueDays: 14,
      suggestedAssigneeRole: 'leader',
    });
  }

  return candidates;
}

/**
 * 単一事業のTop3を算出
 */
export function getBusinessTop3(
  businessUnitId: string,
  viewer: ViewerContext
): BusinessTop3Result | null {
  const businessUnit = getBusinessUnitById(businessUnitId);
  if (!businessUnit) return null;

  // スコープチェック
  const scope = createScope(viewer.userId, viewer.role);
  if (!isBusinessUnitInScope(scope, businessUnitId)) {
    return null;
  }

  const candidates = generateActionCandidates(
    businessUnitId,
    businessUnit.name,
    viewer
  );

  // スコア順にソートしてTop3を取得（Task 062: 設定可能）
  const diversity = getEffectiveDiversity();
  const sortedCandidates = candidates
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, diversity.top3Limit);

  const totalScore = candidates.reduce((sum, c) => sum + c.score, 0);

  return {
    businessUnitId,
    businessUnitName: businessUnit.name,
    businessUnitType: businessUnit.type,
    actions: sortedCandidates,
    totalScore,
    riskLevel: determineRiskLevel(totalScore),
  };
}

/**
 * 全事業のTop3を算出（スコープ適用）
 */
export function getAllBusinessTop3(
  viewer: ViewerContext
): BusinessTop3Summary {
  const scope = createScope(viewer.userId, viewer.role);
  const businessUnits = listBusinessUnits();

  // スコープ内の事業のみ処理
  const scopedBusinessUnits = businessUnits.filter((bu) =>
    isBusinessUnitInScope(scope, bu.id)
  );

  const businessResults: BusinessTop3Result[] = [];
  const allCandidates: ActionCandidate[] = [];

  for (const bu of scopedBusinessUnits) {
    const result = getBusinessTop3(bu.id, viewer);
    if (result) {
      businessResults.push(result);
      allCandidates.push(...result.actions);
    }
  }

  // 全事業のTopアクション（Task 062: 設定可能）
  const diversity = getEffectiveDiversity();
  const topActions = allCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, diversity.globalTopLimit);

  // 総スコア順に事業をソート
  businessResults.sort((a, b) => b.totalScore - a.totalScore);

  return {
    generatedAt: new Date().toISOString(),
    businessUnits: businessResults,
    topActions,
  };
}

/**
 * アラート全体のTop3を取得（事業横断）
 */
export function getAlertTop3(viewer: ViewerContext): ActionCandidate[] {
  const alertStats = alertsRepo.getAlertStats();
  const candidates: ActionCandidate[] = [];

  if (alertStats.criticalOpen > 0) {
    const templateKey = 'alerts_critical';
    const score = alertStats.criticalOpen * getScoringWeights().alerts_criticalOpen;
    candidates.push({
      key: 'global:alerts:critical',
      businessUnitId: 'global',
      businessUnitName: '全社',
      title: `重大アラート ${alertStats.criticalOpen}件`,
      reason: `重大アラートが${alertStats.criticalOpen}件発生中。即時対応が必要です。`,
      score,
      url: '/dashboard/alerts?severity=critical',
      severity: 'critical',
      domain: 'alerts',
      count: alertStats.criticalOpen,
      templateKey,
      fingerprint: generateFingerprint('global', templateKey),
      defaultPriority: 'urgent',
      defaultCategory: 'ops',
      defaultDueDays: 1,
      suggestedAssigneeRole: 'admin',
    });
  }

  const warningOpen = alertStats.open - alertStats.criticalOpen;
  if (warningOpen > 0) {
    const templateKey = 'alerts_warning';
    const score = warningOpen * getScoringWeights().alerts_warningOpen;
    candidates.push({
      key: 'global:alerts:warning',
      businessUnitId: 'global',
      businessUnitName: '全社',
      title: `警告アラート ${warningOpen}件`,
      reason: `警告レベルのアラートが${warningOpen}件。状況を確認してください。`,
      score,
      url: '/dashboard/alerts?severity=warning',
      severity: determineSeverity(score),
      domain: 'alerts',
      count: warningOpen,
      templateKey,
      fingerprint: generateFingerprint('global', templateKey),
      defaultPriority: 'normal',
      defaultCategory: 'ops',
      defaultDueDays: 7,
      suggestedAssigneeRole: 'manager',
    });
  }

  // Task 062: 設定可能
  const diversity = getEffectiveDiversity();
  return candidates.sort((a, b) => b.score - a.score).slice(0, diversity.top3Limit);
}

/**
 * WBR用のサマリーを生成
 */
export function generateWBRBusinessTop3Summary(
  viewer: ViewerContext
): {
  topBusinessRisks: { name: string; riskLevel: string; topAction: string | null }[];
  globalTopActions: string[];
} {
  const summary = getAllBusinessTop3(viewer);

  const topBusinessRisks = summary.businessUnits
    .filter((bu) => bu.riskLevel !== 'low')
    .slice(0, 3)
    .map((bu) => ({
      name: bu.businessUnitName,
      riskLevel: bu.riskLevel,
      topAction: bu.actions[0]?.title ?? null,
    }));

  const globalTopActions = summary.topActions.slice(0, 3).map((a) => a.title);

  return {
    topBusinessRisks,
    globalTopActions,
  };
}
