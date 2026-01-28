// ======== 書類アップロードAPI ========
// POST: ファイルアップロード（version管理付き）

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminStorage, verifyIdToken } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { hasMinRole } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

// POST: ファイルアップロード
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

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

    // ユーザー情報取得
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    if (!hasMinRole(userRole, 'user')) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    // 書類を取得
    const docRef = getAdminDb().collection('documents').doc(documentId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: '書類が見つかりません' }, { status: 404 });
    }

    const docData = docSnap.data();

    // フォームデータを取得
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'ファイルが必要です' }, { status: 400 });
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
    const fileId = uuidv4();
    const ext = file.name.split('.').pop() || 'bin';
    const newVersion = (docData?.version || 0) + 1;
    const storagePath = `documents/${docData?.tenantId || 'default'}/${documentId}/v${newVersion}_${fileId}.${ext}`;

    const fileRef = bucket.file(storagePath);
    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          originalName: file.name,
          documentId,
          version: String(newVersion),
          uploadedBy: decodedToken.uid,
        },
      },
    });

    // 署名付きURLを生成（1年有効）
    const [signedUrl] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    // イベント種別判定
    const eventType = docData?.version > 0 ? 'REPLACE' : 'UPLOAD';

    // Firestoreを更新
    const updateData = {
      fileUrl: signedUrl,
      fileName: file.name,
      fileMime: file.type,
      fileSize: file.size,
      status: 'SUBMITTED',
      version: newVersion,
      uploadedBy: decodedToken.uid,
      uploadedByName: userData?.name || decodedToken.email || 'Unknown',
      uploadedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await docRef.update(updateData);

    // イベント記録
    await getAdminDb().collection('documentEvents').add({
      documentId,
      eventType,
      prevJson: {
        version: docData?.version,
        status: docData?.status,
        fileUrl: docData?.fileUrl,
      },
      nextJson: {
        version: newVersion,
        status: 'SUBMITTED',
        fileUrl: signedUrl,
        fileName: file.name,
      },
      actorId: decodedToken.uid,
      actorName: userData?.name || decodedToken.email || 'Unknown',
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      document: {
        id: documentId,
        ...docData,
        ...updateData,
      },
    });
  } catch (error) {
    console.error('Document upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET: 書類詳細取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

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

    // 書類を取得
    const docSnap = await getAdminDb().collection('documents').doc(documentId).get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: '書類が見つかりません' }, { status: 404 });
    }

    const docData = docSnap.data();

    // イベント履歴を取得
    const eventsSnap = await getAdminDb()
      .collection('documentEvents')
      .where('documentId', '==', documentId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const events = eventsSnap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString(),
    }));

    return NextResponse.json({
      document: {
        id: docSnap.id,
        ...docData,
        createdAt: docData?.createdAt?.toDate?.()?.toISOString(),
        updatedAt: docData?.updatedAt?.toDate?.()?.toISOString(),
        dueDate: docData?.dueDate?.toDate?.()?.toISOString(),
        uploadedAt: docData?.uploadedAt?.toDate?.()?.toISOString(),
        signedAt: docData?.signedAt?.toDate?.()?.toISOString(),
      },
      events,
    });
  } catch (error) {
    console.error('Document GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
