// ======== 改善アイデアモジュール API ========

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  arrayUnion,
  arrayRemove,
  increment,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import {
  Improvement,
  ImprovementFormData,
  ImprovementStatus,
  ImprovementComment,
  UserRole,
} from '@/types';
import { hasMinRole } from './auth';

function getDb() {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

// ======== CRUD操作 ========

/**
 * 改善アイデアを作成
 */
export async function createImprovement(
  data: ImprovementFormData,
  authorId: string,
  authorName: string,
  branchId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<Improvement> {
  const firestore = getDb();

  const improvementData = {
    tenantId,
    branchId,
    authorId,
    authorName,
    title: data.title,
    category: data.category,
    description: data.description,
    expectedEffect: data.expectedEffect || null,
    attachmentUrls: [],
    status: 'submitted' as ImprovementStatus,
    likeCount: 0,
    likedBy: [],
    commentCount: 0,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, 'improvements'), improvementData);

  return {
    id: docRef.id,
    ...improvementData,
    createdAt: new Date(),
  } as Improvement;
}

/**
 * 改善アイデアを取得
 */
export async function getImprovement(id: string): Promise<Improvement | null> {
  const firestore = getDb();
  const docRef = doc(firestore, 'improvements', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate(),
    adoptedAt: data.adoptedAt?.toDate(),
    rejectedAt: data.rejectedAt?.toDate(),
  } as Improvement;
}

/**
 * 改善アイデア一覧を取得
 */
export async function getImprovements(
  tenantId: string = DEFAULT_TENANT_ID,
  options?: {
    branchId?: string;
    status?: ImprovementStatus;
    authorId?: string;
    limitCount?: number;
  }
): Promise<Improvement[]> {
  const firestore = getDb();
  const limitCount = options?.limitCount || 100;

  // 単一フィルターに簡素化してインデックス不要に
  const q = query(
    collection(firestore, 'improvements'),
    where('tenantId', '==', tenantId)
  );

  const snapshot = await getDocs(q);

  let results = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
      adoptedAt: data.adoptedAt?.toDate(),
      rejectedAt: data.rejectedAt?.toDate(),
    } as Improvement;
  });

  // クライアント側でフィルタリング
  if (options?.branchId) {
    results = results.filter((r) => r.branchId === options.branchId);
  }
  if (options?.authorId) {
    results = results.filter((r) => r.authorId === options.authorId);
  }
  if (options?.status) {
    results = results.filter((r) => r.status === options.status);
  }

  // 日付降順でソート
  results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return results.slice(0, limitCount);
}

/**
 * 改善アイデアを削除（作成者のみ、submitted状態のみ）
 */
export async function deleteImprovement(id: string, userId: string): Promise<void> {
  const firestore = getDb();
  const improvement = await getImprovement(id);

  if (!improvement) throw new Error('改善アイデアが見つかりません');
  if (improvement.authorId !== userId) throw new Error('削除権限がありません');
  if (improvement.status !== 'submitted') throw new Error('提案中の状態でのみ削除可能です');

  await deleteDoc(doc(firestore, 'improvements', id));
}

// ======== ステータス変更 ========

/**
 * ステータス変更の権限チェック
 */
function canChangeStatus(userRole: UserRole | undefined): boolean {
  return hasMinRole(userRole, 'leader');
}

/**
 * 検討中に変更
 */
export async function setReviewing(
  id: string,
  userId: string,
  userRole: UserRole
): Promise<Improvement> {
  if (!canChangeStatus(userRole)) throw new Error('ステータス変更の権限がありません');

  const firestore = getDb();
  await updateDoc(doc(firestore, 'improvements', id), {
    status: 'reviewing',
    updatedAt: Timestamp.now(),
  });

  return (await getImprovement(id))!;
}

/**
 * 採用
 */
export async function adoptImprovement(
  id: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  comment?: string
): Promise<Improvement> {
  if (!canChangeStatus(userRole)) throw new Error('採用の権限がありません');

  const firestore = getDb();
  await updateDoc(doc(firestore, 'improvements', id), {
    status: 'adopted',
    adoptedBy: userId,
    adoptedByName: userName,
    adoptedAt: Timestamp.now(),
    adoptionComment: comment || null,
    updatedAt: Timestamp.now(),
  });

  return (await getImprovement(id))!;
}

/**
 * 不採用
 */
export async function rejectImprovement(
  id: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  reason: string
): Promise<Improvement> {
  if (!canChangeStatus(userRole)) throw new Error('不採用の権限がありません');
  if (!reason.trim()) throw new Error('理由は必須です');

  const firestore = getDb();
  await updateDoc(doc(firestore, 'improvements', id), {
    status: 'rejected',
    rejectedBy: userId,
    rejectedByName: userName,
    rejectedAt: Timestamp.now(),
    rejectionReason: reason,
    updatedAt: Timestamp.now(),
  });

  return (await getImprovement(id))!;
}

// ======== いいね ========

/**
 * いいねをトグル
 */
export async function toggleLike(id: string, userId: string): Promise<Improvement> {
  const firestore = getDb();
  const improvement = await getImprovement(id);

  if (!improvement) throw new Error('改善アイデアが見つかりません');

  const hasLiked = improvement.likedBy.includes(userId);

  if (hasLiked) {
    await updateDoc(doc(firestore, 'improvements', id), {
      likedBy: arrayRemove(userId),
      likeCount: increment(-1),
    });
  } else {
    await updateDoc(doc(firestore, 'improvements', id), {
      likedBy: arrayUnion(userId),
      likeCount: increment(1),
    });
  }

  return (await getImprovement(id))!;
}

// ======== コメント ========

/**
 * コメントを追加
 */
export async function addComment(
  improvementId: string,
  authorId: string,
  authorName: string,
  content: string
): Promise<ImprovementComment> {
  const firestore = getDb();

  const commentData = {
    improvementId,
    authorId,
    authorName,
    content,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, 'improvementComments'), commentData);

  // コメント数を更新
  await updateDoc(doc(firestore, 'improvements', improvementId), {
    commentCount: increment(1),
  });

  return {
    id: docRef.id,
    ...commentData,
    createdAt: new Date(),
  };
}

/**
 * コメント一覧を取得
 */
export async function getComments(improvementId: string): Promise<ImprovementComment[]> {
  const firestore = getDb();
  // 単一フィルターに簡素化してインデックス不要に
  const q = query(
    collection(firestore, 'improvementComments'),
    where('improvementId', '==', improvementId)
  );

  const snapshot = await getDocs(q);
  const results = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
    } as ImprovementComment;
  });

  // クライアント側で日付昇順ソート
  results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return results;
}

/**
 * コメントを削除
 */
export async function deleteComment(
  commentId: string,
  improvementId: string,
  userId: string
): Promise<void> {
  const firestore = getDb();
  const commentRef = doc(firestore, 'improvementComments', commentId);
  const commentSnap = await getDoc(commentRef);

  if (!commentSnap.exists()) throw new Error('コメントが見つかりません');
  if (commentSnap.data().authorId !== userId) throw new Error('削除権限がありません');

  await deleteDoc(commentRef);

  await updateDoc(doc(firestore, 'improvements', improvementId), {
    commentCount: increment(-1),
  });
}
