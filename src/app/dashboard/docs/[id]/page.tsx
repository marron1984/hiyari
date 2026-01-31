'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { getDocument, getDocumentEvents } from '@/lib/document';
import {
  Document,
  DocumentEvent,
  DOCUMENT_STATUS_CONFIG,
  DOCUMENT_OWNER_TYPE_CONFIG,
} from '@/types/document';
import { auth } from '@/lib/firebase';
import {
  FileText,
  ArrowLeft,
  Upload,
  Download,
  Clock,
  CheckCircle,
  AlertTriangle,
  History,
  User,
  Calendar,
  FileUp,
  RefreshCw,
} from 'lucide-react';

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<Document | null>(null);
  const [events, setEvents] = useState<DocumentEvent[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documentId = params.id as string;

  const fetchData = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const [doc, evts] = await Promise.all([
        getDocument(documentId),
        getDocumentEvents(documentId),
      ]);
      setDocument(doc);
      setEvents(evts);
    } catch (err) {
      console.error('Failed to fetch document:', err);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('認証が必要です');
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/documents/${documentId}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'アップロードに失敗しました');
      }

      // 成功したらデータを再取得
      await fetchData();
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err instanceof Error ? err.message : 'アップロードに失敗しました');
    } finally {
      setUploading(false);
      // ファイル入力をリセット
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) {
    return <Loading text="読み込み中..." />;
  }

  if (!document) {
    return (
      <main className="pb-20 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>書類が見つかりません</p>
            <Link href="/dashboard/docs">
              <Button variant="secondary" className="mt-4">
                書類一覧に戻る
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const statusConfig = DOCUMENT_STATUS_CONFIG[document.status];
  const ownerConfig = DOCUMENT_OWNER_TYPE_CONFIG[document.ownerType];

  return (
    <main className="pb-20 md:pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Link href="/dashboard/docs" className="text-gray-500 hover:text-gray-700">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <FileText className="w-6 h-6" />
                  {document.docTypeName || document.docType}
                </h1>
              </div>
              <p className="text-sm text-gray-500">
                {ownerConfig.label}: {document.ownerName || document.ownerId}
              </p>
            </div>
            <Badge className={`${statusConfig.bgColor} ${statusConfig.color} text-sm px-3 py-1`}>
              {statusConfig.label}
            </Badge>
          </div>

          {/* アップロードエラー */}
          {uploadError && (
            <Card className="mb-6 bg-red-50 border-red-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-5 h-5" />
                  <span>{uploadError}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* メインカード */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* 書類情報 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">書類情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-500">ステータス</span>
                  <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
                    {statusConfig.label}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">バージョン</span>
                  <span>v{document.version}</span>
                </div>
                {document.dueDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">期限日</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {document.dueDate.toLocaleDateString('ja-JP')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">署名要否</span>
                  <span>{document.signedRequired ? '必要' : '不要'}</span>
                </div>
                {document.signedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">署名日</span>
                    <span>{document.signedAt.toLocaleDateString('ja-JP')}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ファイル情報 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>ファイル</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  />
                  <Button
                    variant="primary"
                    onClick={handleUploadClick}
                    disabled={uploading}
                    className="text-sm"
                  >
                    {uploading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                        アップロード中...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-1" />
                        アップロード
                      </>
                    )}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {document.fileUrl ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileUp className="w-8 h-8 text-blue-500" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{document.fileName}</p>
                          <p className="text-sm text-gray-500">
                            {document.fileSize ? `${(document.fileSize / 1024).toFixed(1)} KB` : ''}
                            {document.fileMime ? ` / ${document.fileMime}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                    <a
                      href={document.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                    >
                      <Download className="w-4 h-4" />
                      ファイルをダウンロード
                    </a>
                    {document.uploadedAt && (
                      <p className="text-sm text-gray-500">
                        <User className="w-4 h-4 inline mr-1" />
                        {document.uploadedByName || document.uploadedBy} が{' '}
                        {document.uploadedAt.toLocaleDateString('ja-JP')} にアップロード
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>ファイルがアップロードされていません</p>
                    <p className="text-sm mt-2">上のボタンからアップロードしてください</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 履歴 */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="w-5 h-5" />
                変更履歴
              </CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-center py-4 text-gray-500">履歴がありません</p>
              ) : (
                <div className="space-y-4">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 pb-4 border-b last:border-0"
                    >
                      <div className="p-2 bg-gray-100 rounded-full">
                        {event.eventType === 'CREATE' && <FileText className="w-4 h-4 text-gray-500" />}
                        {event.eventType === 'UPLOAD' && <Upload className="w-4 h-4 text-green-500" />}
                        {event.eventType === 'REPLACE' && <RefreshCw className="w-4 h-4 text-blue-500" />}
                        {event.eventType === 'STATUS_CHANGE' && <CheckCircle className="w-4 h-4 text-yellow-500" />}
                        {event.eventType === 'DUE_CHANGE' && <Clock className="w-4 h-4 text-orange-500" />}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          {event.eventType === 'CREATE' && '書類を作成'}
                          {event.eventType === 'UPLOAD' && 'ファイルをアップロード'}
                          {event.eventType === 'REPLACE' && 'ファイルを差し替え'}
                          {event.eventType === 'STATUS_CHANGE' && 'ステータスを変更'}
                          {event.eventType === 'DUE_CHANGE' && '期限日を変更'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {event.actorName || event.actorId} /{' '}
                          {event.createdAt.toLocaleDateString('ja-JP')}{' '}
                          {event.createdAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
      </div>
    </main>
  );
}
