/**
 * オンボーディング完了後処理
 *
 * Ticket 100: オンボーディング完了後の初期設定自動化
 *
 * - 必須研修の自動割当
 * - 完了通知の作成
 * - 冪等性を保証（fingerprint使用）
 */

import { listCourses, listSessions, assignUsers } from '@/lib/training/repo';
import { create as createNotification } from '@/lib/notifications/repo';
import { getUserById } from '@/lib/roles/user-store';
import { getUserOnboarding, logOnboardingEvent } from './repo';

// ========== 型定義 ==========

export interface PostCompleteResult {
  success: boolean;
  trainingAssignments: {
    courseId: string;
    courseTitle: string;
    sessionId: string;
    sessionName: string;
    dueAt: string | null;
  }[];
  notificationCreated: boolean;
  skippedReason?: string;
}

// ========== 設定 ==========

/**
 * 研修割当の期限計算のデフォルト日数
 */
const DEFAULT_TRAINING_DUE_DAYS = 30;

// ========== ヘルパー関数 ==========

/**
 * 期限日を計算
 */
function calculateDueDate(dueDays: number | null): string {
  const days = dueDays ?? DEFAULT_TRAINING_DUE_DAYS;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + days);
  return dueDate.toISOString();
}

/**
 * 完了通知のfingerprint生成（冪等性用）
 */
function generateCompleteNotificationFingerprint(userId: string, version: number): string {
  return `onboarding_complete:${userId}:v${version}`;
}

// ========== メイン関数 ==========

/**
 * オンボーディング完了後の処理を実行
 *
 * 処理内容:
 * 1. 必須研修の自動割当
 *    - required=true & isActive=true のコースを取得
 *    - 各コースの予定セッション（status=planned）を検索
 *    - ユーザーをセッションに割り当て
 *
 * 2. 完了通知の作成
 *    - ユーザーに「オンボーディング完了」通知を送信
 *    - fingerprintで冪等性を保証
 *
 * @param userId 対象ユーザーID
 * @returns 処理結果
 */
export function handleOnboardingCompleted(userId: string): PostCompleteResult {
  const result: PostCompleteResult = {
    success: false,
    trainingAssignments: [],
    notificationCreated: false,
  };

  // ユーザー情報を取得
  const user = getUserById(userId);
  if (!user) {
    result.skippedReason = 'ユーザーが見つかりません';
    return result;
  }

  // オンボーディング情報を確認
  const onboarding = getUserOnboarding(userId);
  if (!onboarding) {
    result.skippedReason = 'オンボーディング情報が見つかりません';
    return result;
  }

  if (onboarding.status !== 'completed') {
    result.skippedReason = 'オンボーディングが完了していません';
    return result;
  }

  // 1. 必須研修の自動割当
  // active=true で取得し、required でフィルタ
  const activeCourses = listCourses({ active: true });
  const requiredCourses = activeCourses.filter((c) => c.required);

  for (const course of requiredCourses) {
    // このコースの予定セッションを検索
    const plannedSessions = listSessions({
      courseId: course.id,
      status: 'planned',
    });

    if (plannedSessions.length === 0) {
      // 予定セッションがない場合はスキップ
      continue;
    }

    // 直近の予定セッションを選択（scheduledAt順にソートされている）
    const targetSession = plannedSessions[plannedSessions.length - 1]; // 最も近い予定

    // 期限を計算
    const dueAt = calculateDueDate(course.defaultDueDays);

    // ユーザーをセッションに割り当て
    const assignResult = assignUsers(
      targetSession.id,
      [userId],
      dueAt,
      'system' // システムによる自動割当
    );

    if (assignResult.success && assignResult.count > 0) {
      result.trainingAssignments.push({
        courseId: course.id,
        courseTitle: course.title,
        sessionId: targetSession.id,
        sessionName: targetSession.name,
        dueAt,
      });
    }
  }

  // 2. 完了通知の作成
  const userName = user.name ?? userId;
  const fingerprint = generateCompleteNotificationFingerprint(
    userId,
    onboarding.appliedRequirementsVersion
  );

  try {
    const notificationResult = createNotification({
      tenantId: 'default',
      userId,
      type: 'system',
      severity: 'info',
      title: 'オンボーディング完了',
      message: buildCompleteNotificationMessage(userName, result.trainingAssignments),
      url: '/dashboard',
      fingerprint,
    });

    result.notificationCreated = notificationResult.isNew;
  } catch {
    // 通知作成に失敗しても処理は成功とする
  }

  // 3. 監査ログの記録
  logOnboardingEvent(userId, 'post_complete', {
    toVersion: onboarding.appliedRequirementsVersion,
    actorUserId: 'system',
    note: JSON.stringify({
      trainingsAssignedCount: result.trainingAssignments.length,
      notificationsCreated: result.notificationCreated ? 1 : 0,
    }),
  });

  result.success = true;
  return result;
}

/**
 * 完了通知のメッセージを生成
 */
function buildCompleteNotificationMessage(
  userName: string,
  assignments: PostCompleteResult['trainingAssignments']
): string {
  const lines = [
    `${userName}さん、オンボーディングが完了しました。`,
  ];

  if (assignments.length > 0) {
    lines.push('');
    lines.push('以下の必須研修が割り当てられました:');
    for (const a of assignments) {
      lines.push(`- ${a.courseTitle}`);
    }
  }

  lines.push('');
  lines.push('ダッシュボードから業務を開始できます。');

  return lines.join('\n');
}

/**
 * オンボーディング完了を判定して処理を実行
 *
 * 状態遷移を検出して処理:
 * - before: pending → after: completed の場合のみ実行
 * - 既に completed だった場合はスキップ（冪等）
 *
 * @param userId 対象ユーザーID
 * @param previousStatus 署名前のステータス
 * @param currentStatus 署名後のステータス
 * @returns 処理結果（実行した場合）または null（スキップした場合）
 */
export function triggerPostCompleteIfNeeded(
  userId: string,
  previousStatus: 'pending' | 'completed',
  currentStatus: 'pending' | 'completed'
): PostCompleteResult | null {
  // pending → completed の遷移時のみ実行
  if (previousStatus === 'pending' && currentStatus === 'completed') {
    return handleOnboardingCompleted(userId);
  }

  // それ以外はスキップ
  return null;
}
