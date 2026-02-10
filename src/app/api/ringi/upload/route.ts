// ======== 稟議添付ファイルアップロードAPI ========
import { NextRequest, NextResponse } from 'next/server';
import { getAdminStorage, verifyIdToken } from '@/lib/firebase-admin';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ringi/upload
 *
 * FormData:
 *   - file: File（必須）
 *
 * Returns:
 *   { success: true, fileUrl, fileName, fileMime, fileSize }
 */
export async function POST(request: NextRequest) {
  try {
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

    // FormData からファイルを取得
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

    // ファイルをバッファに変換
    const buffer = Buffer.from(await file.arrayBuffer());

    // Firebase Admin Storage でアップロード（Rules をバイパス）
    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const fileId = uuidv4();
    const ext = file.name.split('.').pop() || 'bin';
    const storagePath = `ringi/${decodedToken.uid}/${fileId}.${ext}`;

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

    // 署名付きURL（1年有効）
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
    console.error('Ringi upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'アップロードに失敗しました' },
      { status: 500 }
    );
  }
}
