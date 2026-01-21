// ======== AI副社長 Firestoreヘルパー ========

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { isAiVpOwner } from './auth';
import {
  AiVpIngestion,
  AiVpExtraction,
  AiVpAction,
  AiVpAuditLog,
  AiVpSettings,
  AiVpAuditEventType,
  IngestionSourceType,
  ExtractionStatus,
  ActionType,
  ActionStatus,
  ExtractedJson,
  DEFAULT_EXTRACTED_JSON,
  DEFAULT_AI_VP_SETTINGS,
  ExtractedJsonSchema,
} from '@/types/ai-vp';

function getDb() {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

// ======== 権限チェック ========

function assertAiVpOwner(email?: string): void {
  if (!isAiVpOwner(email)) {
    throw new Error('AI副社長機能へのアクセス権限がありません');
  }
}

// ======== 取り込み（Ingestion） ========

/**
 * 取り込みを作成
 */
export async function createIngestion(
  sourceType: IngestionSourceType,
  rawText: string,
  sourceMeta: AiVpIngestion['sourceMeta'],
  userId: string,
  userName: string,
  userEmail: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiVpIngestion> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const data = {
    tenantId,
    sourceType,
    sourceMeta,
    rawText,
    createdByUserId: userId,
    createdByUserName: userName,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, 'aiVpIngestions'), data);

  // 監査ログ
  await createAiVpAuditLog({
    tenantId,
    actorUserId: userId,
    actorUserName: userName,
    eventType: 'ingestion_created',
    eventMeta: {
      ingestionId: docRef.id,
      sourceType,
      textLength: rawText.length,
    },
  });

  return {
    id: docRef.id,
    ...data,
    createdAt: new Date(),
  };
}

/**
 * 取り込みを取得
 */
export async function getIngestion(
  id: string,
  userEmail: string
): Promise<AiVpIngestion | null> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const docRef = doc(firestore, 'aiVpIngestions', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
  } as AiVpIngestion;
}

/**
 * 取り込み一覧を取得
 */
export async function getIngestions(
  userEmail: string,
  limitCount: number = 50,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiVpIngestion[]> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const q = query(
    collection(firestore, 'aiVpIngestions'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
    } as AiVpIngestion;
  });
}

// ======== 抽出（Extraction） ========

/**
 * 抽出を作成
 */
export async function createExtraction(
  ingestionId: string,
  extractedJson: ExtractedJson,
  summaryText: string,
  modelMeta: AiVpExtraction['modelMeta'],
  userId: string,
  userName: string,
  userEmail: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiVpExtraction> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  // JSONスキーマ検証
  const parseResult = ExtractedJsonSchema.safeParse(extractedJson);
  if (!parseResult.success) {
    throw new Error(`抽出JSONスキーマエラー: ${parseResult.error.message}`);
  }

  const data = {
    tenantId,
    ingestionId,
    extractionVersion: 1,
    status: 'draft' as ExtractionStatus,
    modelMeta,
    extractedJson,
    summaryText,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, 'aiVpExtractions'), data);

  // 監査ログ
  await createAiVpAuditLog({
    tenantId,
    actorUserId: userId,
    actorUserName: userName,
    eventType: 'extraction_completed',
    eventMeta: {
      extractionId: docRef.id,
      ingestionId,
      taskCount: extractedJson.tasks.length,
      entityCount: extractedJson.entities.length,
    },
  });

  return {
    id: docRef.id,
    ...data,
    createdAt: new Date(),
  };
}

/**
 * 抽出を取得
 */
export async function getExtraction(
  id: string,
  userEmail: string
): Promise<AiVpExtraction | null> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const docRef = doc(firestore, 'aiVpExtractions', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate(),
  } as AiVpExtraction;
}

/**
 * 抽出一覧を取得
 */
export async function getExtractions(
  userEmail: string,
  limitCount: number = 50,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiVpExtraction[]> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const q = query(
    collection(firestore, 'aiVpExtractions'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
    } as AiVpExtraction;
  });
}

/**
 * 抽出を更新（編集・ステータス変更）
 */
export async function updateExtraction(
  id: string,
  updates: {
    extractedJson?: ExtractedJson;
    summaryText?: string;
    status?: ExtractionStatus;
    errorText?: string;
  },
  userId: string,
  userName: string,
  userEmail: string
): Promise<void> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  // JSONスキーマ検証
  if (updates.extractedJson) {
    const parseResult = ExtractedJsonSchema.safeParse(updates.extractedJson);
    if (!parseResult.success) {
      throw new Error(`抽出JSONスキーマエラー: ${parseResult.error.message}`);
    }
  }

  const updateData: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
  };

  if (updates.extractedJson !== undefined) {
    updateData.extractedJson = updates.extractedJson;
  }
  if (updates.summaryText !== undefined) {
    updateData.summaryText = updates.summaryText;
  }
  if (updates.status !== undefined) {
    updateData.status = updates.status;
  }
  if (updates.errorText !== undefined) {
    updateData.errorText = updates.errorText;
  }

  await updateDoc(doc(firestore, 'aiVpExtractions', id), updateData);

  // 確定時は監査ログ
  if (updates.status === 'confirmed') {
    const extraction = await getExtraction(id, userEmail);
    await createAiVpAuditLog({
      tenantId: extraction?.tenantId || DEFAULT_TENANT_ID,
      actorUserId: userId,
      actorUserName: userName,
      eventType: 'extraction_confirmed',
      eventMeta: { extractionId: id },
    });
  }
}

// ======== アクション（Action） ========

/**
 * アクションを作成
 */
export async function createAction(
  extractionId: string,
  actionType: ActionType,
  payload: Record<string, unknown>,
  userId: string,
  userName: string,
  userEmail: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiVpAction> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const data = {
    tenantId,
    extractionId,
    actionType,
    payload,
    status: 'queued' as ActionStatus,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, 'aiVpActions'), data);

  return {
    id: docRef.id,
    ...data,
    createdAt: new Date(),
  };
}

/**
 * アクションを完了
 */
export async function completeAction(
  id: string,
  targetEntityType: string,
  targetEntityId: string,
  userId: string,
  userName: string,
  userEmail: string
): Promise<void> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  await updateDoc(doc(firestore, 'aiVpActions', id), {
    status: 'done' as ActionStatus,
    targetEntityType,
    targetEntityId,
    executedAt: Timestamp.now(),
  });

  // 監査ログ
  const action = await getDoc(doc(firestore, 'aiVpActions', id));
  const actionData = action.data();
  await createAiVpAuditLog({
    tenantId: actionData?.tenantId || DEFAULT_TENANT_ID,
    actorUserId: userId,
    actorUserName: userName,
    eventType: 'action_executed',
    eventMeta: {
      actionId: id,
      actionType: actionData?.actionType,
      targetEntityType,
      targetEntityId,
    },
  });
}

/**
 * アクションを失敗
 */
export async function failAction(
  id: string,
  errorText: string,
  userId: string,
  userName: string,
  userEmail: string
): Promise<void> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  await updateDoc(doc(firestore, 'aiVpActions', id), {
    status: 'failed' as ActionStatus,
    errorText,
    executedAt: Timestamp.now(),
  });

  // 監査ログ
  const action = await getDoc(doc(firestore, 'aiVpActions', id));
  const actionData = action.data();
  await createAiVpAuditLog({
    tenantId: actionData?.tenantId || DEFAULT_TENANT_ID,
    actorUserId: userId,
    actorUserName: userName,
    eventType: 'action_failed',
    eventMeta: {
      actionId: id,
      actionType: actionData?.actionType,
      errorText,
    },
  });
}

/**
 * アクション一覧を取得
 */
export async function getActions(
  userEmail: string,
  extractionId?: string,
  limitCount: number = 100,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiVpAction[]> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  let q = query(
    collection(firestore, 'aiVpActions'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);

  let results = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      executedAt: data.executedAt?.toDate(),
    } as AiVpAction;
  });

  if (extractionId) {
    results = results.filter((a) => a.extractionId === extractionId);
  }

  return results;
}

// ======== 監査ログ ========

/**
 * 監査ログを作成
 */
export async function createAiVpAuditLog(data: {
  tenantId: string;
  actorUserId: string;
  actorUserName: string;
  eventType: AiVpAuditEventType;
  eventMeta: Record<string, unknown>;
}): Promise<void> {
  const firestore = getDb();

  await addDoc(collection(firestore, 'aiVpAuditLogs'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

/**
 * 監査ログを取得
 */
export async function getAiVpAuditLogs(
  userEmail: string,
  limitCount: number = 100,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiVpAuditLog[]> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const q = query(
    collection(firestore, 'aiVpAuditLogs'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
    } as AiVpAuditLog;
  });
}

// ======== 設定 ========

/**
 * AI副社長設定を取得
 */
export async function getAiVpSettings(
  userEmail: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<AiVpSettings> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const docRef = doc(firestore, 'aiVpSettings', tenantId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return DEFAULT_AI_VP_SETTINGS;
  }

  return docSnap.data() as AiVpSettings;
}

/**
 * AI副社長設定を更新
 */
export async function updateAiVpSettings(
  settings: Partial<AiVpSettings>,
  userId: string,
  userName: string,
  userEmail: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<void> {
  assertAiVpOwner(userEmail);
  const firestore = getDb();

  const docRef = doc(firestore, 'aiVpSettings', tenantId);
  await updateDoc(docRef, settings);

  await createAiVpAuditLog({
    tenantId,
    actorUserId: userId,
    actorUserName: userName,
    eventType: 'extraction_confirmed', // 設定変更もログに含める
    eventMeta: { settingsChanged: Object.keys(settings) },
  });
}
