/**
 * AI副社長 設定管理 - Firestore実装
 *
 * PROD-003: Cloud Firestore永続化
 *
 * コレクション:
 * - ai_vp_settings: 設定（docId: global）
 * - ai_vp_settings_events: イベントログ
 */

import { getAdminDb } from '@/lib/firebase-admin';
import {
  DEFAULT_CONFIG,
  type AiVpConfig,
} from './defaultConfig';

// ========== 型定義 ==========

export interface AiVpSettings {
  id: string;
  scope: 'global';
  businessUnitId: null;
  configJson: AiVpConfig;
  updatedAt: string;
  updatedByUserId: string;
}

export type AiVpSettingsAction = 'update' | 'reset' | 'rollback' | 'apply_preset';

export interface AiVpSettingsEvent {
  id: string;
  actorUserId: string;
  action: AiVpSettingsAction;
  beforeJson: AiVpConfig | null;
  afterJson: AiVpConfig;
  createdAt: string;
  note: string | null;
}

// ========== 定数 ==========

const SETTINGS_COLLECTION = 'ai_vp_settings';
const EVENTS_COLLECTION = 'ai_vp_settings_events';
const GLOBAL_DOC_ID = 'global';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateEventId(): string {
  return `event_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== 非同期API ==========

export async function getAiVpConfigAsync(): Promise<AiVpConfig> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(SETTINGS_COLLECTION).doc(GLOBAL_DOC_ID).get();

    if (!doc.exists) {
      return DEFAULT_CONFIG;
    }

    const data = doc.data()!;
    return data.configJson || DEFAULT_CONFIG;
  } catch (error) {
    console.error('[AiVpSettings:Firestore] getConfig error:', error);
    return DEFAULT_CONFIG;
  }
}

export async function getAiVpSettingsAsync(): Promise<AiVpSettings | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(SETTINGS_COLLECTION).doc(GLOBAL_DOC_ID).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      id: doc.id,
      scope: 'global',
      businessUnitId: null,
      configJson: data.configJson || DEFAULT_CONFIG,
      updatedAt: data.updatedAt,
      updatedByUserId: data.updatedByUserId,
    };
  } catch (error) {
    console.error('[AiVpSettings:Firestore] getSettings error:', error);
    return null;
  }
}

export async function saveAiVpConfigAsync(
  configJson: AiVpConfig,
  actorUserId: string,
  note?: string | null,
  action: AiVpSettingsAction = 'update'
): Promise<AiVpSettings> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(SETTINGS_COLLECTION).doc(GLOBAL_DOC_ID);

    // 現在の設定を取得（イベントログ用）
    const currentDoc = await docRef.get();
    const beforeJson = currentDoc.exists ? currentDoc.data()!.configJson : null;

    const timestamp = now();
    const settings: AiVpSettings = {
      id: GLOBAL_DOC_ID,
      scope: 'global',
      businessUnitId: null,
      configJson,
      updatedAt: timestamp,
      updatedByUserId: actorUserId,
    };

    await docRef.set(settings);

    // イベントログ追加
    await addEventAsync(actorUserId, action, beforeJson, configJson, note ?? null);

    return settings;
  } catch (error) {
    console.error('[AiVpSettings:Firestore] saveConfig error:', error);
    throw error;
  }
}

export async function resetAiVpConfigAsync(actorUserId: string): Promise<AiVpSettings> {
  return saveAiVpConfigAsync(DEFAULT_CONFIG, actorUserId, 'デフォルト設定にリセット', 'reset');
}

export async function rollbackAiVpConfigAsync(actorUserId: string): Promise<AiVpSettings | null> {
  try {
    const db = getAdminDb();

    // 直前のイベントを取得
    const eventsSnapshot = await db.collection(EVENTS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (eventsSnapshot.empty) {
      return null;
    }

    const lastEvent = eventsSnapshot.docs[0].data();
    const beforeConfig = lastEvent.beforeJson;

    if (!beforeConfig) {
      return null;
    }

    return saveAiVpConfigAsync(beforeConfig, actorUserId, '直前の設定にロールバック', 'rollback');
  } catch (error) {
    console.error('[AiVpSettings:Firestore] rollback error:', error);
    return null;
  }
}

export async function listAiVpEventsAsync(limit: number = 50): Promise<AiVpSettingsEvent[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(EVENTS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      actorUserId: doc.data().actorUserId,
      action: doc.data().action,
      beforeJson: doc.data().beforeJson,
      afterJson: doc.data().afterJson,
      createdAt: doc.data().createdAt,
      note: doc.data().note,
    }));
  } catch (error) {
    console.error('[AiVpSettings:Firestore] listEvents error:', error);
    return [];
  }
}

async function addEventAsync(
  actorUserId: string,
  action: AiVpSettingsAction,
  beforeJson: AiVpConfig | null,
  afterJson: AiVpConfig,
  note: string | null
): Promise<void> {
  try {
    const db = getAdminDb();
    const eventId = generateEventId();

    const event: AiVpSettingsEvent = {
      id: eventId,
      actorUserId,
      action,
      beforeJson,
      afterJson,
      createdAt: now(),
      note,
    };

    await db.collection(EVENTS_COLLECTION).doc(eventId).set(event);
  } catch (error) {
    console.error('[AiVpSettings:Firestore] addEvent error:', error);
  }
}
