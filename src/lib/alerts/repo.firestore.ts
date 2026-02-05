/**
 * アラートリポジトリ - Firestore実装
 *
 * PROD-003: Cloud Firestore永続化
 *
 * コレクション: alerts
 * ドキュメントID: fingerprint（冪等性・重複抑制のため）
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  Alert,
  AlertEvent,
  AlertStats,
  AlertStatus,
  AlertSeverity,
  AlertType,
  CreateAlertRequest,
  ListAlertsOptions,
  AlertEventAction,
} from './types';

// ========== 定数 ==========

const ALERTS_COLLECTION = 'alerts';
const EVENTS_COLLECTION = 'alert_events';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function buildDocId(fingerprint: string): string {
  // Firestoreのdoc IDに使えない文字を置換
  return fingerprint.replace(/[\/\.#\[\]]/g, '_');
}

function docToAlert(doc: FirebaseFirestore.DocumentSnapshot): Alert | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: doc.id,
    type: data.type,
    sourceId: data.sourceId,
    title: data.title,
    message: data.message,
    severity: data.severity,
    status: data.status,
    fingerprint: data.fingerprint,
    assignedRole: data.assignedRole,
    assignedUserId: data.assignedUserId,
    meta: data.meta,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    lastNotifiedAt: data.lastNotifiedAt,
  };
}

// ========== 非同期API ==========

export async function listAlertsAsync(options: ListAlertsOptions = {}): Promise<{
  alerts: Alert[];
  total: number;
}> {
  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(ALERTS_COLLECTION);

    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    if (options.severity) {
      query = query.where('severity', '==', options.severity);
    }
    if (options.type) {
      query = query.where('type', '==', options.type);
    }

    // Firestoreでは複合ソートが難しいので、createdAtで降順
    query = query.orderBy('createdAt', 'desc');

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const snapshot = await query.limit(limit + offset).get();
    let alerts = snapshot.docs.map(doc => docToAlert(doc)!);

    // severity優先でソート（メモリ内）
    const severityOrder: Record<AlertSeverity, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    alerts.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const total = alerts.length;
    alerts = alerts.slice(offset, offset + limit);

    return { alerts, total };
  } catch (error) {
    console.error('[Alerts:Firestore] listAlerts error:', error);
    return { alerts: [], total: 0 };
  }
}

export async function getAlertByIdAsync(id: string): Promise<Alert | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(ALERTS_COLLECTION).doc(id).get();
    return docToAlert(doc);
  } catch (error) {
    console.error('[Alerts:Firestore] getAlertById error:', error);
    return null;
  }
}

export async function findOpenByFingerprintAsync(fingerprint: string): Promise<Alert | null> {
  try {
    const db = getAdminDb();
    const docId = buildDocId(fingerprint);
    const doc = await db.collection(ALERTS_COLLECTION).doc(docId).get();

    if (!doc.exists) return null;

    const alert = docToAlert(doc);
    if (alert && alert.status === 'open') {
      return alert;
    }
    return null;
  } catch (error) {
    console.error('[Alerts:Firestore] findOpenByFingerprint error:', error);
    return null;
  }
}

export async function createAlertAsync(
  request: CreateAlertRequest
): Promise<{ alert: Alert; isNew: boolean }> {
  try {
    const db = getAdminDb();
    const docId = buildDocId(request.fingerprint);
    const docRef = db.collection(ALERTS_COLLECTION).doc(docId);

    // 既存チェック（冪等性）
    const existingDoc = await docRef.get();
    if (existingDoc.exists) {
      const existing = docToAlert(existingDoc)!;
      if (existing.status === 'open') {
        return { alert: existing, isNew: false };
      }
    }

    const timestamp = now();
    const alert: Alert = {
      id: docId,
      type: request.type,
      sourceId: request.sourceId ?? null,
      title: request.title,
      message: request.message,
      severity: request.severity,
      status: 'open',
      fingerprint: request.fingerprint,
      assignedRole: request.assignedRole ?? null,
      assignedUserId: request.assignedUserId ?? null,
      meta: request.meta ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastNotifiedAt: null,
    };

    await docRef.set(alert);

    // イベントログ
    await addEventAsync(docId, 'create', null, null);

    return { alert, isNew: true };
  } catch (error) {
    console.error('[Alerts:Firestore] createAlert error:', error);
    throw error;
  }
}

export async function updateAlertStatusAsync(
  id: string,
  status: AlertStatus,
  actorUserId?: string | null
): Promise<Alert | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(ALERTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) return null;

    await docRef.update({
      status,
      updatedAt: now(),
    });

    // イベントログ
    const action: AlertEventAction = status === 'resolved' ? 'resolve' : 'ack';
    await addEventAsync(id, action, actorUserId ?? null, null);

    const updatedDoc = await docRef.get();
    return docToAlert(updatedDoc);
  } catch (error) {
    console.error('[Alerts:Firestore] updateAlertStatus error:', error);
    return null;
  }
}

export async function acknowledgeAlertAsync(
  id: string,
  actorUserId: string
): Promise<Alert | null> {
  return updateAlertStatusAsync(id, 'acknowledged', actorUserId);
}

export async function resolveAlertAsync(
  id: string,
  actorUserId: string
): Promise<Alert | null> {
  return updateAlertStatusAsync(id, 'resolved', actorUserId);
}

export async function getAlertStatsAsync(): Promise<AlertStats> {
  try {
    const db = getAdminDb();

    const [openSnap, ackSnap, resolvedSnap, criticalSnap] = await Promise.all([
      db.collection(ALERTS_COLLECTION).where('status', '==', 'open').count().get(),
      db.collection(ALERTS_COLLECTION).where('status', '==', 'acknowledged').count().get(),
      db.collection(ALERTS_COLLECTION).where('status', '==', 'resolved').count().get(),
      db.collection(ALERTS_COLLECTION)
        .where('status', '==', 'open')
        .where('severity', '==', 'critical')
        .count().get(),
    ]);

    // byType は複雑なのでスキップ（必要なら後で追加）
    const byType = {} as Record<AlertType, number>;

    return {
      open: openSnap.data().count,
      acknowledged: ackSnap.data().count,
      resolved: resolvedSnap.data().count,
      criticalOpen: criticalSnap.data().count,
      byType,
    };
  } catch (error) {
    console.error('[Alerts:Firestore] getAlertStats error:', error);
    return {
      open: 0,
      acknowledged: 0,
      resolved: 0,
      criticalOpen: 0,
      byType: {} as Record<AlertType, number>,
    };
  }
}

export async function getAlertEventsAsync(alertId: string): Promise<AlertEvent[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(EVENTS_COLLECTION)
      .where('alertId', '==', alertId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      alertId: doc.data().alertId,
      action: doc.data().action,
      actorUserId: doc.data().actorUserId,
      createdAt: doc.data().createdAt,
      note: doc.data().note,
    }));
  } catch (error) {
    console.error('[Alerts:Firestore] getAlertEvents error:', error);
    return [];
  }
}

async function addEventAsync(
  alertId: string,
  action: AlertEventAction,
  actorUserId: string | null,
  note: string | null
): Promise<void> {
  try {
    const db = getAdminDb();
    const eventId = `${alertId}_${Date.now()}`;

    const event: AlertEvent = {
      id: eventId,
      alertId,
      action,
      actorUserId,
      createdAt: now(),
      note,
    };

    await db.collection(EVENTS_COLLECTION).doc(eventId).set(event);
  } catch (error) {
    console.error('[Alerts:Firestore] addEvent error:', error);
  }
}

export async function createAlertsFromScanAsync(
  requests: CreateAlertRequest[]
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const request of requests) {
    const result = await createAlertAsync(request);
    if (result.isNew) {
      created++;
    } else {
      skipped++;
    }
  }

  return { created, skipped };
}
