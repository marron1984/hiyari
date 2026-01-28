// ======== 書類テンプレート シードAPI ========
// POST: テンプレートをFirestoreに投入

import { NextRequest, NextResponse } from 'next/server';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DOCUMENT_TEMPLATES } from '@/data/document-templates';

// 管理者のみアクセス可能（実運用ではAuthチェック）
export async function POST(request: NextRequest) {
  if (!db) {
    return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
  }

  try {
    // 既存テンプレート確認
    const existingSnapshot = await getDocs(query(collection(db, 'documentTemplates')));
    const existingKeys = new Set(existingSnapshot.docs.map(d => d.data().key));

    let created = 0;
    let skipped = 0;

    for (const template of DOCUMENT_TEMPLATES) {
      if (existingKeys.has(template.key)) {
        skipped++;
        continue;
      }

      // keyをdocument IDとして使用（重複防止）
      const docRef = doc(db, 'documentTemplates', template.key);
      await setDoc(docRef, {
        ...template,
        createdAt: Timestamp.now(),
      });
      created++;
    }

    return NextResponse.json({
      success: true,
      message: `Templates seeded: ${created} created, ${skipped} skipped (already exist)`,
      total: DOCUMENT_TEMPLATES.length,
      created,
      skipped,
    });
  } catch (error) {
    console.error('[seed-doc-templates] Error:', error);
    return NextResponse.json(
      { error: 'Failed to seed templates', details: String(error) },
      { status: 500 }
    );
  }
}

// GET: 現在のテンプレート一覧を取得
export async function GET() {
  if (!db) {
    return NextResponse.json({ error: 'Database not initialized' }, { status: 500 });
  }

  try {
    const snapshot = await getDocs(query(collection(db, 'documentTemplates')));
    const templates = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({
      total: templates.length,
      templates,
    });
  } catch (error) {
    console.error('[seed-doc-templates] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to get templates', details: String(error) },
      { status: 500 }
    );
  }
}
