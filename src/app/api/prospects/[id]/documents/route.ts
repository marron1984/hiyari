// 入居希望者 書類管理API
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminStorage, verifyIdToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { hasMinRole, canManageProspects } from '@/lib/auth';
import type { ProspectDocument, DocumentCategory } from '@/types/prospect';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_TENANT_ID = 'defaultTenant';

// GET: 書類一覧取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: prospectId } = await params;

    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    // Prospectを取得
    const prospectDoc = await getAdminDb().collection('prospects').doc(prospectId).get();
    if (!prospectDoc.exists) {
      return NextResponse.json({ error: '入居希望者が見つかりません' }, { status: 404 });
    }

    const prospectData = prospectDoc.data();
    const documents = prospectData?.documents || [];

    return NextResponse.json({
      success: true,
      documents,
    });
  } catch (error) {
    console.error('Documents GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: 書類アップロード
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: prospectId } = await params;

    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    // 権限チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    if (!hasMinRole(userRole, 'user')) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    // Prospectを取得
    const prospectDoc = await getAdminDb().collection('prospects').doc(prospectId).get();
    if (!prospectDoc.exists) {
      return NextResponse.json({ error: '入居希望者が見つかりません' }, { status: 404 });
    }

    // フォームデータを取得
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const category = formData.get('category') as DocumentCategory;
    const note = formData.get('note') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'ファイルが必要です' }, { status: 400 });
    }

    if (!category) {
      return NextResponse.json({ error: 'カテゴリが必要です' }, { status: 400 });
    }

    // ファイルサイズチェック（10MB制限）
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'ファイルサイズは10MB以下にしてください' }, { status: 400 });
    }

    // ファイルをバッファに変換
    const buffer = Buffer.from(await file.arrayBuffer());

    // Firebase Storageにアップロード
    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const documentId = uuidv4();
    const ext = file.name.split('.').pop() || 'bin';
    const storagePath = `prospects/${prospectId}/documents/${documentId}.${ext}`;

    const fileRef = bucket.file(storagePath);
    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          originalName: file.name,
          category,
          uploadedBy: decodedToken.uid,
        },
      },
    });

    // 署名付きURLを生成（1年有効）
    const [signedUrl] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    // ドキュメント情報を作成
    const newDocument: ProspectDocument = {
      id: documentId,
      category,
      fileName: file.name,
      fileUrl: signedUrl,
      fileSize: file.size,
      mimeType: file.type,
      uploadedAt: new Date(),
      uploadedBy: decodedToken.uid,
      uploadedByName: userData?.name || decodedToken.email || 'Unknown',
      note: note || undefined,
    };

    // Firestoreを更新
    await getAdminDb().collection('prospects').doc(prospectId).update({
      documents: FieldValue.arrayUnion(newDocument),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      document: newDocument,
    });
  } catch (error) {
    console.error('Documents POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: 書類削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: prospectId } = await params;

    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    // 権限チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    if (!canManageProspects(userRole, decodedToken.email, userData?.modulePermissions)) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    const { documentId } = await request.json();
    if (!documentId) {
      return NextResponse.json({ error: 'documentIdが必要です' }, { status: 400 });
    }

    // Prospectを取得
    const prospectDoc = await getAdminDb().collection('prospects').doc(prospectId).get();
    if (!prospectDoc.exists) {
      return NextResponse.json({ error: '入居希望者が見つかりません' }, { status: 404 });
    }

    const prospectData = prospectDoc.data();
    const documents: ProspectDocument[] = prospectData?.documents || [];
    const targetDoc = documents.find((d) => d.id === documentId);

    if (!targetDoc) {
      return NextResponse.json({ error: '書類が見つかりません' }, { status: 404 });
    }

    // Storageから削除
    try {
      const storage = getAdminStorage();
      const bucket = storage.bucket();
      const ext = targetDoc.fileName.split('.').pop() || 'bin';
      const storagePath = `prospects/${prospectId}/documents/${documentId}.${ext}`;
      await bucket.file(storagePath).delete();
    } catch (storageError) {
      console.error('Storage delete error:', storageError);
      // ストレージ削除に失敗してもFirestoreは更新する
    }

    // Firestoreを更新
    const updatedDocuments = documents.filter((d) => d.id !== documentId);
    await getAdminDb().collection('prospects').doc(prospectId).update({
      documents: updatedDocuments,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Documents DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
