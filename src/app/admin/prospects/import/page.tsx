'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { hasMinRole } from '@/lib/auth';
import {
  FileSpreadsheet,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Eye,
  Play,
  History,
  ExternalLink,
  Archive,
} from 'lucide-react';

interface ImportLog {
  id: string;
  sheetId: string;
  result: {
    totalRows: number;
    imported: number;
    skipped: number;
    duplicates: number;
    errors: string[];
  };
  importedByName: string;
  createdAt: Date;
}

interface PreviewData {
  headers: string[];
  mapping: Record<string, number>;
  previewRows: string[][];
  totalRows: number;
}

export default function ImportProspectsPage() {
  return (
    <AuthGuard>
      <ImportProspectsContent />
    </AuthGuard>
  );
}

function ImportProspectsContent() {
  const { user, firebaseUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [recentLogs, setRecentLogs] = useState<ImportLog[]>([]);
  const [sheetId, setSheetId] = useState('1y00PmqtKRCsyrvaH8ydO3QbzVbFXGEVA2dpKOUDJMaY');
  const [yearFilter, setYearFilter] = useState(2026); // デフォルト2026年以降
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    imported: number;
    skipped: number;
    duplicates: number;
    archived: number;
    errors: string[];
  } | null>(null);

  const canAccess = hasMinRole(user?.role, 'leader');

  const fetchStatus = useCallback(async () => {
    if (!user || !firebaseUser) return;

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/google/sheets?action=status', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setRecentLogs(
          data.recentLogs.map((log: ImportLog & { createdAt: string }) => ({
            ...log,
            createdAt: new Date(log.createdAt),
          }))
        );
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  }, [user, firebaseUser]);

  useEffect(() => {
    if (canAccess) {
      fetchStatus();
    } else {
      setLoading(false);
    }
  }, [canAccess, fetchStatus]);

  const handlePreview = async () => {
    if (!sheetId.trim() || !firebaseUser) return;

    setLoading(true);
    setPreview(null);
    setImportResult(null);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/google/sheets?action=preview&sheetId=${encodeURIComponent(sheetId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setPreview(data);
      } else {
        const error = await res.json();
        alert(error.error || 'プレビューの取得に失敗しました');
      }
    } catch (error) {
      console.error('Preview failed:', error);
      alert('プレビューの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (dryRun: boolean = false) => {
    if (!sheetId.trim() || !firebaseUser) return;

    setImporting(true);
    setImportResult(null);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/google/sheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sheetId, dryRun, yearFilter }),
      });

      const data = await res.json();

      if (res.ok) {
        setImportResult({
          success: data.success,
          imported: data.imported,
          skipped: data.skipped,
          duplicates: data.duplicates,
          archived: data.archived || 0,
          errors: data.errors,
        });

        if (!dryRun && data.success) {
          fetchStatus();
        }
      } else {
        alert(data.error || 'インポートに失敗しました');
      }
    } catch (error) {
      console.error('Import failed:', error);
      alert('インポートに失敗しました');
    } finally {
      setImporting(false);
    }
  };

  if (!canAccess) {
    return (
      <>
        <Header />
        <main className="pb-20 md:pb-8">
          <div className="max-w-4xl mx-auto px-4 py-16 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">アクセス権限がありません</h1>
            <p className="text-gray-500">この機能は管理者のみ利用可能です。</p>
          </div>
        </main>
      </>
    );
  }

  if (loading && !preview) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
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
            <Link href="/dashboard/prospects">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <FileSpreadsheet className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Google Sheetsインポート</h1>
                <p className="text-sm text-gray-500">入居希望者データをインポート</p>
              </div>
            </div>
          </div>

          {/* シートID入力 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">スプレッドシート設定</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    スプレッドシートID
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={sheetId}
                      onChange={(e) => setSheetId(e.target.value)}
                      placeholder="1y00PmqtKRCsyrvaH8ydO3QbzVbFXGEVA2dpKOUDJMaY"
                      className="flex-1"
                    />
                    <Button
                      variant="secondary"
                      onClick={handlePreview}
                      disabled={!sheetId.trim() || loading}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      プレビュー
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    スプレッドシートURLから取得: docs.google.com/spreadsheets/d/<strong>[このID]</strong>/edit
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    ※ スプレッドシートは「リンクを知っている全員」に共有されている必要があります
                  </p>
                </div>

                {/* 年フィルター */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    インポート対象年
                  </label>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(parseInt(e.target.value))}
                    className="px-3 py-2 border rounded-md text-sm bg-white"
                  >
                    <option value={2026}>2026年以降のみ（推奨）</option>
                    <option value={2025}>2025年以降</option>
                    <option value={2024}>2024年以降</option>
                    <option value={0}>すべて（年フィルターなし）</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    指定年未満のデータは「アーカイブ」としてスキップされます
                  </p>
                </div>

                {sheetId && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    スプレッドシートを開く
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          {/* プレビュー */}
          {preview && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">データプレビュー</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* 検出された列マッピング */}
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">検出された列:</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(preview.mapping).map(([key, index]) => (
                        <span
                          key={key}
                          className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                        >
                          {key}: {preview.headers[index]}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* データプレビュー */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          {preview.headers.slice(0, 8).map((header, i) => (
                            <th key={i} className="px-2 py-1 text-left font-medium text-gray-600">
                              {header || `列${i + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.previewRows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-b">
                            {row.slice(0, 8).map((cell, cellIndex) => (
                              <td key={cellIndex} className="px-2 py-1 text-gray-800 truncate max-w-[150px]">
                                {cell || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-sm text-gray-500">
                    全{preview.totalRows}行（ヘッダー除く）
                  </p>

                  {/* インポートボタン */}
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="secondary"
                      onClick={() => handleImport(true)}
                      disabled={importing}
                    >
                      {importing ? (
                        <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4 mr-1" />
                      )}
                      ドライラン（テスト）
                    </Button>
                    <Button onClick={() => handleImport(false)} disabled={importing}>
                      {importing ? (
                        <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-1" />
                      )}
                      インポート実行
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* インポート結果 */}
          {importResult && (
            <Card className={`mb-6 ${importResult.success ? 'border-green-200' : 'border-red-200'}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {importResult.success ? (
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${importResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {importResult.success ? 'インポート完了' : 'インポート失敗'}
                    </p>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">インポート済み</p>
                        <p className="text-lg font-bold text-green-600">{importResult.imported}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">重複スキップ</p>
                        <p className="text-lg font-bold text-yellow-600">{importResult.duplicates}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">アーカイブ</p>
                        <p className="text-lg font-bold text-blue-600">{importResult.archived}</p>
                        <p className="text-xs text-gray-400">(旧データ)</p>
                      </div>
                      <div>
                        <p className="text-gray-500">その他スキップ</p>
                        <p className="text-lg font-bold text-gray-600">{importResult.skipped}</p>
                      </div>
                    </div>
                    {importResult.errors.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-red-700">エラー:</p>
                        <ul className="text-sm text-red-600 list-disc list-inside">
                          {importResult.errors.slice(0, 5).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                          {importResult.errors.length > 5 && (
                            <li>...他{importResult.errors.length - 5}件</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* インポート履歴 */}
          {recentLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="w-5 h-5" />
                  インポート履歴
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            {log.result.imported}件インポート
                            {log.result.duplicates > 0 && ` / ${log.result.duplicates}件重複`}
                          </p>
                          <p className="text-xs text-gray-500">
                            {log.importedByName} - {log.createdAt.toLocaleString('ja-JP')}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            log.result.errors.length === 0
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {log.result.errors.length === 0 ? '成功' : 'エラーあり'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
