// ======== 承認経路モジュール ========
// Firestore Admin SDK使用（サーバーサイド専用）
// index不要：クエリはシンプルに、フィルタ/ソートはJS側で実施

import { getAdminDb } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { toDate } from './date';
import {
  RingiApprovalRoute,
  RingiApprovalRouteStep,
  RingiApprovalRouteFormData,
  RingiCategory,
} from '@/types';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== 承認経路 CRUD ========

/**
 * 全承認経路を取得（index不要版）
 * - tenantIdでフィルタはJS側
 * - priorityでソートもJS側
 */
export async function getApprovalRoutes(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<RingiApprovalRoute[]> {
  const db = getAdminDb();

  // tenantIdでサーバー側フィルタ（単一フィールドなのでindex不要）
  const routesSnap = await db.collection('approval_routes')
    .where('tenantId', '==', tenantId)
    .get();

  const routes: RingiApprovalRoute[] = [];

  for (const doc of routesSnap.docs) {
    const data = doc.data();

    // ステップを取得（index不要：シンプルget + JS sort）
    const stepsSnap = await db
      .collection('approval_routes')
      .doc(doc.id)
      .collection('steps')
      .get();

    const steps: RingiApprovalRouteStep[] = stepsSnap.docs
      .map(stepDoc => {
        const stepData = stepDoc.data();
        return {
          id: stepDoc.id,
          routeId: doc.id,
          stepOrder: stepData.stepOrder,
          approverType: stepData.approverType,
          approverValue: stepData.approverValue,
          approverName: stepData.approverName,
          required: stepData.required !== false,
          createdAt: toDate(stepData.createdAt) || new Date(),
        };
      })
      .sort((a, b) => a.stepOrder - b.stepOrder); // JS側でソート

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
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
      createdBy: data.createdBy,
      createdByName: data.createdByName,
    });
  }

  // JS側でpriorityソート
  routes.sort((a, b) => a.priority - b.priority);

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

  // ステップを取得（index不要：シンプルget + JS sort）
  const stepsSnap = await db
    .collection('approval_routes')
    .doc(routeId)
    .collection('steps')
    .get();

  const steps: RingiApprovalRouteStep[] = stepsSnap.docs
    .map(stepDoc => {
      const stepData = stepDoc.data();
      return {
        id: stepDoc.id,
        routeId: routeId,
        stepOrder: stepData.stepOrder,
        approverType: stepData.approverType,
        approverValue: stepData.approverValue,
        approverName: stepData.approverName,
        required: stepData.required !== false,
        createdAt: toDate(stepData.createdAt) || new Date(),
      };
    })
    .sort((a, b) => a.stepOrder - b.stepOrder); // JS側でソート

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
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
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
 * 承認経路をデフォルトに設定（index不要版）
 */
export async function setDefaultApprovalRoute(
  routeId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<void> {
  const db = getAdminDb();

  // 既存のデフォルトを解除（tenantIdでサーバー側フィルタ）
  const allRoutes = await db.collection('approval_routes')
    .where('tenantId', '==', tenantId)
    .get();

  const batch = db.batch();
  allRoutes.docs.forEach(doc => {
    const data = doc.data();
    if (data.isDefault === true) {
      batch.update(doc.ref, { isDefault: false, updatedAt: Timestamp.now() });
    }
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

// ======== 初期テンプレ作成 ========

/**
 * 初期承認経路テンプレを作成
 * approval_routes が 0件のときのみ実行
 *
 * 作成する経路:
 * RINGI:
 *   1. 通常稟議: manager → exec（デフォルト）
 *   2. 高額稟議: manager → exec（50万円以上）
 *   3. 人事稟議: execのみ（人事関連カテゴリ）
 * EXPENSE:
 *   4. 経費申請（通常）: leader承認（デフォルト）
 *   5. 経費申請（高額）: leader → manager（5万円以上）
 * OVERTIME:
 *   6. 残業申請: leader承認（デフォルト）
 */
export interface SeedResult {
  seeded: boolean;
  message: string;
  routesCreated: number;
  routeIds: string[];
}

// 申請種別（RINGI/EXPENSE/OVERTIMEで承認経路を分離）
export type ApprovalRouteApplicationType = 'RINGI' | 'EXPENSE' | 'OVERTIME';

export async function seedApprovalRouteTemplates(
  tenantId: string = DEFAULT_TENANT_ID,
  performedBy: string = 'system',
  performedByName: string = 'システム'
): Promise<SeedResult> {
  const db = getAdminDb();

  // 既存の経路数を確認
  const existingRoutes = await getApprovalRoutes(tenantId);
  if (existingRoutes.length > 0) {
    return {
      seeded: false,
      message: `既に${existingRoutes.length}件の承認経路が存在します`,
      routesCreated: 0,
      routeIds: [],
    };
  }

  const now = Timestamp.now();
  const routeIds: string[] = [];

  // テンプレート定義（RINGI + EXPENSE + OVERTIME）
  const templates = [
    // === RINGI（稟議）===
    {
      name: '通常稟議',
      description: '一般的な稟議（デフォルト経路）',
      applicationType: 'RINGI' as ApprovalRouteApplicationType,
      category: null,
      branchId: null,
      minAmount: null,
      maxAmount: null,
      isActive: true,
      isDefault: true,
      priority: 100,
      steps: [
        { approverType: 'ROLE' as const, approverValue: 'manager', required: true },
        { approverType: 'ROLE' as const, approverValue: 'exec', required: true },
      ],
    },
    {
      name: '高額稟議',
      description: '50万円以上の高額稟議',
      applicationType: 'RINGI' as ApprovalRouteApplicationType,
      category: null,
      branchId: null,
      minAmount: 500000,
      maxAmount: null,
      isActive: true,
      isDefault: false,
      priority: 10,
      steps: [
        { approverType: 'ROLE' as const, approverValue: 'manager', required: true },
        { approverType: 'ROLE' as const, approverValue: 'exec', required: true },
      ],
    },
    {
      name: '人事稟議',
      description: '人事関連の稟議（経営層のみ）',
      applicationType: 'RINGI' as ApprovalRouteApplicationType,
      category: '人事関連' as RingiCategory,
      branchId: null,
      minAmount: null,
      maxAmount: null,
      isActive: true,
      isDefault: false,
      priority: 5,
      steps: [
        { approverType: 'ROLE' as const, approverValue: 'exec', required: true },
      ],
    },
    // === EXPENSE（経費申請）===
    {
      name: '経費申請（通常）',
      description: '通常の経費申請（リーダー承認）',
      applicationType: 'EXPENSE' as ApprovalRouteApplicationType,
      category: null,
      branchId: null,
      minAmount: null,
      maxAmount: 49999,
      isActive: true,
      isDefault: true,
      priority: 100,
      steps: [
        { approverType: 'ROLE' as const, approverValue: 'leader', required: true },
      ],
    },
    {
      name: '経費申請（高額）',
      description: '5万円以上の高額経費（リーダー→マネージャー承認）',
      applicationType: 'EXPENSE' as ApprovalRouteApplicationType,
      category: null,
      branchId: null,
      minAmount: 50000,
      maxAmount: null,
      isActive: true,
      isDefault: false,
      priority: 10,
      steps: [
        { approverType: 'ROLE' as const, approverValue: 'leader', required: true },
        { approverType: 'ROLE' as const, approverValue: 'manager', required: true },
      ],
    },
    // === OVERTIME（残業申請）===
    {
      name: '残業申請',
      description: '残業・休日出勤の事前申請（リーダー承認）',
      applicationType: 'OVERTIME' as ApprovalRouteApplicationType,
      category: null,
      branchId: null,
      minAmount: null,
      maxAmount: null,
      isActive: true,
      isDefault: true,
      priority: 100,
      steps: [
        { approverType: 'ROLE' as const, approverValue: 'leader', required: true },
      ],
    },
  ];

  // 経路を作成
  for (const template of templates) {
    const routeRef = db.collection('approval_routes').doc();
    const routeData = {
      tenantId,
      name: template.name,
      description: template.description,
      applicationType: template.applicationType, // RINGI/EXPENSE/OVERTIME
      category: template.category,
      branchId: template.branchId,
      minAmount: template.minAmount,
      maxAmount: template.maxAmount,
      isActive: template.isActive,
      isDefault: template.isDefault,
      priority: template.priority,
      createdAt: now,
      updatedAt: now,
      createdBy: performedBy,
      createdByName: performedByName,
    };

    await routeRef.set(routeData);

    // ステップを作成
    const batch = db.batch();
    for (let i = 0; i < template.steps.length; i++) {
      const step = template.steps[i];
      const stepRef = routeRef.collection('steps').doc();
      batch.set(stepRef, {
        stepOrder: i + 1,
        approverType: step.approverType,
        approverValue: step.approverValue,
        required: step.required,
        createdAt: now,
      });
    }
    await batch.commit();

    routeIds.push(routeRef.id);
  }

  // 監査ログを記録
  await db.collection('auditLogs').add({
    tenantId,
    action: 'seed_approval_routes',
    resourceType: 'approval_routes',
    resourceIds: routeIds,
    performedBy,
    performedByName,
    details: {
      templatesCreated: templates.map(t => t.name),
      routeCount: templates.length,
    },
    createdAt: now,
  });

  return {
    seeded: true,
    message: `${templates.length}件の承認経路テンプレを作成しました`,
    routesCreated: templates.length,
    routeIds,
  };
}
