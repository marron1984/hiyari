import { NextRequest, NextResponse } from 'next/server';
import { db, DEFAULT_TENANT_ID } from '@/lib/firebase';
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
} from 'firebase/firestore';

// NFKC正規化とカタカナ正規化を含む比較用の名前正規化関数
function normalizeForComparison(name: string): string {
  // NFKC正規化（全角英数→半角、半角カタカナ→全角カタカナなど）
  let normalized = name.normalize('NFKC');

  // 小さいカタカナを大きいカタカナに変換
  const smallToLarge: Record<string, string> = {
    'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ',
    'ッ': 'ツ', 'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ',
  };

  for (const [small, large] of Object.entries(smallToLarge)) {
    normalized = normalized.replace(new RegExp(small, 'g'), large);
  }

  // 長音記号のバリエーションを統一
  normalized = normalized.replace(/[ーｰ―‐]/g, 'ー');

  // 空白を削除して小文字化
  return normalized.replace(/\s/g, '').toLowerCase();
}

export async function POST(request: NextRequest) {
  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  try {
    // 全事業所を取得
    const q = query(
      collection(db, 'branches'),
      where('tenantId', '==', DEFAULT_TENANT_ID)
    );
    const snapshot = await getDocs(q);

    const branches = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      name: docSnap.data().name as string,
      createdAt: docSnap.data().createdAt,
    }));

    console.log('[cleanup] 取得した事業所:', branches.map((b) => ({ id: b.id, name: b.name })));

    // 名前ごとにグループ化
    const nameGroups = new Map<string, typeof branches>();

    for (const branch of branches) {
      const normalizedName = normalizeForComparison(branch.name);
      const existing = nameGroups.get(normalizedName) || [];
      existing.push(branch);
      nameGroups.set(normalizedName, existing);
    }

    // 重複を削除（最初のものを残す）
    const deletedBranches: Array<{ id: string; name: string }> = [];

    for (const [normalizedName, group] of nameGroups) {
      if (group.length > 1) {
        // createdAtでソートして最も古いものを残す
        group.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return aTime - bTime;
        });

        // 最初のもの以外を削除
        for (let i = 1; i < group.length; i++) {
          const branch = group[i];
          await deleteDoc(doc(db, 'branches', branch.id));
          deletedBranches.push({ id: branch.id, name: branch.name });
          console.log(`[cleanup] 削除: ${branch.name} (${branch.id})`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${deletedBranches.length}件の重複事業所を削除しました`,
      deleted: deletedBranches,
      remaining: branches.length - deletedBranches.length,
    });
  } catch (error) {
    console.error('[cleanup] Error:', error);
    return NextResponse.json(
      { error: '重複削除に失敗しました' },
      { status: 500 }
    );
  }
}

export async function GET() {
  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  try {
    // 全事業所を取得
    const q = query(
      collection(db, 'branches'),
      where('tenantId', '==', DEFAULT_TENANT_ID)
    );
    const snapshot = await getDocs(q);

    const branches = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      name: docSnap.data().name as string,
      normalized: normalizeForComparison(docSnap.data().name as string),
    }));

    // 重複を検出
    const nameCount = new Map<string, number>();
    for (const branch of branches) {
      const count = nameCount.get(branch.normalized) || 0;
      nameCount.set(branch.normalized, count + 1);
    }

    const duplicates = branches.filter((b) => (nameCount.get(b.normalized) || 0) > 1);

    return NextResponse.json({
      total: branches.length,
      branches,
      duplicates,
      duplicateCount: duplicates.length,
    });
  } catch (error) {
    console.error('[cleanup] Error:', error);
    return NextResponse.json(
      { error: '事業所の取得に失敗しました' },
      { status: 500 }
    );
  }
}
