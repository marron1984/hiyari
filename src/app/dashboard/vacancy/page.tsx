'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getFacilitiesWithVacancy,
  updateVacancyStatus,
  seedFacilitiesIfEmpty,
} from '@/lib/vacancy';
import { FacilityWithVacancy } from '@/types/vacancy';
import { hasMinRole } from '@/lib/auth';
import { Building2, Edit2, Save, X, RefreshCw, Clock, User } from 'lucide-react';

export default function VacancyPage() {
  const { user } = useAuth();
  const [facilities, setFacilities] = useState<FacilityWithVacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ vacantCount: number; note: string }>({
    vacantCount: 0,
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // editor以上（leader以上）のみ編集可能
  const canEdit = hasMinRole(user?.role, 'leader');

  // データ取得
  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      // 施設がなければシードデータを作成
      await seedFacilitiesIfEmpty(user.tenantId);
      const data = await getFacilitiesWithVacancy(user.tenantId);
      setFacilities(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch facilities:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 編集開始
  const startEdit = (item: FacilityWithVacancy) => {
    setEditingId(item.facility.id);
    setEditValues({
      vacantCount: item.vacancy?.vacantCount ?? 0,
      note: item.vacancy?.note ?? '',
    });
    setError(null);
    setSuccess(null);
  };

  // 編集キャンセル
  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({ vacantCount: 0, note: '' });
  };

  // 保存
  const handleSave = async (item: FacilityWithVacancy) => {
    if (!user) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateVacancyStatus({
        facilityId: item.facility.id,
        vacantCount: editValues.vacantCount,
        note: editValues.note || undefined,
        updatedBy: user.id,
        updatedByName: user.name,
        lastKnownUpdatedAt: item.vacancy?.updatedAt,
      });

      setSuccess(`${item.facility.name}の空室情報を更新しました`);
      setEditingId(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 時間フォーマット
  const formatTime = (date: Date | undefined) => {
    if (!date) return '-';
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Building2 className="w-6 h-6" />
                空室状況
              </h1>
              {lastUpdated && (
                <p className="text-sm text-gray-500 mt-1">
                  最終取得: {formatTime(lastUpdated)}
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setLoading(true);
                fetchData();
              }}
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              更新
            </Button>
          </div>

          {/* メッセージ */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
              {success}
            </div>
          )}

          {/* 権限メッセージ */}
          {!canEdit && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg mb-4">
              閲覧のみ可能です。編集にはリーダー以上の権限が必要です。
            </div>
          )}

          {/* 施設一覧 */}
          <div className="space-y-4">
            {facilities.length === 0 ? (
              <Card className="p-8 text-center text-gray-500">
                施設が登録されていません
              </Card>
            ) : (
              facilities.map((item) => {
                const isEditing = editingId === item.facility.id;

                return (
                  <Card key={item.facility.id} className="overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* 施設情報 */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h2 className="text-lg font-semibold">
                              {item.facility.name}
                            </h2>
                            {item.facility.area && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                {item.facility.area}
                              </span>
                            )}
                            {item.facility.capacity && (
                              <span className="text-sm text-gray-500">
                                定員 {item.facility.capacity}名
                              </span>
                            )}
                          </div>

                          {isEditing ? (
                            /* 編集モード */
                            <div className="space-y-3 mt-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  空室数
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editValues.vacantCount}
                                  onChange={(e) =>
                                    setEditValues({
                                      ...editValues,
                                      vacantCount: parseInt(e.target.value) || 0,
                                    })
                                  }
                                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  メモ
                                </label>
                                <input
                                  type="text"
                                  value={editValues.note}
                                  onChange={(e) =>
                                    setEditValues({
                                      ...editValues,
                                      note: e.target.value,
                                    })
                                  }
                                  placeholder="例: 来週1室空き予定"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => handleSave(item)}
                                  disabled={saving}
                                  className="flex items-center gap-1"
                                >
                                  <Save className="w-4 h-4" />
                                  {saving ? '保存中...' : '保存'}
                                </Button>
                                <Button
                                  variant="secondary"
                                  onClick={cancelEdit}
                                  disabled={saving}
                                  className="flex items-center gap-1"
                                >
                                  <X className="w-4 h-4" />
                                  キャンセル
                                </Button>
                              </div>
                            </div>
                          ) : (
                            /* 表示モード */
                            <div className="mt-2">
                              <div className="flex items-baseline gap-4">
                                <div>
                                  <span className="text-3xl font-bold text-blue-600">
                                    {item.vacancy?.vacantCount ?? 0}
                                  </span>
                                  <span className="text-gray-600 ml-1">室</span>
                                </div>
                                {item.vacancy?.note && (
                                  <span className="text-gray-500 text-sm">
                                    {item.vacancy.note}
                                  </span>
                                )}
                              </div>

                              {/* 更新情報 */}
                              {item.vacancy && (
                                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatTime(item.vacancy.updatedAt)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {item.vacancy.updatedByName || '不明'}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 編集ボタン */}
                        {canEdit && !isEditing && (
                          <Button
                            variant="secondary"
                            onClick={() => startEdit(item)}
                            className="flex items-center gap-1"
                          >
                            <Edit2 className="w-4 h-4" />
                            編集
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>

          {/* 合計 */}
          {facilities.length > 0 && (
            <Card className="mt-6 p-4 bg-blue-50">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">全施設合計</span>
                <div>
                  <span className="text-2xl font-bold text-blue-600">
                    {facilities.reduce(
                      (sum, f) => sum + (f.vacancy?.vacantCount ?? 0),
                      0
                    )}
                  </span>
                  <span className="text-gray-600 ml-1">室</span>
                </div>
              </div>
            </Card>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
