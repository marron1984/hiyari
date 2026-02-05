/**
 * 日次オペレーション実行ログリポジトリ - Firestore実装
 *
 * PROD-003: Cloud Firestore永続化
 *
 * コレクション: daily_ops_runs
 * ドキュメントID: runId
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type { DailyOpsRun, DailyOpsStepResult, DailyOpsStepName } from './types';

// ========== 定数 ==========

const COLLECTION_NAME = 'daily_ops_runs';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateRunId(): string {
  return `daily_ops_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function docToRun(doc: FirebaseFirestore.DocumentSnapshot): DailyOpsRun | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: doc.id,
    date: data.date,
    startedAt: data.startedAt,
    finishedAt: data.finishedAt,
    ok: data.ok,
    steps: data.steps || [],
    totalAlertsCreated: data.totalAlertsCreated || 0,
    totalAlertsSkipped: data.totalAlertsSkipped || 0,
    totalNotifications: data.totalNotifications || 0,
    errorMessage: data.errorMessage,
    failedSteps: data.failedSteps,
  };
}

// ========== 非同期API ==========

export async function startRunAsync(date: string): Promise<DailyOpsRun> {
  try {
    const db = getAdminDb();
    const runId = generateRunId();

    const run: DailyOpsRun = {
      id: runId,
      date,
      startedAt: now(),
      finishedAt: null,
      ok: false,
      steps: [],
      totalAlertsCreated: 0,
      totalAlertsSkipped: 0,
      totalNotifications: 0,
    };

    await db.collection(COLLECTION_NAME).doc(runId).set(run);
    return run;
  } catch (error) {
    console.error('[DailyOps:Firestore] startRun error:', error);
    throw error;
  }
}

export async function addStepResultAsync(runId: string, step: DailyOpsStepResult): Promise<void> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION_NAME).doc(runId);
    const doc = await docRef.get();

    if (!doc.exists) return;

    const run = docToRun(doc)!;
    run.steps.push(step);
    run.totalAlertsCreated += step.alertsCreated;
    run.totalAlertsSkipped += step.alertsSkipped;
    run.totalNotifications += step.notificationsCreated;

    if (!step.ok) {
      if (!run.failedSteps) {
        run.failedSteps = [];
      }
      run.failedSteps.push(step.name);
    }

    await docRef.update({
      steps: run.steps,
      totalAlertsCreated: run.totalAlertsCreated,
      totalAlertsSkipped: run.totalAlertsSkipped,
      totalNotifications: run.totalNotifications,
      failedSteps: run.failedSteps || null,
    });
  } catch (error) {
    console.error('[DailyOps:Firestore] addStepResult error:', error);
  }
}

export async function finishRunAsync(
  runId: string,
  ok: boolean,
  errorMessage?: string
): Promise<DailyOpsRun | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION_NAME).doc(runId);

    await docRef.update({
      finishedAt: now(),
      ok,
      errorMessage: errorMessage || null,
    });

    const doc = await docRef.get();
    return docToRun(doc);
  } catch (error) {
    console.error('[DailyOps:Firestore] finishRun error:', error);
    return null;
  }
}

export async function getRunByIdAsync(id: string): Promise<DailyOpsRun | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(COLLECTION_NAME).doc(id).get();
    return docToRun(doc);
  } catch (error) {
    console.error('[DailyOps:Firestore] getRunById error:', error);
    return null;
  }
}

export async function getRunByDateAsync(date: string): Promise<DailyOpsRun | null> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('date', '==', date)
      .where('ok', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return docToRun(snapshot.docs[0]);
  } catch (error) {
    console.error('[DailyOps:Firestore] getRunByDate error:', error);
    return null;
  }
}

export async function hasSuccessfulRunTodayAsync(date: string): Promise<boolean> {
  const run = await getRunByDateAsync(date);
  return run !== null;
}

export async function listRecentRunsAsync(limit: number = 10): Promise<DailyOpsRun[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COLLECTION_NAME)
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => docToRun(doc)!);
  } catch (error) {
    console.error('[DailyOps:Firestore] listRecentRuns error:', error);
    return [];
  }
}

export async function getLatestRunAsync(): Promise<DailyOpsRun | null> {
  const runs = await listRecentRunsAsync(1);
  return runs[0] || null;
}

export async function getRunStatsAsync(): Promise<{
  totalRuns: number;
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  lastSuccessfulRun: DailyOpsRun | null;
  lastFailedRun: DailyOpsRun | null;
}> {
  try {
    const db = getAdminDb();

    const [countSnap, lastRunSnap, lastSuccessSnap, lastFailSnap] = await Promise.all([
      db.collection(COLLECTION_NAME).count().get(),
      db.collection(COLLECTION_NAME).orderBy('startedAt', 'desc').limit(1).get(),
      db.collection(COLLECTION_NAME).where('ok', '==', true).orderBy('startedAt', 'desc').limit(1).get(),
      db.collection(COLLECTION_NAME).where('ok', '==', false).orderBy('startedAt', 'desc').limit(1).get(),
    ]);

    const lastRun = lastRunSnap.empty ? null : docToRun(lastRunSnap.docs[0]);
    const lastSuccessfulRun = lastSuccessSnap.empty ? null : docToRun(lastSuccessSnap.docs[0]);
    const lastFailedRun = lastFailSnap.empty ? null : docToRun(lastFailSnap.docs[0]);

    return {
      totalRuns: countSnap.data().count,
      lastRunAt: lastRun?.startedAt || null,
      lastRunOk: lastRun?.ok ?? null,
      lastSuccessfulRun,
      lastFailedRun,
    };
  } catch (error) {
    console.error('[DailyOps:Firestore] getRunStats error:', error);
    return {
      totalRuns: 0,
      lastRunAt: null,
      lastRunOk: null,
      lastSuccessfulRun: null,
      lastFailedRun: null,
    };
  }
}

export async function hasFailedRecentlyAsync(): Promise<boolean> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('ok', '==', false)
      .orderBy('startedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return false;

    // 最新の成功実行と比較
    const successSnapshot = await db.collection(COLLECTION_NAME)
      .where('ok', '==', true)
      .orderBy('startedAt', 'desc')
      .limit(1)
      .get();

    if (successSnapshot.empty) return true;

    const lastFailed = snapshot.docs[0].data();
    const lastSuccess = successSnapshot.docs[0].data();

    return new Date(lastFailed.startedAt) > new Date(lastSuccess.startedAt);
  } catch (error) {
    console.error('[DailyOps:Firestore] hasFailedRecently error:', error);
    return false;
  }
}

export async function getRecentFailedStepsAsync(): Promise<DailyOpsStepName[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('ok', '==', false)
      .orderBy('startedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return [];

    const data = snapshot.docs[0].data();
    return data.failedSteps || [];
  } catch (error) {
    console.error('[DailyOps:Firestore] getRecentFailedSteps error:', error);
    return [];
  }
}
