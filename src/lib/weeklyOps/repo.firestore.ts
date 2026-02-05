/**
 * 週次オペレーション実行ログリポジトリ - Firestore実装
 *
 * PROD-003: Cloud Firestore永続化
 *
 * コレクション: weekly_ops_runs
 * ドキュメントID: runId
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type { WeeklyOpsRun, WeeklyOpsStepResult, WeeklyOpsStepName } from './types';

// ========== 定数 ==========

const COLLECTION_NAME = 'weekly_ops_runs';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateRunId(): string {
  return `weekly_ops_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function docToRun(doc: FirebaseFirestore.DocumentSnapshot): WeeklyOpsRun | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: doc.id,
    weekStart: data.weekStart,
    startedAt: data.startedAt,
    finishedAt: data.finishedAt,
    ok: data.ok,
    steps: data.steps || [],
    totalItemsProcessed: data.totalItemsProcessed || 0,
    totalAlertsCreated: data.totalAlertsCreated || 0,
    errorMessage: data.errorMessage,
    failedSteps: data.failedSteps,
  };
}

// ========== 非同期API ==========

export async function startRunAsync(weekStart: string): Promise<WeeklyOpsRun> {
  try {
    const db = getAdminDb();
    const runId = generateRunId();

    const run: WeeklyOpsRun = {
      id: runId,
      weekStart,
      startedAt: now(),
      finishedAt: null,
      ok: false,
      steps: [],
      totalItemsProcessed: 0,
      totalAlertsCreated: 0,
    };

    await db.collection(COLLECTION_NAME).doc(runId).set(run);
    return run;
  } catch (error) {
    console.error('[WeeklyOps:Firestore] startRun error:', error);
    throw error;
  }
}

export async function addStepResultAsync(runId: string, step: WeeklyOpsStepResult): Promise<void> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(COLLECTION_NAME).doc(runId);
    const doc = await docRef.get();

    if (!doc.exists) return;

    const run = docToRun(doc)!;
    run.steps.push(step);
    run.totalItemsProcessed += step.itemsProcessed;
    run.totalAlertsCreated += step.alertsCreated;

    if (!step.ok) {
      if (!run.failedSteps) {
        run.failedSteps = [];
      }
      run.failedSteps.push(step.name);
    }

    await docRef.update({
      steps: run.steps,
      totalItemsProcessed: run.totalItemsProcessed,
      totalAlertsCreated: run.totalAlertsCreated,
      failedSteps: run.failedSteps || null,
    });
  } catch (error) {
    console.error('[WeeklyOps:Firestore] addStepResult error:', error);
  }
}

export async function finishRunAsync(
  runId: string,
  ok: boolean,
  errorMessage?: string
): Promise<WeeklyOpsRun | null> {
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
    console.error('[WeeklyOps:Firestore] finishRun error:', error);
    return null;
  }
}

export async function getRunByIdAsync(id: string): Promise<WeeklyOpsRun | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(COLLECTION_NAME).doc(id).get();
    return docToRun(doc);
  } catch (error) {
    console.error('[WeeklyOps:Firestore] getRunById error:', error);
    return null;
  }
}

export async function getRunByWeekAsync(weekStart: string): Promise<WeeklyOpsRun | null> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('weekStart', '==', weekStart)
      .where('ok', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return docToRun(snapshot.docs[0]);
  } catch (error) {
    console.error('[WeeklyOps:Firestore] getRunByWeek error:', error);
    return null;
  }
}

export async function hasSuccessfulRunThisWeekAsync(weekStart: string): Promise<boolean> {
  const run = await getRunByWeekAsync(weekStart);
  return run !== null;
}

export async function listRecentRunsAsync(limit: number = 10): Promise<WeeklyOpsRun[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(COLLECTION_NAME)
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => docToRun(doc)!);
  } catch (error) {
    console.error('[WeeklyOps:Firestore] listRecentRuns error:', error);
    return [];
  }
}

export async function getRunStatsAsync(): Promise<{
  totalRuns: number;
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  lastSuccessfulRun: WeeklyOpsRun | null;
  lastFailedRun: WeeklyOpsRun | null;
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
    console.error('[WeeklyOps:Firestore] getRunStats error:', error);
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
    console.error('[WeeklyOps:Firestore] hasFailedRecently error:', error);
    return false;
  }
}

export async function getRecentFailedStepsAsync(): Promise<WeeklyOpsStepName[]> {
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
    console.error('[WeeklyOps:Firestore] getRecentFailedSteps error:', error);
    return [];
  }
}
