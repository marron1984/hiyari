'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import {
  FileText,
  Upload,
  Trash2,
  Download,
  RefreshCw,
  File,
  FileImage,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react';
import type { ProspectDocument, DocumentCategory } from '@/types/prospect';
import { DOCUMENT_CATEGORIES } from '@/types/prospect';
import { hasMinRole } from '@/lib/auth';

interface ProspectDocumentsProps {
  prospectId: string;
  documents: ProspectDocument[];
  onRefresh: () => void;
}

// ファイルアイコンを取得
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) {
    return <FileImage className="w-5 h-5 text-blue-500" />;
  }
  if (mimeType === 'application/pdf') {
    return <FileText className="w-5 h-5 text-red-500" />;
  }
  return <File className="w-5 h-5 text-gray-500" />;
}

// ファイルサイズをフォーマット
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// カテゴリの色設定
const categoryColors: Record<DocumentCategory, { bg: string; text: string }> = {
  '診療情報': { bg: 'bg-red-100', text: 'text-red-700' },
  '看護サマリー': { bg: 'bg-pink-100', text: 'text-pink-700' },
  '検査結果': { bg: 'bg-orange-100', text: 'text-orange-700' },
  '身分証': { bg: 'bg-blue-100', text: 'text-blue-700' },
  '保険証': { bg: 'bg-green-100', text: 'text-green-700' },
  '介護保険証': { bg: 'bg-purple-100', text: 'text-purple-700' },
  'その他': { bg: 'bg-gray-100', text: 'text-gray-700' },
};

export function ProspectDocuments({ prospectId, documents, onRefresh }: ProspectDocumentsProps) {
  const { user, firebaseUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('診療情報');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);

  const canDelete = hasMinRole(user?.role, 'leader');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setShowUploadModal(true);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !firebaseUser) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const token = await firebaseUser.getIdToken();
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('category', selectedCategory);
      if (note) {
        formData.append('note', note);
      }

      const res = await fetch(`/api/prospects/${prospectId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setUploadResult({ success: true, message: 'アップロードしました' });
        setTimeout(() => {
          setShowUploadModal(false);
          setSelectedFile(null);
          setNote('');
          setUploadResult(null);
          onRefresh();
        }, 1500);
      } else {
        setUploadResult({ success: false, message: data.error || 'アップロードに失敗しました' });
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadResult({ success: false, message: 'アップロードに失敗しました' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!firebaseUser || !confirm('この書類を削除しますか？')) return;

    setDeleting(documentId);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/prospects/${prospectId}/documents`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId }),
      });

      if (res.ok) {
        onRefresh();
      } else {
        const data = await res.json();
        alert(data.error || '削除に失敗しました');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('削除に失敗しました');
    } finally {
      setDeleting(null);
    }
  };

  // カテゴリごとにグループ化
  const groupedDocuments = documents.reduce((acc, doc) => {
    const category = doc.category || 'その他';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(doc);
    return acc;
  }, {} as Record<string, ProspectDocument[]>);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              書類管理
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onRefresh}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-1" />
                アップロード
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx"
                onChange={handleFileSelect}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>書類がありません</p>
              <p className="text-sm mt-1">
                診療情報、看護サマリー、検査結果、保険証などをアップロードできます
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {DOCUMENT_CATEGORIES.map((category) => {
                const docs = groupedDocuments[category];
                if (!docs || docs.length === 0) return null;

                const colors = categoryColors[category];

                return (
                  <div key={category}>
                    <h4 className={`text-sm font-medium mb-2 px-2 py-1 rounded ${colors.bg} ${colors.text} inline-block`}>
                      {category}
                    </h4>
                    <div className="space-y-2">
                      {docs.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {getFileIcon(doc.mimeType)}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{doc.fileName}</p>
                              <p className="text-xs text-gray-500">
                                {formatFileSize(doc.fileSize)} ・ {doc.uploadedByName} ・{' '}
                                {new Date(doc.uploadedAt).toLocaleDateString('ja-JP')}
                              </p>
                              {doc.note && (
                                <p className="text-xs text-gray-600 mt-1">{doc.note}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <a
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(doc.id)}
                                disabled={deleting === doc.id}
                                className="p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                              >
                                {deleting === doc.id ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* アップロードモーダル */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">書類をアップロード</h3>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setNote('');
                  setUploadResult(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadResult ? (
              <div className={`flex items-center gap-2 p-4 rounded-lg ${uploadResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {uploadResult.success ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
                <span>{uploadResult.message}</span>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {/* ファイル情報 */}
                  {selectedFile && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      {getFileIcon(selectedFile.type)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                      </div>
                    </div>
                  )}

                  {/* カテゴリ選択 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      カテゴリ
                    </label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value as DocumentCategory)}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      {DOCUMENT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* メモ */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      メモ（任意）
                    </label>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="例: 2024年1月の検査結果"
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowUploadModal(false);
                      setSelectedFile(null);
                      setNote('');
                    }}
                  >
                    キャンセル
                  </Button>
                  <Button onClick={handleUpload} disabled={uploading}>
                    {uploading ? (
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-1" />
                    )}
                    アップロード
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
