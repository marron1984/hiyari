// ======== AI副社長 音声文字起こしAPI ========
// POST: 音声ファイルをアップロードし、Whisperで文字起こし → Claude抽出パイプラインへ

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken, getAdminStorage } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isAiVpOwner, hasMinRole } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import {
  isWhisperConfigured,
  validateAudioFile,
  transcribeAudio,
  SUPPORTED_AUDIO_EXTENSIONS,
} from '@/lib/whisper';

const DEFAULT_TENANT_ID = 'defaultTenant';

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

    // AI副社長オーナーまたは管理者チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    if (!isAiVpOwner(decodedToken.email) && !hasMinRole(userRole, 'admin')) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    // Whisper設定チェック
    if (!isWhisperConfigured()) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY が設定されていません' },
        { status: 500 }
      );
    }

    // FormData解析
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const languageRaw = formData.get('language') as string | null;
    const prompt = formData.get('prompt') as string | null;

    if (!file) {
      return NextResponse.json({ error: '音声ファイルが必要です' }, { status: 400 });
    }

    // ファイルサイズをarrayBuffer読み込み前にチェック（メモリ節約）
    const validation = validateAudioFile(file.type, file.size, file.name);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 言語コードのホワイトリスト検証
    const SUPPORTED_LANGUAGES = ['ja', 'en', 'zh', 'ko', 'es', 'fr', 'de', 'pt', 'it', 'ru'];
    const language = (languageRaw && SUPPORTED_LANGUAGES.includes(languageRaw)) ? languageRaw : 'ja';

    const userName = userData?.name || decodedToken.email || 'Unknown';

    // 音声ファイルをバッファに変換
    const buffer = Buffer.from(await file.arrayBuffer());

    // Firebase Storageに保存
    const fileId = uuidv4();
    const ext = file.name.substring(file.name.lastIndexOf('.')) || '.mp3';
    const storagePath = `ai-vp/audio/${DEFAULT_TENANT_ID}/${fileId}${ext}`;

    const storage = getAdminStorage();
    const bucket = storage.bucket();
    const fileRef = bucket.file(storagePath);

    // ファイル名をサニタイズ（パストラバーサル・XSS対策）
    const sanitizedFilename = file.name
      .replace(/[^\p{L}\p{N}._-]/gu, '_')
      .slice(0, 255);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          originalFilename: sanitizedFilename,
          uploadedBy: decodedToken.uid,
          uploadedByName: userName,
          tenantId: DEFAULT_TENANT_ID,
        },
      },
    });

    // 署名付きURLを生成（30日間有効）
    const [signedUrl] = await fileRef.getSignedUrl({
      action: 'read',
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    // Whisperで文字起こし
    const transcription = await transcribeAudio(buffer, sanitizedFilename, {
      language,
      prompt: prompt || undefined,
    });

    // Ingestionを作成
    const ingestionData = {
      tenantId: DEFAULT_TENANT_ID,
      sourceType: 'audio',
      sourceMeta: {
        filename: sanitizedFilename,
        fileSize: file.size,
        contentType: file.type,
        storagePath,
        audioFileId: fileId,
        audioDuration: transcription.duration,
        language: transcription.language,
        segmentCount: transcription.segments?.length || 0,
      },
      rawText: transcription.text,
      createdByUserId: decodedToken.uid,
      createdByUserName: userName,
      createdAt: FieldValue.serverTimestamp(),
    };

    const ingestionRef = await getAdminDb().collection('aiVpIngestions').add(ingestionData);

    // 監査ログ
    await getAdminDb().collection('aiVpAuditLogs').add({
      tenantId: DEFAULT_TENANT_ID,
      actorUserId: decodedToken.uid,
      actorUserName: userName,
      eventType: 'audio_transcribed',
      eventMeta: {
        ingestionId: ingestionRef.id,
        filename: sanitizedFilename,
        fileSize: file.size,
        duration: transcription.duration,
        language: transcription.language,
        textLength: transcription.text.length,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      ingestionId: ingestionRef.id,
      transcription: {
        text: transcription.text,
        language: transcription.language,
        duration: transcription.duration,
        segmentCount: transcription.segments?.length || 0,
      },
      audioUrl: signedUrl,
    });
  } catch (error) {
    console.error('Transcription API error:', error);
    // 内部エラー詳細はクライアントに漏らさない
    const message = error instanceof Error && error.message.includes('too large')
      ? 'ファイルサイズが大きすぎます'
      : '文字起こしに失敗しました。しばらくしてから再試行してください';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
