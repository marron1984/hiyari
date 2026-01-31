'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Badge } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { hasMinRole } from '@/lib/auth';
import {
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Settings,
  Clock,
  Database,
  Link2,
  Link2Off,
  FileSpreadsheet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  Play,
  History,
  Info,
  Moon,
  Zap,
} from 'lucide-react';
import type { SyncEntity, SyncLog, SyncPreview, SheetsConnectionConfig } from '@/types/sheets-sync';

interface BatchSyncLog {
  id: string;
  type: 'nightly-batch';
  startedAt: string;
  completedAt: string;
  results: {
    entity: SyncEntity;
    success: boolean;
    rowsProcessed: number;
    rowsCreated: number;
    rowsUpdated: number;
    rowsSkipped: number;
    rowsConflict: number;
    errorCount: number;
    error?: string;
  }[];
  summary: {
    totalEntities: number;
    successfulEntities: number;
    failedEntities: number;
    totalRowsProcessed: number;
    totalRowsCreated: number;
    totalRowsUpdated: number;
  };
}

interface ConnectionStatus {
  isConfigured: boolean;
  serviceAccountEmail: string | null;
  connectionConfig: SheetsConnectionConfig | null;
  recentLogs: SyncLog[];
  latestBatchLog: BatchSyncLog | null;
}

export default function GoogleSheetsSyncPage() {
  return (
    <AuthGuard>
      <GoogleSheetsSyncContent />
    </AuthGuard>
  );
}

function GoogleSheetsSyncContent() {
  const { user, firebaseUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    spreadsheetName?: string;
    sheets?: { title: string; sheetId: number }[];
    error?: string;
  } | null>(null);

  // シート設定
  const [sheetConfigs, setSheetConfigs] = useState<{
    entity: SyncEntity;
    sheetName: string;
    gid: number;
    isActive: boolean;
  }[]>([]);

  // 同期関連
  const [selectedEntity, setSelectedEntity] = useState<SyncEntity>('prospects');
  const [syncDirection, setSyncDirection] = useState<'BIDIRECTIONAL' | 'IMPORT' | 'EXPORT'>('BIDIRECTIONAL');
  const [syncing, setSyncing] = useState(false);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    rowsProcessed: number;
    rowsCreated: number;
    rowsUpdated: number;
    rowsSkipped: number;
    errors: { message: string }[];
  } | null>(null);

  const canAccess = hasMinRole(user?.role, 'admin');

  // 接続状況を取得
  const fetchStatus = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/google-sheets?action=status', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStatus(data);

        if (data.connectionConfig?.spreadsheetId) {
          setSpreadsheetId(data.connectionConfig.spreadsheetId);
          setSheetConfigs(data.connectionConfig.sheets || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // 接続テスト
  const handleTestConnection = async () => {
    if (!firebaseUser || !spreadsheetId) return;

    setTesting(true);
    setTestResult(null);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(
        `/api/admin/google-sheets?action=test&spreadsheetId=${encodeURIComponent(spreadsheetId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      setTestResult(data);

      // シート一覧から設定を初期化
      if (data.success && data.sheets) {
        const defaultConfigs: typeof sheetConfigs = [];
        const entities: SyncEntity[] = ['prospects', 'sales', 'applications'];

        entities.forEach((entity) => {
          const existingConfig = sheetConfigs.find((c) => c.entity === entity);
          if (existingConfig) {
            defaultConfigs.push(existingConfig);
          } else {
            // デフォルトシートを探す
            const matchingSheet = data.sheets.find((s: { title: string }) =>
              s.title.toLowerCase().includes(entity.slice(0, 5))
            );
            defaultConfigs.push({
              entity,
              sheetName: matchingSheet?.title || '',
              gid: matchingSheet?.sheetId || 0,
              isActive: !!matchingSheet,
            });
          }
        });

        setSheetConfigs(defaultConfigs);
      }
    } catch (error) {
      setTestResult({ success: false, error: '接続テストに失敗しました' });
    } finally {
      setTesting(false);
    }
  };

  // 接続設定を保存
  const handleConnect = async () => {
    if (!firebaseUser || !spreadsheetId) return;

    setConnecting(true);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/google-sheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spreadsheetId,
          sheets: sheetConfigs.filter((c) => c.sheetName),
        }),
      });

      if (res.ok) {
        await fetchStatus();
        alert('接続設定を保存しました');
      } else {
        const error = await res.json();
        alert(error.error || '保存に失敗しました');
      }
    } catch (error) {
      alert('保存に失敗しました');
    } finally {
      setConnecting(false);
    }
  };

  // 同期プレビュー
  const handlePreview = async () => {
    if (!firebaseUser) return;

    setLoadingPreview(true);
    setPreview(null);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/sync/google-sheets?entity=${selectedEntity}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setPreview(data.preview);
      } else {
        const error = await res.json();
        alert(error.error || 'プレビューの取得に失敗しました');
      }
    } catch (error) {
      alert('プレビューの取得に失敗しました');
    } finally {
      setLoadingPreview(false);
    }
  };

  // 同期実行
  const handleSync = async (dryRun: boolean = false) => {
    if (!firebaseUser) return;

    setSyncing(true);
    setSyncResult(null);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/sync/google-sheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entity: selectedEntity,
          direction: syncDirection,
          dryRun,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSyncResult(data.result);
        if (!dryRun) {
          await fetchStatus();
        }
      } else {
        const error = await res.json();
        alert(error.error || '同期に失敗しました');
      }
    } catch (error) {
      alert('同期に失敗しました');
    } finally {
      setSyncing(false);
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

  if (loading) {
    return (
      <>
        <Header />
        <Loading />
      </>
    );
  }

  const isConnected = status?.connectionConfig?.isConnected;
  const entityLabels: Record<SyncEntity, string> = {
    prospects: '入居希望者',
    sales: '営業進捗',
    applications: '申請一覧',
  };

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin/sync">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <FileSpreadsheet className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Google Sheets 双方向同期</h1>
                <p className="text-sm text-gray-500">Service Account認証による安全な同期</p>
              </div>
            </div>
          </div>

          {/* 接続状況 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {isConnected ? (
                  <Link2 className="w-5 h-5 text-green-600" />
                ) : (
                  <Link2Off className="w-5 h-5 text-gray-400" />
                )}
                接続設定
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Service Account状況 */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Database className="w-5 h-5 text-blue-600" />
                  <div className="flex-1">
                    <p className="font-medium">Service Account</p>
                    <p className="text-sm text-gray-500">
                      {status?.isConfigured ? (
                        <span className="text-green-600">{status.serviceAccountEmail}</span>
                      ) : (
                        <span className="text-red-600">未設定（環境変数 GOOGLE_SHEETS_SERVICE_ACCOUNT を設定してください）</span>
                      )}
                    </p>
                  </div>
                  {status?.isConfigured ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                </div>

                {status?.isConfigured && (
                  <>
                    {/* スプレッドシートID入力 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        スプレッドシートID
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={spreadsheetId}
                          onChange={(e) => setSpreadsheetId(e.target.value)}
                          placeholder="1ABC...xyz"
                          className="flex-1"
                        />
                        <Button onClick={handleTestConnection} disabled={testing || !spreadsheetId}>
                          {testing ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            '接続テスト'
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        スプレッドシートURLの /d/ と /edit の間の文字列
                      </p>
                    </div>

                    {/* 接続テスト結果 */}
                    {testResult && (
                      <div className={`p-3 rounded-lg ${testResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                        {testResult.success ? (
                          <>
                            <p className="font-medium text-green-800">
                              <CheckCircle className="w-4 h-4 inline mr-1" />
                              接続成功: {testResult.spreadsheetName}
                            </p>
                            <p className="text-sm text-green-600 mt-1">
                              シート: {testResult.sheets?.map((s) => s.title).join(', ')}
                            </p>
                          </>
                        ) : (
                          <p className="text-red-800">
                            <AlertCircle className="w-4 h-4 inline mr-1" />
                            {testResult.error}
                          </p>
                        )}
                      </div>
                    )}

                    {/* シート設定 */}
                    {testResult?.success && (
                      <div className="border-t pt-4">
                        <h3 className="font-medium mb-3">シート設定</h3>
                        <div className="space-y-3">
                          {sheetConfigs.map((config, index) => (
                            <div key={config.entity} className="flex items-center gap-3">
                              <Badge variant={config.isActive ? 'success' : 'default'}>
                                {entityLabels[config.entity]}
                              </Badge>
                              <select
                                value={config.sheetName}
                                onChange={(e) => {
                                  const newConfigs = [...sheetConfigs];
                                  const selectedSheet = testResult.sheets?.find(
                                    (s) => s.title === e.target.value
                                  );
                                  newConfigs[index] = {
                                    ...config,
                                    sheetName: e.target.value,
                                    gid: selectedSheet?.sheetId || 0,
                                    isActive: !!e.target.value,
                                  };
                                  setSheetConfigs(newConfigs);
                                }}
                                className="flex-1 px-3 py-2 border rounded-lg"
                              >
                                <option value="">選択しない</option>
                                {testResult.sheets?.map((s) => (
                                  <option key={s.sheetId} value={s.title}>
                                    {s.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>

                        <Button onClick={handleConnect} disabled={connecting} className="mt-4">
                          {connecting ? (
                            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <Settings className="w-4 h-4 mr-1" />
                          )}
                          設定を保存
                        </Button>
                      </div>
                    )}

                    {/* 現在の接続情報 */}
                    {isConnected && status?.connectionConfig && (
                      <div className="border-t pt-4">
                        <h3 className="font-medium mb-2">現在の接続</h3>
                        <div className="bg-gray-50 p-3 rounded-lg text-sm">
                          <p>
                            <strong>スプレッドシート:</strong> {status.connectionConfig.spreadsheetName}
                          </p>
                          <p className="mt-1">
                            <strong>設定済みシート:</strong>{' '}
                            {status.connectionConfig.sheets
                              .filter((s) => s.isActive)
                              .map((s) => `${entityLabels[s.entity]}(${s.sheetName})`)
                              .join(', ') || 'なし'}
                          </p>
                          {status.connectionConfig.lastSyncAt && (
                            <p className="mt-1">
                              <strong>最終同期:</strong>{' '}
                              {new Date(status.connectionConfig.lastSyncAt).toLocaleString('ja-JP')}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 同期実行 */}
          {isConnected && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5" />
                  同期実行
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* エンティティ選択 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      同期対象
                    </label>
                    <div className="flex gap-2">
                      {(['prospects', 'sales', 'applications'] as SyncEntity[]).map((entity) => {
                        const config = status?.connectionConfig?.sheets.find(
                          (s) => s.entity === entity && s.isActive
                        );
                        return (
                          <Button
                            key={entity}
                            variant={selectedEntity === entity ? 'primary' : 'outline'}
                            onClick={() => {
                              setSelectedEntity(entity);
                              setPreview(null);
                              setSyncResult(null);
                            }}
                            disabled={!config}
                          >
                            {entityLabels[entity]}
                            {!config && ' (未設定)'}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 同期方向 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      同期方向
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant={syncDirection === 'BIDIRECTIONAL' ? 'primary' : 'outline'}
                        onClick={() => setSyncDirection('BIDIRECTIONAL')}
                      >
                        <ArrowUpDown className="w-4 h-4 mr-1" />
                        双方向
                      </Button>
                      <Button
                        variant={syncDirection === 'IMPORT' ? 'primary' : 'outline'}
                        onClick={() => setSyncDirection('IMPORT')}
                      >
                        <ArrowDown className="w-4 h-4 mr-1" />
                        インポート
                      </Button>
                      <Button
                        variant={syncDirection === 'EXPORT' ? 'primary' : 'outline'}
                        onClick={() => setSyncDirection('EXPORT')}
                      >
                        <ArrowUp className="w-4 h-4 mr-1" />
                        エクスポート
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {syncDirection === 'BIDIRECTIONAL' && '双方向: 新しい方を優先して同期します（競合時はAA-HUB優先）'}
                      {syncDirection === 'IMPORT' && 'インポート: シートのデータをAA-HUBに取り込みます'}
                      {syncDirection === 'EXPORT' && 'エクスポート: AA-HUBのデータをシートに書き出します'}
                    </p>
                  </div>

                  {/* アクションボタン */}
                  <div className="flex gap-2">
                    <Button onClick={handlePreview} disabled={loadingPreview}>
                      {loadingPreview ? (
                        <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4 mr-1" />
                      )}
                      プレビュー
                    </Button>
                    <Button onClick={() => handleSync(true)} disabled={syncing} variant="outline">
                      {syncing ? (
                        <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Info className="w-4 h-4 mr-1" />
                      )}
                      ドライラン
                    </Button>
                    <Button onClick={() => handleSync(false)} disabled={syncing}>
                      {syncing ? (
                        <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-1" />
                      )}
                      同期実行
                    </Button>
                  </div>

                  {/* プレビュー結果 */}
                  {preview && (
                    <div className="border-t pt-4">
                      <h3 className="font-medium mb-3">プレビュー結果</h3>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                        <div className="bg-blue-50 p-3 rounded-lg text-center">
                          <p className="text-2xl font-bold text-blue-600">{preview.toImport}</p>
                          <p className="text-gray-600">インポート</p>
                        </div>
                        <div className="bg-green-50 p-3 rounded-lg text-center">
                          <p className="text-2xl font-bold text-green-600">{preview.toExport}</p>
                          <p className="text-gray-600">エクスポート</p>
                        </div>
                        <div className="bg-purple-50 p-3 rounded-lg text-center">
                          <p className="text-2xl font-bold text-purple-600">{preview.toCreate}</p>
                          <p className="text-gray-600">新規作成</p>
                        </div>
                        <div className="bg-yellow-50 p-3 rounded-lg text-center">
                          <p className="text-2xl font-bold text-yellow-600">{preview.conflicts}</p>
                          <p className="text-gray-600">競合</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg text-center">
                          <p className="text-2xl font-bold text-gray-600">{preview.unchanged}</p>
                          <p className="text-gray-600">変更なし</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 同期結果 */}
                  {syncResult && (
                    <div className={`p-4 rounded-lg ${syncResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                      <h3 className="font-medium mb-2 flex items-center gap-2">
                        {syncResult.success ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600" />
                        )}
                        同期結果
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>処理: {syncResult.rowsProcessed}件</div>
                        <div>作成: {syncResult.rowsCreated}件</div>
                        <div>更新: {syncResult.rowsUpdated}件</div>
                        <div>スキップ: {syncResult.rowsSkipped}件</div>
                      </div>
                      {syncResult.errors.length > 0 && (
                        <div className="mt-2 text-sm text-red-600">
                          エラー: {syncResult.errors.length}件
                          <ul className="list-disc list-inside mt-1">
                            {syncResult.errors.slice(0, 5).map((e, i) => (
                              <li key={i}>{e.message}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 夜間バッチ同期結果 */}
          {status?.latestBatchLog && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Moon className="w-5 h-5" />
                  夜間自動バッチ同期
                  <Badge variant={status.latestBatchLog.summary.failedEntities === 0 ? 'success' : 'danger'}>
                    {status.latestBatchLog.summary.failedEntities === 0 ? '正常' : 'エラーあり'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* 実行情報 */}
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>
                        {new Date(status.latestBatchLog.completedAt).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Zap className="w-4 h-4" />
                      <span>毎日 03:00 JST</span>
                    </div>
                  </div>

                  {/* サマリー */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-blue-50 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        {status.latestBatchLog.summary.successfulEntities}/{status.latestBatchLog.summary.totalEntities}
                      </p>
                      <p className="text-xs text-gray-600">成功エンティティ</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-gray-600">
                        {status.latestBatchLog.summary.totalRowsProcessed}
                      </p>
                      <p className="text-xs text-gray-600">処理行数</p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {status.latestBatchLog.summary.totalRowsCreated}
                      </p>
                      <p className="text-xs text-gray-600">新規作成</p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-purple-600">
                        {status.latestBatchLog.summary.totalRowsUpdated}
                      </p>
                      <p className="text-xs text-gray-600">更新</p>
                    </div>
                  </div>

                  {/* エンティティ別結果 */}
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium mb-2">エンティティ別結果</h4>
                    <div className="space-y-2">
                      {status.latestBatchLog.results.map((result) => (
                        <div
                          key={result.entity}
                          className={`flex items-center justify-between p-2 rounded-lg ${
                            result.success ? 'bg-green-50' : 'bg-red-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {result.success ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-600" />
                            )}
                            <span className="font-medium">{entityLabels[result.entity]}</span>
                          </div>
                          <div className="text-sm text-gray-600">
                            {result.error ? (
                              <span className="text-red-600">{result.error}</span>
                            ) : (
                              <span>
                                処理: {result.rowsProcessed} / 作成: {result.rowsCreated} / 更新: {result.rowsUpdated}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 同期履歴 */}
          {status?.recentLogs && status.recentLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="w-5 h-5" />
                  最近の同期履歴
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {status.recentLogs.map((log) => (
                    <div key={log.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">
                          {entityLabels[log.entity]} - {log.direction}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(log.createdAt).toLocaleString('ja-JP')} by {log.executedByName}
                        </p>
                        <p className="text-sm">
                          処理: {log.result.rowsProcessed}件 / 作成: {log.result.rowsCreated}件 /
                          更新: {log.result.rowsUpdated}件
                          {log.result.errorCount > 0 && (
                            <span className="text-red-600"> / エラー: {log.result.errorCount}件</span>
                          )}
                        </p>
                      </div>
                      {log.result.success ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ヘルプ */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="w-5 h-5" />
                シートの必須列
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-2">
                <p>双方向同期を行うには、シートに以下の列が必要です:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li><strong>hub_id</strong>: AA-HUBのドキュメントID（自動で書き込まれます）</li>
                  <li><strong>updated_at</strong>: 最終更新日時（競合判定に使用）</li>
                  <li><strong>sync_status</strong>: 同期状態（SYNCED, SYNCING, PENDING, ERROR）</li>
                </ul>
                <p className="mt-3 p-3 bg-yellow-50 rounded-lg">
                  <strong>重要:</strong> スプレッドシートをService Accountメール（{status?.serviceAccountEmail}）で共有し、編集権限を付与してください。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
