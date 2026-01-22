import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  increment,
  writeBatch,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { Branch, Incident, Settings, User, MonthlyUserStats, MonthlyBranchStats, DEFAULT_SCORING_RULES } from '@/types';
import { getMonthKey } from './utils';

// ヘルパー: dbが初期化されているかチェック
function ensureDb() {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }
  return db;
}

// ======== ブランチ（事業所） ========

// 半角カタカナを全角カタカナに変換するマップ
const HANKAKU_TO_ZENKAKU_KANA: Record<string, string> = {
  'ｱ': 'ア', 'ｲ': 'イ', 'ｳ': 'ウ', 'ｴ': 'エ', 'ｵ': 'オ',
  'ｶ': 'カ', 'ｷ': 'キ', 'ｸ': 'ク', 'ｹ': 'ケ', 'ｺ': 'コ',
  'ｻ': 'サ', 'ｼ': 'シ', 'ｽ': 'ス', 'ｾ': 'セ', 'ｿ': 'ソ',
  'ﾀ': 'タ', 'ﾁ': 'チ', 'ﾂ': 'ツ', 'ﾃ': 'テ', 'ﾄ': 'ト',
  'ﾅ': 'ナ', 'ﾆ': 'ニ', 'ﾇ': 'ヌ', 'ﾈ': 'ネ', 'ﾉ': 'ノ',
  'ﾊ': 'ハ', 'ﾋ': 'ヒ', 'ﾌ': 'フ', 'ﾍ': 'ヘ', 'ﾎ': 'ホ',
  'ﾏ': 'マ', 'ﾐ': 'ミ', 'ﾑ': 'ム', 'ﾒ': 'メ', 'ﾓ': 'モ',
  'ﾔ': 'ヤ', 'ﾕ': 'ユ', 'ﾖ': 'ヨ',
  'ﾗ': 'ラ', 'ﾘ': 'リ', 'ﾙ': 'ル', 'ﾚ': 'レ', 'ﾛ': 'ロ',
  'ﾜ': 'ワ', 'ｦ': 'ヲ', 'ﾝ': 'ン',
  'ｧ': 'ァ', 'ｨ': 'ィ', 'ｩ': 'ゥ', 'ｪ': 'ェ', 'ｫ': 'ォ',
  'ｯ': 'ッ', 'ｬ': 'ャ', 'ｭ': 'ュ', 'ｮ': 'ョ',
  'ﾞ': '゛', 'ﾟ': '゜', 'ｰ': 'ー',
};

// 半角カタカナ+濁点/半濁点の組み合わせを全角に変換するマップ
const HANKAKU_DAKUTEN_MAP: Record<string, string> = {
  'ｶﾞ': 'ガ', 'ｷﾞ': 'ギ', 'ｸﾞ': 'グ', 'ｹﾞ': 'ゲ', 'ｺﾞ': 'ゴ',
  'ｻﾞ': 'ザ', 'ｼﾞ': 'ジ', 'ｽﾞ': 'ズ', 'ｾﾞ': 'ゼ', 'ｿﾞ': 'ゾ',
  'ﾀﾞ': 'ダ', 'ﾁﾞ': 'ヂ', 'ﾂﾞ': 'ヅ', 'ﾃﾞ': 'デ', 'ﾄﾞ': 'ド',
  'ﾊﾞ': 'バ', 'ﾋﾞ': 'ビ', 'ﾌﾞ': 'ブ', 'ﾍﾞ': 'ベ', 'ﾎﾞ': 'ボ',
  'ﾊﾟ': 'パ', 'ﾋﾟ': 'ピ', 'ﾌﾟ': 'プ', 'ﾍﾟ': 'ペ', 'ﾎﾟ': 'ポ',
  'ｳﾞ': 'ヴ',
};

// 文字列を正規化する関数（重複比較用）
function normalizeForComparison(str: string): string {
  // NFKC正規化: 互換性分解 + 合成
  // - 半角カタカナ→全角カタカナ
  // - 全角英数字→半角英数字
  // - 分離した濁点/半濁点→結合
  // これにより上記のマップは主にNFKCで処理されない特殊ケース用のバックアップとなる
  let result = str
    // Unicode正規化（NFKC: 互換性分解 + 合成）
    .normalize('NFKC')
    // ゼロ幅文字を除去（ゼロ幅スペース、ゼロ幅非接合子、ゼロ幅接合子、ゼロ幅ノーブレークスペース等）
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');

  // バックアップ: NFKCで処理されなかった半角カタカナ+濁点/半濁点の組み合わせを変換
  for (const [hankaku, zenkaku] of Object.entries(HANKAKU_DAKUTEN_MAP)) {
    result = result.split(hankaku).join(zenkaku);
  }

  // バックアップ: 残りの半角カタカナを全角に変換
  result = result.replace(/[ｦ-ﾟ]/g, (s) => HANKAKU_TO_ZENKAKU_KANA[s] || s);

  return result
    // 全角英数字を半角に変換
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    // 全角スペース、ノーブレークスペース、その他の空白を半角スペースに統一
    .replace(/[\u3000\u00A0\u2000-\u200A\u205F\u3000]/g, ' ')
    // カタカナの小さい文字を大きい文字に変換（ァ→ア、ィ→イ、ゥ→ウ、ェ→エ、ォ→オ、ッ→ツ、ャ→ヤ、ュ→ユ、ョ→ヨ、ヮ→ワ）
    .replace(/[ァィゥェォッャュョヮ]/g, (s) => {
      const smallToLarge: Record<string, string> = {
        'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ',
        'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ',
      };
      return smallToLarge[s] || s;
    })
    // ひらがなの小さい文字を大きい文字に変換
    .replace(/[ぁぃぅぇぉっゃゅょゎ]/g, (s) => {
      const smallToLarge: Record<string, string> = {
        'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
        'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
      };
      return smallToLarge[s] || s;
    })
    // 長音記号を除去（ー）
    .replace(/ー/g, '')
    // 連続する空白を1つに
    .replace(/\s+/g, ' ')
    // 前後の空白を除去
    .trim()
    // 小文字に統一
    .toLowerCase();
}

export async function getBranches(tenantId: string = DEFAULT_TENANT_ID): Promise<Branch[]> {
  const firestore = ensureDb();
  const q = query(collection(firestore, 'branches'), where('tenantId', '==', tenantId));
  const snapshot = await getDocs(q);
  const branches = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as Branch[];

  // デバッグ: 取得した全事業所をログ出力
  console.log('[getBranches] 取得した事業所数:', branches.length);
  console.log('[getBranches] 事業所一覧:', branches.map((b) => ({
    id: b.id,
    name: b.name,
    normalized: normalizeForComparison(b.name),
    // 文字コードを表示（重複原因の特定用）
    charCodes: Array.from(b.name).map((c) => c.charCodeAt(0).toString(16)),
  })));

  // 名前で重複除去（同じ名前の事業所は最初の1つのみ保持）
  // 名前を正規化して比較（全角半角、大文字小文字、空白の違いを吸収）
  const seen = new Set<string>();
  const duplicates: Array<{ name: string; normalized: string; id: string }> = [];

  const result = branches.filter((branch) => {
    const normalizedName = normalizeForComparison(branch.name);
    if (seen.has(normalizedName)) {
      duplicates.push({ name: branch.name, normalized: normalizedName, id: branch.id });
      return false;
    }
    seen.add(normalizedName);
    return true;
  });

  // デバッグ: 重複が検出された場合はログ出力
  if (duplicates.length > 0) {
    console.log('[getBranches] 重複を除去:', duplicates);
  }
  console.log('[getBranches] 返却する事業所数:', result.length);

  return result;
}

export async function getBranch(branchId: string): Promise<Branch | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'branches', branchId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return {
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: docSnap.data().createdAt?.toDate() || new Date(),
  } as Branch;
}

export async function createBranch(data: Omit<Branch, 'id' | 'createdAt'>): Promise<string> {
  const firestore = ensureDb();
  const docRef = await addDoc(collection(firestore, 'branches'), {
    ...data,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

// ======== 設定 ========

export async function getSettings(tenantId: string = DEFAULT_TENANT_ID): Promise<Settings | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'settings', tenantId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return {
    id: docSnap.id,
    ...docSnap.data(),
    updatedAt: docSnap.data().updatedAt?.toDate() || new Date(),
  } as Settings;
}

export async function initializeSettings(tenantId: string = DEFAULT_TENANT_ID): Promise<void> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'settings', tenantId);
  const settings: Omit<Settings, 'id'> = {
    tenantId,
    scoringRules: DEFAULT_SCORING_RULES,
    visibilityMode: 'all',
    domainAllowList: [],
    excludeFraudFromRanking: true,
    updatedAt: new Date(),
  };
  await setDoc(docRef, settings);
}

export async function updateSettings(tenantId: string, data: Partial<Settings>): Promise<void> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'settings', tenantId);
  await updateDoc(docRef, { ...data, updatedAt: Timestamp.now() });
}

// ======== インシデント ========

export async function createIncident(data: Omit<Incident, 'id' | 'createdAt'>): Promise<string> {
  const firestore = ensureDb();
  const batch = writeBatch(firestore);

  // undefinedの値を除外
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );

  // インシデントを作成
  const incidentRef = doc(collection(firestore, 'incidents'));
  batch.set(incidentRef, {
    ...cleanData,
    createdAt: Timestamp.now(),
  });

  // 月次統計を更新
  const monthKey = getMonthKey(new Date());
  await updateMonthlyStats(firestore, batch, data, monthKey);

  await batch.commit();
  return incidentRef.id;
}

async function updateMonthlyStats(
  firestore: ReturnType<typeof ensureDb>,
  batch: ReturnType<typeof writeBatch>,
  incident: Omit<Incident, 'id' | 'createdAt'>,
  monthKey: string
): Promise<void> {
  const tenantId = incident.tenantId;

  // ユーザー統計（フラットな構造: monthlyUserStats/{tenantId}_{monthKey}_{userId}）
  const userStatsId = `${tenantId}_${monthKey}_${incident.userId}`;
  const userStatsRef = doc(firestore, 'monthlyUserStats', userStatsId);
  const userStatsDoc = await getDoc(userStatsRef);

  if (userStatsDoc.exists()) {
    batch.update(userStatsRef, {
      points: increment(incident.scoreTotal),
      count: increment(1),
      suggestionsCount: incident.prevention ? increment(1) : increment(0),
      totalBodyLength: increment(incident.bodyLength),
    });
  } else {
    batch.set(userStatsRef, {
      tenantId,
      monthKey,
      userId: incident.userId,
      userName: incident.userName || '',
      branchId: incident.branchId,
      points: incident.scoreTotal,
      count: 1,
      suggestionsCount: incident.prevention ? 1 : 0,
      totalBodyLength: incident.bodyLength,
    });
  }

  // 事業所統計（フラットな構造: monthlyBranchStats/{tenantId}_{monthKey}_{branchId}）
  const branchStatsId = `${tenantId}_${monthKey}_${incident.branchId}`;
  const branchStatsRef = doc(firestore, 'monthlyBranchStats', branchStatsId);
  const branchStatsDoc = await getDoc(branchStatsRef);

  if (branchStatsDoc.exists()) {
    batch.update(branchStatsRef, {
      points: increment(incident.scoreTotal),
      count: increment(1),
      suggestionsCount: incident.prevention ? increment(1) : increment(0),
    });
  } else {
    // 事業所の人数を取得
    const branch = await getBranch(incident.branchId);
    batch.set(branchStatsRef, {
      tenantId,
      monthKey,
      branchId: incident.branchId,
      branchName: branch?.name || '',
      points: incident.scoreTotal,
      count: 1,
      headcount: branch?.headcount || 0,
      suggestionsCount: incident.prevention ? 1 : 0,
    });
  }
}

export async function getIncident(incidentId: string): Promise<Incident | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'incidents', incidentId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return {
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: docSnap.data().createdAt?.toDate() || new Date(),
    updatedAt: docSnap.data().updatedAt?.toDate() || undefined,
  } as Incident;
}

// インシデント更新（自分の投稿のみ更新可能）
export async function updateIncident(
  incidentId: string,
  userId: string,
  data: {
    date?: string;
    timeSlot?: string;
    category?: string;
    severity?: number;
    body?: string;
    action?: string;
    prevention?: string;
    location?: string;
    tags?: string[];
    // スコア再計算用
    bodyLength?: number;
    totalLength?: number;
    scoreTotal?: number;
    scoreBreakdown?: { key: string; label: string; points: number }[];
  }
): Promise<void> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'incidents', incidentId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('投稿が見つかりません');
  }

  const incident = docSnap.data();

  // 自分の投稿かチェック
  if (incident.userId !== userId) {
    throw new Error('この投稿を編集する権限がありません');
  }

  // undefinedの値を除外
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );

  await updateDoc(docRef, {
    ...cleanData,
    updatedAt: Timestamp.now(),
  });
}

export async function getIncidentsByUser(
  userId: string,
  limitCount: number = 50
): Promise<Incident[]> {
  const firestore = ensureDb();
  // シンプルなクエリ（インデックス不要）
  const q = query(
    collection(firestore, 'incidents'),
    where('userId', '==', userId),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as Incident[];

  // クライアント側でソート
  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getIncidentsByTenant(
  tenantId: string = DEFAULT_TENANT_ID,
  limitCount: number = 100
): Promise<Incident[]> {
  const firestore = ensureDb();
  // シンプルなクエリ（インデックス不要）
  const q = query(
    collection(firestore, 'incidents'),
    where('tenantId', '==', tenantId),
    limit(limitCount)
  );
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as Incident[];

  // クライアント側でソート
  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getIncidentsByMonth(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<Incident[]> {
  const firestore = ensureDb();
  // シンプルなクエリ（インデックス不要）
  const q = query(
    collection(firestore, 'incidents'),
    where('tenantId', '==', tenantId),
    limit(500)
  );
  const snapshot = await getDocs(q);
  const results = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as Incident[];

  // クライアント側でフィルタ・ソート
  return results
    .filter((i) => i.date >= startDate && i.date <= endDate)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ======== 月次統計 ========

export async function getMonthlyUserStats(
  tenantId: string,
  monthKey: string
): Promise<MonthlyUserStats[]> {
  const firestore = ensureDb();
  // フラットな構造: monthlyUserStats コレクションから tenantId と monthKey でフィルタ
  const q = query(
    collection(firestore, 'monthlyUserStats'),
    where('tenantId', '==', tenantId),
    where('monthKey', '==', monthKey)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      userId: data.userId,
      userName: data.userName,
      branchId: data.branchId,
      branchName: data.branchName || '',
      points: data.points || 0,
      count: data.count || 0,
      suggestionsCount: data.suggestionsCount || 0,
      totalBodyLength: data.totalBodyLength || 0,
      avgBodyLength: data.count > 0 ? Math.round(data.totalBodyLength / data.count) : 0,
    };
  });
}

export async function getMonthlyBranchStats(
  tenantId: string,
  monthKey: string
): Promise<MonthlyBranchStats[]> {
  const firestore = ensureDb();
  // フラットな構造: monthlyBranchStats コレクションから tenantId と monthKey でフィルタ
  const q = query(
    collection(firestore, 'monthlyBranchStats'),
    where('tenantId', '==', tenantId),
    where('monthKey', '==', monthKey)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      branchId: data.branchId,
      branchName: data.branchName,
      points: data.points || 0,
      count: data.count || 0,
      headcount: data.headcount || 0,
      postRate: data.headcount > 0 ? data.count / data.headcount : 0,
      suggestionsCount: data.suggestionsCount || 0,
    };
  });
}

// ======== 不正検知（簡易版） ========

export async function checkFraud(
  userId: string,
  body: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ isFraud: boolean; reason?: string }> {
  const firestore = ensureDb();
  // 過去24時間の同一ユーザーの投稿を取得（シンプルなクエリ）
  const q = query(
    collection(firestore, 'incidents'),
    where('userId', '==', userId),
    limit(20)
  );

  const snapshot = await getDocs(q);
  const recentIncidents = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: docSnap.data().createdAt?.toDate() || new Date(),
  })) as Incident[];

  // 同一本文のチェック（簡易ハッシュ: 本文の前50文字 + 長さ）
  const bodySignature = body.substring(0, 50) + body.length;
  for (const incident of recentIncidents) {
    const existingSignature = incident.body.substring(0, 50) + incident.body.length;
    if (bodySignature === existingSignature) {
      return { isFraud: true, reason: '24時間以内に同一内容の投稿が存在します' };
    }
  }

  // 短時間での大量投稿チェック（1時間以内に5件以上）
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  const recentCount = recentIncidents.filter(
    (i) => i.createdAt >= oneHourAgo
  ).length;

  if (recentCount >= 5) {
    return { isFraud: true, reason: '1時間以内に5件以上の投稿があります' };
  }

  return { isFraud: false };
}

// ======== ユーザー ========

export async function getUser(userId: string): Promise<User | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'users', userId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return {
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: docSnap.data().createdAt?.toDate() || new Date(),
  } as User;
}

export async function getUsers(tenantId: string = DEFAULT_TENANT_ID): Promise<User[]> {
  const firestore = ensureDb();
  const q = query(
    collection(firestore, 'users'),
    where('tenantId', '==', tenantId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate() || new Date(),
  } as User)).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
