// AA CHAOS 経営OS・営業OS Firestore関数

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import {
  StaffCheckin,
  StaffScoreDaily,
  ServantScore,
  PsychScoreMonthly,
  Intervention,
  IntakeEvent,
  AuditLog,
  CheckinFormData,
  DEFAULT_BURNOUT_RISK_CONFIG,
  BurnoutRiskConfig,
} from '@/types/chaos';

// ヘルパー: dbが初期化されているかチェック
function ensureDb() {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }
  return db;
}

// ======== チェックイン ========

// チェックイン保存
export async function saveCheckin(
  userId: string,
  userName: string,
  date: string,
  data: CheckinFormData
): Promise<string> {
  const firestore = ensureDb();
  const docId = `${userId}_${date}`;
  const docRef = doc(firestore, 'staffCheckins', docId);

  const checkinData = {
    userId,
    userName,
    date,
    ...data,
    updatedAt: Timestamp.now(),
  };

  const existingDoc = await getDoc(docRef);
  if (existingDoc.exists()) {
    await updateDoc(docRef, checkinData);
  } else {
    await setDoc(docRef, {
      ...checkinData,
      createdAt: Timestamp.now(),
    });
  }

  // 日次スコアを計算して保存
  await calculateAndSaveDailyScore(userId, userName, date, data);

  return docId;
}

// チェックイン取得（単一）
export async function getCheckin(userId: string, date: string): Promise<StaffCheckin | null> {
  const firestore = ensureDb();
  const docId = `${userId}_${date}`;
  const docRef = doc(firestore, 'staffCheckins', docId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate(),
  } as StaffCheckin;
}

// チェックイン履歴取得
export async function getCheckinHistory(
  userId: string,
  days: number = 30
): Promise<StaffCheckin[]> {
  const firestore = ensureDb();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  const q = query(
    collection(firestore, 'staffCheckins'),
    where('userId', '==', userId),
    where('date', '>=', startDateStr),
    orderBy('date', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate(),
  })) as StaffCheckin[];
}

// ======== 日次スコア計算 ========

// スコア計算ロジック
function calculateScores(data: CheckinFormData): {
  fatigueScore: number;
  mentalLoadScore: number;
  burnoutRiskScore: number;
} {
  // 疲労スコア: 体力疲労と睡眠の逆数の平均 (0-4 → 0-100)
  const fatigueScore = Math.round(
    ((data.physicalFatigue + (4 - data.sleep)) / 2) * 25
  );

  // メンタル負荷スコア: 精神疲労、不安、判断の重さ、相談できた感の逆数の平均
  const mentalLoadScore = Math.round(
    ((data.mentalFatigue + data.anxiety + data.decisionLoad + (4 - data.consulted)) / 4) * 25
  );

  // バーンアウトリスク: 疲労とメンタル負荷の加重平均
  const burnoutRiskScore = Math.round(fatigueScore * 0.4 + mentalLoadScore * 0.6);

  return {
    fatigueScore: Math.min(100, Math.max(0, fatigueScore)),
    mentalLoadScore: Math.min(100, Math.max(0, mentalLoadScore)),
    burnoutRiskScore: Math.min(100, Math.max(0, burnoutRiskScore)),
  };
}

// 日次スコア保存
async function calculateAndSaveDailyScore(
  userId: string,
  userName: string,
  date: string,
  data: CheckinFormData
): Promise<void> {
  const firestore = ensureDb();
  const scores = calculateScores(data);

  // 過去7日のスコアを取得してリスクレベルを判定
  const config = DEFAULT_BURNOUT_RISK_CONFIG;
  const riskLevel = await determineBurnoutRiskLevel(userId, scores.burnoutRiskScore, config);

  const docId = `${userId}_${date}`;
  const docRef = doc(firestore, 'staffScoresDaily', docId);

  await setDoc(docRef, {
    userId,
    userName,
    date,
    ...scores,
    burnoutRiskLevel: riskLevel,
    createdAt: Timestamp.now(),
  });

  // イエロー・レッドの場合は介入タスクを作成
  if (riskLevel === 'yellow' || riskLevel === 'red') {
    await createBurnoutIntervention(userId, userName, riskLevel, scores.burnoutRiskScore);
  }
}

// バーンアウトリスクレベル判定
async function determineBurnoutRiskLevel(
  userId: string,
  currentScore: number,
  config: BurnoutRiskConfig
): Promise<'green' | 'yellow' | 'red'> {
  const firestore = ensureDb();

  // 過去7日のスコアを取得
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  const q = query(
    collection(firestore, 'staffScoresDaily'),
    where('userId', '==', userId),
    where('date', '>=', startDate.toISOString().split('T')[0]),
    orderBy('date', 'desc'),
    limit(7)
  );

  const snapshot = await getDocs(q);
  const recentScores = snapshot.docs.map((doc) => doc.data().burnoutRiskScore as number);

  // 連続日数チェック
  let consecutiveHighDays = 0;
  for (const score of [currentScore, ...recentScores]) {
    if (score >= config.yellowThreshold) {
      consecutiveHighDays++;
    } else {
      break;
    }
  }

  // 悪化率チェック（7日前との比較）
  const weekAgoScore = recentScores[recentScores.length - 1] || 0;
  const deteriorationRate = weekAgoScore > 0
    ? (currentScore - weekAgoScore) / weekAgoScore
    : 0;

  // レッド判定
  if (
    consecutiveHighDays >= config.consecutiveDaysForRed ||
    deteriorationRate >= config.weeklyDeteriorationRateForRed ||
    currentScore >= config.redThreshold
  ) {
    return 'red';
  }

  // イエロー判定
  if (
    consecutiveHighDays >= config.consecutiveDaysForYellow ||
    currentScore >= config.yellowThreshold
  ) {
    return 'yellow';
  }

  return 'green';
}

// バーンアウト介入タスク作成
async function createBurnoutIntervention(
  userId: string,
  userName: string,
  severity: 'yellow' | 'red',
  score: number
): Promise<void> {
  const firestore = ensureDb();

  const title = severity === 'red'
    ? `【要対応】${userName}さんのバーンアウトリスクが高まっています`
    : `【確認】${userName}さんのコンディションを確認してください`;

  const description = severity === 'red'
    ? `バーンアウトリスクスコア: ${score}。1on1などで状況を確認し、支援を検討してください。（この通知は評価ではなく支援のためのものです）`
    : `バーンアウトリスクスコア: ${score}。様子を見守り、必要に応じて声かけを検討してください。`;

  await addDoc(collection(firestore, 'interventions'), {
    type: 'checkin_alert',
    severity,
    targetType: 'user',
    targetId: userId,
    targetName: userName,
    title,
    description,
    status: 'open',
    createdAt: Timestamp.now(),
  });
}

// ======== 日次スコア取得 ========

// チーム全体のスコア取得（マネージャー用）
export async function getTeamDailyScores(
  userIds: string[],
  date: string
): Promise<StaffScoreDaily[]> {
  const firestore = ensureDb();

  const results: StaffScoreDaily[] = [];
  for (const userId of userIds) {
    const docId = `${userId}_${date}`;
    const docRef = doc(firestore, 'staffScoresDaily', docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      results.push({
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
      } as StaffScoreDaily);
    }
  }

  return results;
}

// 全体のバーンアウトリスクヒートマップ用データ取得
export async function getBurnoutRiskHeatmap(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<StaffScoreDaily[]> {
  const firestore = ensureDb();
  const today = new Date().toISOString().split('T')[0];

  const q = query(
    collection(firestore, 'staffScoresDaily'),
    where('date', '==', today),
    orderBy('burnoutRiskScore', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as StaffScoreDaily[];
}

// ======== 介入管理 ========

// 介入タスク一覧取得
export async function getInterventions(
  status?: 'open' | 'done' | 'snoozed',
  limitCount: number = 50
): Promise<Intervention[]> {
  const firestore = ensureDb();

  let q;
  if (status) {
    q = query(
      collection(firestore, 'interventions'),
      where('status', '==', status),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
  } else {
    q = query(
      collection(firestore, 'interventions'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate(),
    resolvedAt: doc.data().resolvedAt?.toDate(),
  })) as Intervention[];
}

// 介入タスク更新
export async function updateIntervention(
  interventionId: string,
  data: Partial<Intervention>
): Promise<void> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'interventions', interventionId);

  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

// 介入タスク完了
export async function resolveIntervention(
  interventionId: string,
  resolvedBy: string
): Promise<void> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'interventions', interventionId);

  await updateDoc(docRef, {
    status: 'done',
    resolvedAt: Timestamp.now(),
    resolvedBy,
    updatedAt: Timestamp.now(),
  });
}

// ======== Webhook受信 ========

// IntakeEvent保存
export async function saveIntakeEvent(
  source: string,
  rawPayload: object,
  rawTranscript?: string
): Promise<string> {
  const firestore = ensureDb();

  const docRef = await addDoc(collection(firestore, 'intakeEvents'), {
    source,
    rawPayloadJson: JSON.stringify(rawPayload),
    rawTranscript,
    receivedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
  });

  return docRef.id;
}

// ======== 監査ログ ========

export async function createAuditLog(
  actorId: string,
  actorName: string,
  action: string,
  entity: string,
  entityId: string,
  diff?: object
): Promise<void> {
  const firestore = ensureDb();

  await addDoc(collection(firestore, 'auditLogs'), {
    actorId,
    actorName,
    action,
    entity,
    entityId,
    diffJson: diff ? JSON.stringify(diff) : null,
    createdAt: Timestamp.now(),
  });
}

// ======== CHAOS ダッシュボード用集計 ========

export async function getChaosDashboardMetrics(
  tenantId: string = DEFAULT_TENANT_ID
) {
  const firestore = ensureDb();

  // バーンアウトリスクヒートマップ
  const heatmapData = await getBurnoutRiskHeatmap(tenantId);

  // 介入アラート数
  const interventionsSnapshot = await getDocs(
    query(
      collection(firestore, 'interventions'),
      where('status', '==', 'open')
    )
  );
  const yellowCount = interventionsSnapshot.docs.filter(
    (doc) => doc.data().severity === 'yellow'
  ).length;
  const redCount = interventionsSnapshot.docs.filter(
    (doc) => doc.data().severity === 'red'
  ).length;

  // 平均スコア計算
  const avgFatigue = heatmapData.length > 0
    ? Math.round(heatmapData.reduce((sum, d) => sum + d.fatigueScore, 0) / heatmapData.length)
    : 0;
  const avgMentalLoad = heatmapData.length > 0
    ? Math.round(heatmapData.reduce((sum, d) => sum + d.mentalLoadScore, 0) / heatmapData.length)
    : 0;

  return {
    organization: {
      burnoutRiskHeatmap: heatmapData.map((d) => ({
        userId: d.userId,
        userName: d.userName || '名前未設定',
        score: d.burnoutRiskScore,
        level: d.burnoutRiskLevel,
      })),
      avgFatigue,
      avgMentalLoad,
      servantScores: [], // TODO: 実装
      alertCount: { yellow: yellowCount, red: redCount },
    },
  };
}
