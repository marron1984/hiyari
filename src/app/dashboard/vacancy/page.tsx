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
import { Building2, Edit2, Save, X, RefreshCw, Clock, User, AlertTriangle, TrendingUp } from 'lucide-react';

// 稼働率を計算
function calcOccupancyRate(capacity: number | undefined, vacantCount: number): number {
  if (!capacity || capacity === 0) return 0;
  const occupied = capacity - vacantCount;
  return Math.round((occupied / capacity) * 100);
}

// 稼働率に応じた色を返す
function getOccupancyColor(rate: number): { bg: string; text: string; border: string } {
  if (rate >= 95) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
  if (rate >= 85) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  if (rate >= 70) return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' };
  return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
}

// 稼働率バー
function OccupancyBar({ rate }: { rate: number }) {
  const color = rate >= 95 ? 'bg-green-500' : rate >= 85 ? 'bg-blue-500' : rate >= 70 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${rate}%` }} />
    </div>
  );
}

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

  const canEdit = hasMinRole(user?.role, 'leader');

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
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

  const startEdit = (item: FacilityWithVacancy) => {
    setEditingId(item.facility.id);
    setEditValues({
      vacantCount: item.vacancy?.vacantCount ?? 0,
      note: item.vacancy?.note ?? '',
    });
    setError(null);
    setSuccess(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({ vacantCount: 0, note: '' });
  };

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

  const formatTime = (date: Date | undefined) => {
    if (!date) return '-';
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 集計
  const totalCapacity = facilities.reduce((sum, f) => sum + (f.facility.capacity || 0), 0);
  const totalVacant = facilities.reduce((sum, f) => sum + (f.vacancy?.vacantCount ?? 0), 0);
  const totalOccupied = totalCapacity - totalVacant;
  const totalOccupancyRate = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  // 低稼働施設（70%未満）
  const lowOccupancyFacilities = facilities.filter(f => {
    const rate = calcOccupancyRate(f.facility.capacity, f.vacancy?.vacantCount ?? 0);
    return rate < 70;
  });

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
                空室・稼働状況
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

          {/* サマリーカード */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card className={`p-4 ${getOccupancyColor(totalOccupancyRate).bg} border ${getOccupancyColor(totalOccupancyRate).border}`}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-600">全体稼働率</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-bold ${getOccupancyColor(totalOccupancyRate).text}`}>
                  {totalOccupancyRate}
                </span>
                <span className="text-gray-600">%</span>
              </div>
              <div className="mt-2">
                <OccupancyBar rate={totalOccupancyRate} />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                入居 {totalOccupied}名 / 定員 {totalCapacity}名
              </p>
            </Card>

            <Card className="p-4 bg-white border">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-600">空室合計</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-blue-600">{totalVacant}</span>
                <span className="text-gray-600">室</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                即入居可能な空室数
              </p>
            </Card>
          </div>

          {/* 低稼働アラート */}
          {lowOccupancyFacilities.length > 0 && (
            <Card className="p-4 mb-6 bg-red-50 border border-red-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">入居促進が必要な施設</p>
                  <p className="text-sm text-red-700 mt-1">
                    {lowOccupancyFacilities.map(f => f.facility.name).join('、')} の稼働率が70%を下回っています
                  </p>
                </div>
              </div>
            </Card>
          )}

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
                const vacantCount = item.vacancy?.vacantCount ?? 0;
                const occupancyRate = calcOccupancyRate(item.facility.capacity, vacantCount);
                const colors = getOccupancyColor(occupancyRate);

                return (
                  <Card key={item.facility.id} className={`overflow-hidden border ${colors.border}`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h2 className="text-lg font-semibold">{item.facility.name}</h2>
                            {item.facility.area && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                {item.facility.area}
                              </span>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-3 mt-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">空室数</label>
                                <input
                                  type="number"
                                  min="0"
                                  max={item.facility.capacity || 100}
                                  value={editValues.vacantCount}
                                  onChange={(e) => setEditValues({ ...editValues, vacantCount: parseInt(e.target.value) || 0 })}
                                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
                                <input
                                  type="text"
                                  value={editValues.note}
                                  onChange={(e) => setEditValues({ ...editValues, note: e.target.value })}
                                  placeholder="例: 来週1室空き予定"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button onClick={() => handleSave(item)} disabled={saving} className="flex items-center gap-1">
                                  <Save className="w-4 h-4" />
                                  {saving ? '保存中...' : '保存'}
                                </Button>
                                <Button variant="secondary" onClick={cancelEdit} disabled={saving} className="flex items-center gap-1">
                                  <X className="w-4 h-4" />
                                  キャンセル
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2">
                              {/* 稼働率 */}
                              <div className="flex items-center gap-4 mb-2">
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm text-gray-600">稼働率</span>
                                    <span className={`font-bold ${colors.text}`}>{occupancyRate}%</span>
                                  </div>
                                  <OccupancyBar rate={occupancyRate} />
                                </div>
                              </div>

                              {/* 空室・入居数 */}
                              <div className="flex items-center gap-6 text-sm">
                                <div>
                                  <span className="text-gray-500">空室</span>
                                  <span className="ml-2 text-xl font-bold text-blue-600">{vacantCount}</span>
                                  <span className="text-gray-500 ml-1">室</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">入居</span>
                                  <span className="ml-2 font-medium">{(item.facility.capacity || 0) - vacantCount}</span>
                                  <span className="text-gray-500 ml-1">/ {item.facility.capacity}名</span>
                                </div>
                              </div>

                              {item.vacancy?.note && (
                                <p className="text-sm text-gray-500 mt-2 bg-gray-50 px-2 py-1 rounded">
                                  {item.vacancy.note}
                                </p>
                              )}

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

                        {canEdit && !isEditing && (
                          <Button variant="secondary" onClick={() => startEdit(item)} className="flex items-center gap-1">
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
        </main>
      </div>
    </AuthGuard>
  );
}
