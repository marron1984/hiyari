import { NextRequest, NextResponse } from 'next/server';
import { getAdminStorage, verifyIdToken } from '@/lib/firebase-admin';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * POST /api/applications/upload
 *
 * 経費申請の領収書アップロード用API
 *
 * FormData:
 *   - file: File（必須）
 *
 * Returns:
 *   { success: true, fileUrl, fileName, fileMime, fileSize }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'ファイルが必要です' }, { status: 400 });
    }

    // サイズチェック（10MB）
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'ファイルサイズは10MB以下にしてください' },
        { status: 400 }
      );
    }

    // MIMEタイプチェック
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'PNG, JPG, PDFのみアップロード可能です' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const fileId = uuidv4();
    const ext = file.name.split('.').pop() || 'bin';
    const storagePath = `expenses/${decodedToken.uid}/${fileId}.${ext}`;

    const fileRef = bucket.file(storagePath);
    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          originalName: file.name,
          uploadedBy: decodedToken.uid,
        },
      },
    });

    const [signedUrl] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    return NextResponse.json({
      success: true,
      fileUrl: signedUrl,
      fileName: file.name,
      fileMime: file.type,
      fileSize: file.size,
    });
  } catch (error) {
    console.error('Expense upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'アップロードに失敗しました' },
      { status: 500 }
    );
  }
}
