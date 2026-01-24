/**
 * CHAOS システム開発用シードデータ
 *
 * 使用方法:
 * npx ts-node --project tsconfig.json scripts/seed-chaos.ts
 *
 * または package.json に追加:
 * "seed:chaos": "ts-node scripts/seed-chaos.ts"
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Firebase Admin 初期化
if (getApps().length === 0) {
  // 環境変数から認証情報を取得、またはローカル開発用のエミュレータを使用
  const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-project';

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({
      credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
      projectId,
    });
  } else {
    // エミュレータ使用時
    initializeApp({ projectId });
  }
}

const db = getFirestore();

// シードデータ用のユーザー（3人）
const SEED_USERS = [
  { id: 'seed-user-1', name: '山田 太郎', role: 'staff' },
  { id: 'seed-user-2', name: '佐藤 花子', role: 'staff' },
  { id: 'seed-user-3', name: '鈴木 一郎', role: 'leader' },
];

// 過去7日分の日付を生成
function getPastDates(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}

// ランダムなチェックインデータ生成
function generateCheckinData(userId: string, userName: string, date: string, pattern: 'healthy' | 'stressed' | 'fluctuating') {
  let base: { physicalFatigue: number; mentalFatigue: number; sleep: number; anxiety: number; decisionLoad: number; consulted: number };

  switch (pattern) {
    case 'healthy':
      base = {
        physicalFatigue: Math.floor(Math.random() * 2), // 0-1
        mentalFatigue: Math.floor(Math.random() * 2),
        sleep: 3 + Math.floor(Math.random() * 2), // 3-4
        anxiety: Math.floor(Math.random() * 2),
        decisionLoad: Math.floor(Math.random() * 2),
        consulted: 3 + Math.floor(Math.random() * 2), // 3-4
      };
      break;
    case 'stressed':
      base = {
        physicalFatigue: 2 + Math.floor(Math.random() * 3), // 2-4
        mentalFatigue: 2 + Math.floor(Math.random() * 3),
        sleep: Math.floor(Math.random() * 2), // 0-1
        anxiety: 2 + Math.floor(Math.random() * 3),
        decisionLoad: 2 + Math.floor(Math.random() * 3),
        consulted: Math.floor(Math.random() * 2), // 0-1
      };
      break;
    case 'fluctuating':
    default:
      base = {
        physicalFatigue: Math.floor(Math.random() * 5),
        mentalFatigue: Math.floor(Math.random() * 5),
        sleep: Math.floor(Math.random() * 5),
        anxiety: Math.floor(Math.random() * 5),
        decisionLoad: Math.floor(Math.random() * 5),
        consulted: Math.floor(Math.random() * 5),
      };
  }

  return {
    userId,
    userName,
    date,
    ...base,
    note: '',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

// スコア計算
function calculateScores(data: { physicalFatigue: number; mentalFatigue: number; sleep: number; anxiety: number; decisionLoad: number; consulted: number }) {
  const fatigueScore = Math.round(((data.physicalFatigue + (4 - data.sleep)) / 2) * 25);
  const mentalLoadScore = Math.round(((data.mentalFatigue + data.anxiety + data.decisionLoad + (4 - data.consulted)) / 4) * 25);
  const burnoutRiskScore = Math.round(fatigueScore * 0.4 + mentalLoadScore * 0.6);

  let burnoutRiskLevel: 'green' | 'yellow' | 'red' = 'green';
  if (burnoutRiskScore >= 80) {
    burnoutRiskLevel = 'red';
  } else if (burnoutRiskScore >= 60) {
    burnoutRiskLevel = 'yellow';
  }

  return {
    fatigueScore: Math.min(100, Math.max(0, fatigueScore)),
    mentalLoadScore: Math.min(100, Math.max(0, mentalLoadScore)),
    burnoutRiskScore: Math.min(100, Math.max(0, burnoutRiskScore)),
    burnoutRiskLevel,
  };
}

// メイン処理
async function seedChaosData() {
  console.log('=== CHAOS シードデータ投入開始 ===');

  const dates = getPastDates(7);
  const patterns: ('healthy' | 'stressed' | 'fluctuating')[] = ['healthy', 'stressed', 'fluctuating'];

  let checkinCount = 0;
  let scoreCount = 0;
  let interventionCount = 0;

  for (let i = 0; i < SEED_USERS.length; i++) {
    const user = SEED_USERS[i];
    const pattern = patterns[i];

    console.log(`\n${user.name} (${pattern}) のデータを作成中...`);

    for (const date of dates) {
      // チェックインデータ作成
      const checkinData = generateCheckinData(user.id, user.name, date, pattern);
      const checkinDocId = `${user.id}_${date}`;

      await db.collection('staffCheckins').doc(checkinDocId).set(checkinData);
      checkinCount++;

      // スコア計算・保存
      const scores = calculateScores(checkinData);
      const scoreDocId = `${user.id}_${date}`;

      await db.collection('staffScoresDaily').doc(scoreDocId).set({
        userId: user.id,
        userName: user.name,
        date,
        ...scores,
        createdAt: Timestamp.now(),
      });
      scoreCount++;

      // 介入タスク作成（yellow/redの場合）
      if (scores.burnoutRiskLevel === 'yellow' || scores.burnoutRiskLevel === 'red') {
        const title = scores.burnoutRiskLevel === 'red'
          ? `【要対応】${user.name}さんのバーンアウトリスクが高まっています`
          : `【確認】${user.name}さんのコンディションを確認してください`;

        await db.collection('interventions').add({
          type: 'checkin_alert',
          severity: scores.burnoutRiskLevel,
          targetType: 'user',
          targetId: user.id,
          targetName: user.name,
          title,
          description: `バーンアウトリスクスコア: ${scores.burnoutRiskScore}。支援を検討してください。`,
          status: 'open',
          createdAt: Timestamp.now(),
        });
        interventionCount++;
      }
    }
  }

  // スコアリング設定のシードデータ
  console.log('\nスコアリング設定を作成中...');

  await db.collection('scoreConfigs').add({
    name: 'burnout_risk',
    scopeType: 'company',
    version: 1,
    isActive: true,
    configJson: JSON.stringify({
      yellowThreshold: 60,
      redThreshold: 80,
      consecutiveDaysForYellow: 2,
      consecutiveDaysForRed: 3,
      weeklyDeteriorationRateForRed: 0.2,
    }),
    createdAt: Timestamp.now(),
  });

  await db.collection('scoreConfigs').add({
    name: 'prospect_probability',
    scopeType: 'company',
    version: 1,
    isActive: true,
    configJson: JSON.stringify({
      ageScore: [
        { min: 65, max: 74, weight: 10 },
        { min: 75, max: 84, weight: 20 },
        { min: 85, max: 100, weight: 30 },
      ],
      careLevelScore: {
        '要支援1': 5,
        '要支援2': 10,
        '要介護1': 15,
        '要介護2': 20,
        '要介護3': 25,
        '要介護4': 30,
        '要介護5': 35,
      },
      visitScheduledScore: 15,
      visitCompletedScore: 25,
      documentsSubmittedScore: 10,
      rankThresholds: { A: 80, B: 60, C: 40 },
    }),
    createdAt: Timestamp.now(),
  });

  console.log('\n=== シードデータ投入完了 ===');
  console.log(`チェックイン: ${checkinCount}件`);
  console.log(`日次スコア: ${scoreCount}件`);
  console.log(`介入タスク: ${interventionCount}件`);
  console.log(`スコアリング設定: 2件`);
}

// 実行
seedChaosData()
  .then(() => {
    console.log('\n処理が完了しました。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  });
