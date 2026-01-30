// ======== 入居希望者管理 Admin SDK用ヘルパー ========
// サーバーサイドでのみ使用（API Routes, Webhook等）

import { getAdminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { PROSPECT_MIN_INTERNAL_NO } from './prospect';

// countersコレクションのドキュメントパス
const COUNTER_DOC_PATH = 'counters/prospects_internal_no';

/**
 * 次の社内Noを取得してカウンタをインクリメント（トランザクション）
 * 重複を防ぐためにトランザクション内で実行
 * @returns 次の社内No（最低でもPROSPECT_MIN_INTERNAL_NO以上）
 */
export async function getNextInternalNo(): Promise<number> {
  const db = getAdminDb();
  const counterRef = db.doc(COUNTER_DOC_PATH);

  return db.runTransaction(async (transaction) => {
    const counterDoc = await transaction.get(counterRef);

    let nextNo: number;

    if (!counterDoc.exists) {
      // カウンタが存在しない場合は初期化
      // 現在の最大internal_noを取得して初期値を設定
      const maxNo = await getCurrentMaxInternalNo();
      nextNo = Math.max(maxNo + 1, PROSPECT_MIN_INTERNAL_NO);

      transaction.set(counterRef, {
        current: nextNo,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    } else {
      const data = counterDoc.data();
      const current = data?.current ?? (PROSPECT_MIN_INTERNAL_NO - 1);
      nextNo = current + 1;

      // 最低でもPROSPECT_MIN_INTERNAL_NO以上を保証
      if (nextNo < PROSPECT_MIN_INTERNAL_NO) {
        nextNo = PROSPECT_MIN_INTERNAL_NO;
      }

      transaction.update(counterRef, {
        current: nextNo,
        updatedAt: Timestamp.now(),
      });
    }

    return nextNo;
  });
}

/**
 * 現在の最大internal_noを取得
 * カウンタ初期化時に使用
 */
async function getCurrentMaxInternalNo(): Promise<number> {
  const db = getAdminDb();

  // internal_noが設定されているドキュメントを取得
  const snapshot = await db
    .collection('prospects')
    .where('internalNo', '!=', null)
    .orderBy('internalNo', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return PROSPECT_MIN_INTERNAL_NO - 1;
  }

  const maxNo = snapshot.docs[0].data().internalNo;
  return typeof maxNo === 'number' ? maxNo : PROSPECT_MIN_INTERNAL_NO - 1;
}

/**
 * カウンタの現在値を取得（デバッグ用）
 */
export async function getCurrentCounter(): Promise<number | null> {
  const db = getAdminDb();
  const counterDoc = await db.doc(COUNTER_DOC_PATH).get();

  if (!counterDoc.exists) {
    return null;
  }

  return counterDoc.data()?.current ?? null;
}

/**
 * カウンタを強制的に特定の値に設定（管理者用、通常は使用しない）
 */
export async function forceSetCounter(value: number): Promise<void> {
  if (value < PROSPECT_MIN_INTERNAL_NO) {
    throw new Error(`Counter value must be at least ${PROSPECT_MIN_INTERNAL_NO}`);
  }

  const db = getAdminDb();
  await db.doc(COUNTER_DOC_PATH).set({
    current: value,
    updatedAt: Timestamp.now(),
    forcedAt: Timestamp.now(),
  }, { merge: true });
}
