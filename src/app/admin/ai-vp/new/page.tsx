'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { isAiVpOwner } from '@/lib/auth';
import { getAuth } from 'firebase/auth';
import {
  Brain,
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
  FileText,
  Mic,
  Upload,
  X,
  CheckCircle2,
  Volume2,
} from 'lucide-react';

type InputMode = 'text' | 'audio';
type AudioStep = 'select' | 'uploading' | 'transcribing' | 'done';

const SUPPORTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.webm', '.ogg', '.flac', '.mp4'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export default function AiVpNewPage() {
  return (
    <AuthGuard>
      <AiVpNewContent />
    </AuthGuard>
  );
}

function AiVpNewContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioStep, setAudioStep] = useState<AudioStep>('select');
  const [transcribedText, setTranscribedText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 権限チェック
  useEffect(() => {
    if (user && !isAiVpOwner(user.email)) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const getIdToken = async () => {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('認証が必要です');
    return currentUser.getIdToken();
  };

  // テキスト抽出
  const handleTextSubmit = async () => {
    if (!rawText.trim()) {
      setError('テキストを入力してください');
      return;
    }
    if (rawText.length > 100000) {
      setError('テキストが長すぎます（最大100,000文字）');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const idToken = await getIdToken();
      const response = await fetch('/api/ai-vp/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          sourceType: 'text',
          rawText,
          sourceMeta: { inputMethod: 'manual' },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '抽出に失敗しました');
      router.push(`/admin/ai-vp/extraction/${data.extractionId}`);
    } catch (err) {
      console.error('Extraction error:', err);
      setError(err instanceof Error ? err.message : '抽出に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 音声ファイル選択
  const handleFileSelect = useCallback((file: File) => {
    setError(null);

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setError(`対応していない音声形式です。対応形式: ${SUPPORTED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('ファイルサイズが大きすぎます（最大25MB）');
      return;
    }

    setAudioFile(file);
    setAudioStep('select');
    setTranscribedText('');
    setAudioUrl(null);
  }, []);

  // ドラッグ&ドロップ
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  // 音声アップロード＋文字起こし
  const handleAudioUpload = async () => {
    if (!audioFile) return;

    setLoading(true);
    setError(null);
    setAudioStep('uploading');

    try {
      const idToken = await getIdToken();
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('language', 'ja');

      setAudioStep('transcribing');

      const response = await fetch('/api/ai-vp/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '文字起こしに失敗しました');

      setTranscribedText(data.transcription.text);
      setAudioUrl(data.audioUrl || null);
      setAudioStep('done');
    } catch (err) {
      console.error('Transcription error:', err);
      setError(err instanceof Error ? err.message : '文字起こしに失敗しました');
      setAudioStep('select');
    } finally {
      setLoading(false);
    }
  };

  // 文字起こし結果から抽出
  const handleTranscriptionExtract = async () => {
    if (!transcribedText.trim()) {
      setError('文字起こし結果がありません');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const idToken = await getIdToken();
      const response = await fetch('/api/ai-vp/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          sourceType: 'audio',
          rawText: transcribedText,
          sourceMeta: {
            inputMethod: 'audio_transcription',
            filename: audioFile?.name,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '抽出に失敗しました');
      router.push(`/admin/ai-vp/extraction/${data.extractionId}`);
    } catch (err) {
      console.error('Extraction error:', err);
      setError(err instanceof Error ? err.message : '抽出に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const resetAudio = () => {
    setAudioFile(null);
    setAudioStep('select');
    setTranscribedText('');
    setAudioUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!user || !isAiVpOwner(user.email)) {
    return (
      <>
        <Header />
        <main className="pb-20 md:pb-8">
          <div className="max-w-4xl mx-auto px-4 py-16 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">アクセス権限がありません</h1>
            <p className="text-gray-500">この機能はAI副社長オーナーのみ利用可能です。</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">新規抽出</h1>
                <p className="text-sm text-gray-500">テキストまたは音声から情報を抽出</p>
              </div>
            </div>
          </div>

          {/* タブ切り替え */}
          <div className="flex border-b mb-6">
            <button
              onClick={() => { setInputMode('text'); setError(null); }}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-colors ${
                inputMode === 'text'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              テキスト入力
            </button>
            <button
              onClick={() => { setInputMode('audio'); setError(null); }}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-colors ${
                inputMode === 'audio'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Mic className="w-4 h-4" />
              音声アップロード
            </button>
          </div>

          {/* テキスト入力モード */}
          {inputMode === 'text' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  テキスト入力
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      抽出元テキスト
                      <span className="text-gray-400 ml-2">
                        （会議議事録、電話メモ、文字起こしなど）
                      </span>
                    </label>
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder={`抽出したいテキストを入力してください...

例:
「本日の会議では、N様（90代女性、要介護3）の入居相談について話し合いました。
A社の田中さんから紹介で、来週月曜に見学希望とのこと。
ミヤビの空室があれば案内予定。
また、先日の転倒事故について再発防止策を検討...」`}
                      className="w-full h-80 p-4 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                      disabled={loading}
                    />
                    <div className="flex justify-between text-sm text-gray-500 mt-1">
                      <span>{rawText.length.toLocaleString()} / 100,000 文字</span>
                      {rawText.length > 80000 && (
                        <span className="text-orange-500">
                          文字数が多いと処理に時間がかかります
                        </span>
                      )}
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => router.back()} disabled={loading}>
                      キャンセル
                    </Button>
                    <Button onClick={handleTextSubmit} disabled={loading || !rawText.trim()}>
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          抽出中...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          抽出を開始
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 音声アップロードモード */}
          {inputMode === 'audio' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="w-5 h-5" />
                  音声アップロード
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* ファイル選択エリア */}
                  {audioStep === 'select' && !audioFile && (
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                        dragOver
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
                      }`}
                    >
                      <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-lg font-medium text-gray-700 mb-2">
                        音声ファイルをドラッグ&ドロップ
                      </p>
                      <p className="text-sm text-gray-500 mb-4">
                        またはクリックしてファイルを選択
                      </p>
                      <p className="text-xs text-gray-400">
                        対応形式: {SUPPORTED_EXTENSIONS.join(', ')} / 最大25MB
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={SUPPORTED_EXTENSIONS.map(e => `audio/*,${e}`).join(',')}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(file);
                        }}
                        className="hidden"
                      />
                    </div>
                  )}

                  {/* 選択済みファイル表示 */}
                  {audioFile && audioStep === 'select' && (
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-100 rounded-lg">
                            <Volume2 className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{audioFile.name}</p>
                            <p className="text-sm text-gray-500">
                              {(audioFile.size / 1024 / 1024).toFixed(1)} MB
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={resetAudio}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                          <X className="w-5 h-5 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* アップロード・文字起こし中 */}
                  {(audioStep === 'uploading' || audioStep === 'transcribing') && (
                    <div className="border rounded-lg p-8 text-center">
                      <Loader2 className="w-10 h-10 mx-auto mb-4 text-purple-500 animate-spin" />
                      <p className="text-lg font-medium text-gray-700 mb-2">
                        {audioStep === 'uploading' ? 'アップロード中...' : '文字起こし中...'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {audioStep === 'uploading'
                          ? '音声ファイルをアップロードしています'
                          : 'Whisper AIが音声を解析しています。しばらくお待ちください'}
                      </p>
                    </div>
                  )}

                  {/* 文字起こし完了 */}
                  {audioStep === 'done' && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-green-600 mb-2">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-medium">文字起こし完了</span>
                      </div>

                      {audioUrl && (
                        <div className="border rounded-lg p-3 bg-gray-50">
                          <audio controls src={audioUrl} className="w-full" />
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          文字起こし結果
                          <span className="text-gray-400 ml-2">（編集可能）</span>
                        </label>
                        <textarea
                          value={transcribedText}
                          onChange={(e) => setTranscribedText(e.target.value)}
                          className="w-full h-64 p-4 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                          disabled={loading}
                        />
                        <div className="text-sm text-gray-500 mt-1">
                          {transcribedText.length.toLocaleString()} 文字
                        </div>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* アクションボタン */}
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="secondary"
                      onClick={audioStep === 'done' ? resetAudio : () => router.back()}
                      disabled={loading}
                    >
                      {audioStep === 'done' ? 'やり直す' : 'キャンセル'}
                    </Button>

                    {audioStep === 'select' && audioFile && (
                      <Button onClick={handleAudioUpload} disabled={loading}>
                        <Upload className="w-4 h-4 mr-2" />
                        アップロード＆文字起こし
                      </Button>
                    )}

                    {audioStep === 'done' && (
                      <Button
                        onClick={handleTranscriptionExtract}
                        disabled={loading || !transcribedText.trim()}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            抽出中...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            抽出を開始
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ヒント */}
          <Card className="mt-6 bg-purple-50 border-purple-200">
            <CardContent className="py-4">
              <h3 className="font-medium text-purple-900 mb-2">抽出のヒント</h3>
              <ul className="text-sm text-purple-700 space-y-1">
                {inputMode === 'text' ? (
                  <>
                    <li>・会議の議事録や電話メモ、文字起こしテキストを入力できます</li>
                    <li>・人名、日付、施設名などは具体的に記載すると精度が上がります</li>
                  </>
                ) : (
                  <>
                    <li>・会議録音、電話録音、入居相談の録音などをアップロードできます</li>
                    <li>・MP3, M4A, WAV, WebM, OGG, FLAC形式に対応しています</li>
                    <li>・文字起こし後にテキストを編集してから抽出できます</li>
                  </>
                )}
                <li>・抽出結果は確認・編集後に各機能へ反映できます</li>
                <li>・個人情報を含むデータは適切に管理されます</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
