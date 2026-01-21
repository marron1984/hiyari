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
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Settings,
  Clock,
  Database,
  Home,
  Users,
} from 'lucide-react';

interface SyncResult {
  success: boolean;
  synced: number;
  skipped: number;
  errors: string[];
}

interface SyncStatus {
  residents: SyncResult;
  vacancies: SyncResult;
  syncedAt: string;
}

export default function SyncAdminPage() {
  return (
    <AuthGuard>
      <SyncAdminContent />
    </AuthGuard>
  );
}

function SyncAdminContent() {
  const { user, firebaseUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncStatus | null>(null);
  const [gidConfig, setGidConfig] = useState({
    residents: '',
    vacancies: '',
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const canAccess = hasMinRole(user?.role, 'admin');

  const handleSync = async () => {
    if (!firebaseUser) return;

    setSyncing(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/cron/sync-sheets', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setLastSyncResult(data);
      } else {
        const error = await res.json();
        alert(error.error || '同期に失敗しました');
      }
    } catch (error) {
      console.error('Sync failed:', error);
      alert('同期に失敗しました');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!firebaseUser) return;

    setSavingConfig(true);
    try {
      const token = await firebaseUser.getIdToken();
      const body: Record<string, number> = {};

      if (gidConfig.residents) {
        body.residents = parseInt(gidConfig.residents, 10);
      }
      if (gidConfig.vacancies) {
        body.vacancies = parseInt(gidConfig.vacancies, 10);
      }

      const res = await fetch('/api/cron/sync-sheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        alert('設定を保存しました');
      } else {
        const error = await res.json();
        alert(error.error || '保存に失敗しました');
      }
    } catch (error) {
      console.error('Save config failed:', error);
      alert('保存に失敗しました');
    } finally {
      setSavingConfig(false);
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

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <RefreshCw className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Google Sheets同期</h1>
                <p className="text-sm text-gray-500">入居者・空室情報の自動同期</p>
              </div>
            </div>
          </div>

          {/* 同期ステータス */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                同期ステータス
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">自動同期</p>
                    <p className="font-medium">毎時0分に実行（Vercel Cron）</p>
                  </div>
                  <Button onClick={handleSync} disabled={syncing}>
                    {syncing ? (
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-1" />
                    )}
                    今すぐ同期
                  </Button>
                </div>

                {lastSyncResult && (
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm text-gray-500">
                      最終同期: {new Date(lastSyncResult.syncedAt).toLocaleString('ja-JP')}
                    </p>

                    {/* 入居者同期結果 */}
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Users className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium">入居者情報</p>
                        <div className="flex gap-4 text-sm mt-1">
                          <span className="text-green-600">
                            同期: {lastSyncResult.residents.synced}件
                          </span>
                          <span className="text-gray-500">
                            スキップ: {lastSyncResult.residents.skipped}件
                          </span>
                          {lastSyncResult.residents.errors.length > 0 && (
                            <span className="text-red-600">
                              エラー: {lastSyncResult.residents.errors.length}件
                            </span>
                          )}
                        </div>
                      </div>
                      {lastSyncResult.residents.success ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>

                    {/* 空室同期結果 */}
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Home className="w-5 h-5 text-purple-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium">空室情報</p>
                        <div className="flex gap-4 text-sm mt-1">
                          <span className="text-green-600">
                            同期: {lastSyncResult.vacancies.synced}件
                          </span>
                          <span className="text-gray-500">
                            スキップ: {lastSyncResult.vacancies.skipped}件
                          </span>
                          {lastSyncResult.vacancies.errors.length > 0 && (
                            <span className="text-red-600">
                              エラー: {lastSyncResult.vacancies.errors.length}件
                            </span>
                          )}
                        </div>
                      </div>
                      {lastSyncResult.vacancies.success ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* シート設定 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="w-5 h-5" />
                シート設定
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  同期対象のシートを設定します。各シートのURLにある<code className="bg-gray-100 px-1 rounded">gid=XXX</code>の数値を入力してください。
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    入居者情報シートのgid
                  </label>
                  <Input
                    type="number"
                    value={gidConfig.residents}
                    onChange={(e) => setGidConfig({ ...gidConfig, residents: e.target.value })}
                    placeholder="例: 123456789"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    空室情報シートのgid
                  </label>
                  <Input
                    type="number"
                    value={gidConfig.vacancies}
                    onChange={(e) => setGidConfig({ ...gidConfig, vacancies: e.target.value })}
                    placeholder="例: 987654321"
                  />
                </div>

                <Button onClick={handleSaveConfig} disabled={savingConfig}>
                  {savingConfig ? (
                    <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Database className="w-4 h-4 mr-1" />
                  )}
                  設定を保存
                </Button>

                <div className="text-xs text-gray-500 mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium mb-1">シートの列構造（推奨）</p>
                  <p><strong>入居者情報:</strong> 氏名, 年齢, 性別, 介護度, 施設名, 部屋番号, 入居日, ステータス</p>
                  <p><strong>空室情報:</strong> 施設名, 空室数, 総部屋数, 備考, エリア</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
