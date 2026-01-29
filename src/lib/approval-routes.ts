// ======== 承認経路モジュール ========
// Firestore Admin SDK使用（サーバーサイド専用）

import { getAdminDb } from './firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  RingiApprovalRoute,
  RingiApprovalRouteStep,
  RingiApprovalRouteFormData,
  RingiCategory,
} from '@/types';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== 承認経路 CRUD ========

/**
 * 全承認経路を取得
 */
export async function getApprovalRoutes(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<RingiApprovalRoute[]> {
  const db = getAdminDb();

  const routesSnap = await db
    .collection('approval_routes')
    .where('tenantId', '==', tenantId)
    .orderBy('priority', 'asc')
    .get();

  const routes: RingiApprovalRoute[] = [];

  for (const doc of routesSnap.docs) {
    const data = doc.data();

    // ステップを取得
    const stepsSnap = await db
      .collection('approval_routes')
      .doc(doc.id)
      .collection('steps')
      .orderBy('stepOrder', 'asc')
      .get();

    const steps: RingiApprovalRouteStep[] = stepsSnap.docs.map(stepDoc => {
      const stepData = stepDoc.data();
      return {
        id: stepDoc.id,
        routeId: doc.id,
        stepOrder: stepData.stepOrder,
        approverType: stepData.approverType,
        approverValue: stepData.approverValue,
        approverName: stepData.approverName,
        required: stepData.required !== false,
        createdAt: stepData.createdAt?.toDate() || new Date(),
      };
    });

    routes.push({
      id: doc.id,
      tenantId: data.tenantId,
      name: data.name,
      description: data.description,
      category: data.category || null,
      branchId: data.branchId || null,
      branchName: data.branchName,
      minAmount: data.minAmount ?? null,
      maxAmount: data.maxAmount ?? null,
      isActive: data.isActive !== false,
      isDefault: data.isDefault === true,
      priority: data.priority || 100,
      steps,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      createdBy: data.createdBy,
      createdByName: data.createdByName,
    });
  }

  return routes;
}

/**
 * 承認経路を1件取得
 */
export async function getApprovalRoute(
  routeId: string
): Promise<RingiApprovalRoute | null> {
  const db = getAdminDb();

  const doc = await db.collection('approval_routes').doc(routeId).get();
  if (!doc.exists) return null;

  const data = doc.data()!;

  // ステップを取得
  const stepsSnap = await db
    .collection('approval_routes')
    .doc(routeId)
    .collection('steps')
    .orderBy('stepOrder', 'asc')
    .get();

  const steps: RingiApprovalRouteStep[] = stepsSnap.docs.map(stepDoc => {
    const stepData = stepDoc.data();
    return {
      id: stepDoc.id,
      routeId: routeId,
      stepOrder: stepData.stepOrder,
      approverType: stepData.approverType,
      approverValue: stepData.approverValue,
      approverName: stepData.approverName,
      required: stepData.required !== false,
      createdAt: stepData.createdAt?.toDate() || new Date(),
    };
  });

  return {
    id: doc.id,
    tenantId: data.tenantId,
    name: data.name,
    description: data.description,
    category: data.category || null,
    branchId: data.branchId || null,
    branchName: data.branchName,
    minAmount: data.minAmount ?? null,
    maxAmount: data.maxAmount ?? null,
    isActive: data.isActive !== false,
    isDefault: data.isDefault === true,
    priority: data.priority || 100,
    steps,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    createdBy: data.createdBy,
    createdByName: data.createdByName,
  };
}

/**
 * 承認経路を作成
 */
export async function createApprovalRoute(
  formData: RingiApprovalRouteFormData,
  userId: string,
  userName: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<RingiApprovalRoute> {
  const db = getAdminDb();

  // バリデーション
  if (!formData.name.trim()) {
    throw new Error('経路名は必須です');
  }
  if (formData.steps.length === 0) {
    throw new Error('承認ステップを1つ以上設定してください');
  }

  // 経路ドキュメントを作成
  const routeRef = db.collection('approval_routes').doc();
  const now = Timestamp.now();

  const routeData = {
    tenantId,
    name: formData.name.trim(),
    description: formData.description?.trim() || null,
    category: formData.category || null,
    branchId: formData.branchId || null,
    minAmount: formData.minAmount === '' ? null : formData.minAmount,
    maxAmount: formData.maxAmount === '' ? null : formData.maxAmount,
    isActive: formData.isActive,
    isDefault: false, // 新規作成時はデフォルトにしない
    priority: formData.priority,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    createdByName: userName,
  };

  await routeRef.set(routeData);

  // ステップを作成
  const batch = db.batch();
  const steps: RingiApprovalRouteStep[] = [];

  for (let i = 0; i < formData.steps.length; i++) {
    const step = formData.steps[i];
    const stepRef = routeRef.collection('steps').doc();
    const stepData = {
      stepOrder: i + 1,
      approverType: step.approverType,
      approverValue: step.approverValue,
      required: step.required,
      createdAt: now,
    };
    batch.set(stepRef, stepData);

    steps.push({
      id: stepRef.id,
      routeId: routeRef.id,
      stepOrder: i + 1,
      approverType: step.approverType,
      approverValue: step.approverValue,
      required: step.required,
      createdAt: now.toDate(),
    });
  }

  await batch.commit();

  return {
    id: routeRef.id,
    tenantId,
    name: formData.name.trim(),
    description: formData.description?.trim(),
    category: (formData.category || null) as RingiCategory | null,
    branchId: formData.branchId || null,
    minAmount: formData.minAmount === '' ? null : formData.minAmount,
    maxAmount: formData.maxAmount === '' ? null : formData.maxAmount,
    isActive: formData.isActive,
    isDefault: false,
    priority: formData.priority,
    steps,
    createdAt: now.toDate(),
    updatedAt: now.toDate(),
    createdBy: userId,
    createdByName: userName,
  };
}

/**
 * 承認経路を更新
 */
export async function updateApprovalRoute(
  routeId: string,
  formData: RingiApprovalRouteFormData,
  userId: string
): Promise<RingiApprovalRoute> {
  const db = getAdminDb();

  // 既存データ確認
  const existing = await getApprovalRoute(routeId);
  if (!existing) {
    throw new Error('承認経路が見つかりません');
  }

  // バリデーション
  if (!formData.name.trim()) {
    throw new Error('経路名は必須です');
  }
  if (formData.steps.length === 0) {
    throw new Error('承認ステップを1つ以上設定してください');
  }

  const now = Timestamp.now();
  const routeRef = db.collection('approval_routes').doc(routeId);

  // 経路ドキュメントを更新
  const routeData = {
    name: formData.name.trim(),
    description: formData.description?.trim() || null,
    category: formData.category || null,
    branchId: formData.branchId || null,
    minAmount: formData.minAmount === '' ? null : formData.minAmount,
    maxAmount: formData.maxAmount === '' ? null : formData.maxAmount,
    isActive: formData.isActive,
    priority: formData.priority,
    updatedAt: now,
  };

  await routeRef.update(routeData);

  // 既存ステップを削除
  const existingSteps = await routeRef.collection('steps').get();
  const deleteBatch = db.batch();
  existingSteps.docs.forEach(doc => {
    deleteBatch.delete(doc.ref);
  });
  await deleteBatch.commit();

  // 新しいステップを作成
  const createBatch = db.batch();
  const steps: RingiApprovalRouteStep[] = [];

  for (let i = 0; i < formData.steps.length; i++) {
    const step = formData.steps[i];
    const stepRef = routeRef.collection('steps').doc();
    const stepData = {
      stepOrder: i + 1,
      approverType: step.approverType,
      approverValue: step.approverValue,
      required: step.required,
      createdAt: now,
    };
    createBatch.set(stepRef, stepData);

    steps.push({
      id: stepRef.id,
      routeId: routeId,
      stepOrder: i + 1,
      approverType: step.approverType,
      approverValue: step.approverValue,
      required: step.required,
      createdAt: now.toDate(),
    });
  }

  await createBatch.commit();

  return {
    ...existing,
    name: formData.name.trim(),
    description: formData.description?.trim(),
    category: (formData.category || null) as RingiCategory | null,
    branchId: formData.branchId || null,
    minAmount: formData.minAmount === '' ? null : formData.minAmount,
    maxAmount: formData.maxAmount === '' ? null : formData.maxAmount,
    isActive: formData.isActive,
    priority: formData.priority,
    steps,
    updatedAt: now.toDate(),
  };
}

/**
 * 承認経路を削除
 */
export async function deleteApprovalRoute(routeId: string): Promise<void> {
  const db = getAdminDb();

  const routeRef = db.collection('approval_routes').doc(routeId);
  const doc = await routeRef.get();

  if (!doc.exists) {
    throw new Error('承認経路が見つかりません');
  }

  // ステップを削除
  const stepsSnap = await routeRef.collection('steps').get();
  const batch = db.batch();
  stepsSnap.docs.forEach(stepDoc => {
    batch.delete(stepDoc.ref);
  });
  batch.delete(routeRef);
  await batch.commit();
}

/**
 * 承認経路をデフォルトに設定
 */
export async function setDefaultApprovalRoute(
  routeId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<void> {
  const db = getAdminDb();

  // 既存のデフォルトを解除
  const existingDefaults = await db
    .collection('approval_routes')
    .where('tenantId', '==', tenantId)
    .where('isDefault', '==', true)
    .get();

  const batch = db.batch();
  existingDefaults.docs.forEach(doc => {
    batch.update(doc.ref, { isDefault: false, updatedAt: Timestamp.now() });
  });

  // 新しいデフォルトを設定
  batch.update(db.collection('approval_routes').doc(routeId), {
    isDefault: true,
    updatedAt: Timestamp.now(),
  });

  await batch.commit();
}

// ======== 稟議への経路適用 ========

/**
 * 稟議の条件に合う承認経路を検索
 * 優先度順で最初にマッチしたものを返す
 */
export async function findMatchingApprovalRoute(
  category: RingiCategory,
  amount: number | null,
  branchId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<RingiApprovalRoute | null> {
  const routes = await getApprovalRoutes(tenantId);

  // アクティブな経路のみ対象
  const activeRoutes = routes.filter(r => r.isActive);

  for (const route of activeRoutes) {
    // カテゴリチェック
    if (route.category !== null && route.category !== category) {
      continue;
    }

    // 拠点チェック
    if (route.branchId !== null && route.branchId !== branchId) {
      continue;
    }

    // 金額チェック
    if (amount !== null) {
      if (route.minAmount !== null && amount < route.minAmount) {
        continue;
      }
      if (route.maxAmount !== null && amount > route.maxAmount) {
        continue;
      }
    }

    // マッチした
    return route;
  }

  // デフォルト経路を返す
  const defaultRoute = activeRoutes.find(r => r.isDefault);
  return defaultRoute || null;
}
