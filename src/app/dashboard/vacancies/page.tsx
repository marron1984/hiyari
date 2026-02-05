'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Badge } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  Building2,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  History,
  Eye,
  ExternalLink,
  MapPin,
  Users,
  Calendar,
  DollarSign,
  Heart,
  X,
} from 'lucide-react';
import Link from 'next/link';

// ===== 型定義 =====

interface CareConditions {
  minCareLevel?: number | null;
  maxCareLevel?: number | null;
  acceptsDementia?: boolean;
  acceptsMedicalCare?: boolean;
  acceptsTerminalCare?: boolean;
  note?: string;
}

interface PriceRange {
  monthlyMin?: number | null;
  monthlyMax?: number | null;
  depositMin?: number | null;
  depositMax?: number | null;
  note?: string;
}

interface VacancyUnit {
  id: string;
  businessUnitId: string;
  buildingName: string;
  area: string;
  roomType: string;
  capacity: number;
  availableCount: number;
  availableFrom: string | null;
  conditionsJson: CareConditions;
  priceRangeJson: PriceRange;
  status: 'active' | 'paused';
  updatedAt: string;
  updatedByUserName?: string;
}

interface VacancyUpdate {
  id: string;
  vacancyUnitId: string;
  changedFieldsJson: Record<string, { before: unknown; after: unknown }>;
  createdAt: string;
  createdByUserName?: string;
}

// ===== ステータス設定 =====

const STATUS_CONFIG = {
  active: { label: '公開中', color: 'text-green-700', bg: 'bg-green-50' },
  paused: { label: '一時停止', color: 'text-zinc-600', bg: 'bg-zinc-100' },
};

const CARE_LEVEL_LABELS: Record<number, string> = {
  1: '要介護1',
  2: '要介護2',
  3: '要介護3',
  4: '要介護4',
  5: '要介護5',
};

// ===== ユーティリティ =====

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ja-JP');
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(min: number | null | undefined, max: number | null | undefined): string {
  if (min == null && max == null) return '-';
  if (min != null && max != null) return `${min}〜${max}万円`;
  if (min != null) return `${min}万円〜`;
  if (max != null) return `〜${max}万円`;
  return '-';
}

// ===== 編集モーダル =====

interface EditModalProps {
  unit: VacancyUnit | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<VacancyUnit>) => Promise<void>;
}

function EditModal({ unit, isOpen, onClose, onSave }: EditModalProps) {
  const [availableCount, setAvailableCount] = useState(0);
  const [availableFrom, setAvailableFrom] = useState('');
  const [status, setStatus] = useState<'active' | 'paused'>('active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (unit) {
      setAvailableCount(unit.availableCount);
      setAvailableFrom(unit.availableFrom?.split('T')[0] || '');
      setStatus(unit.status);
    }
  }, [unit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unit) return;

    setError(null);
    setSaving(true);

    try {
      await onSave(unit.id, {
        availableCount,
        availableFrom: availableFrom || null,
        status,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !unit) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Edit2 className="w-5 h-5" />
            {unit.buildingName} を編集
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              空室数
            </label>
            <input
              type="number"
              min="0"
              value={availableCount}
              onChange={(e) => setAvailableCount(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              入居可能日
            </label>
            <input
              type="date"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              公開ステータス
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'paused')}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="active">公開中</option>
              <option value="paused">一時停止</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
              disabled={saving}
            >
              キャンセル
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===== 履歴モーダル =====

interface HistoryModalProps {
  unit: VacancyUnit | null;
  isOpen: boolean;
  onClose: () => void;
}

function HistoryModal({ unit, isOpen, onClose }: HistoryModalProps) {
  const [updates, setUpdates] = useState<VacancyUpdate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && unit) {
      setLoading(true);
      fetch(`/api/vacancy-units/${unit.id}/history`)
        .then((res) => res.json())
        .then((data) => setUpdates(data.updates || []))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, unit]);

  if (!isOpen || !unit) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5" />
            {unit.buildingName} の更新履歴
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">読み込み中...</div>
          ) : updates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">履歴がありません</div>
          ) : (
            <div className="space-y-3">
              {updates.map((update) => (
                <div key={update.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{update.createdByUserName || '不明'}</span>
                    <span className="text-gray-500">{formatDateTime(update.createdAt)}</span>
                  </div>
                  <div className="text-gray-600">
                    {Object.entries(update.changedFieldsJson).map(([field, change]) => (
                      <div key={field}>
                        {field}: {String(change.before)} → {String(change.after)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== メインコンポーネント =====

export default function VacanciesPage() {
  const [units, setUnits] = useState<VacancyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [editUnit, setEditUnit] = useState<VacancyUnit | null>(null);
  const [historyUnit, setHistoryUnit] = useState<VacancyUnit | null>(null);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/vacancy-units');
      const data = await res.json();
      setUnits(data.items || []);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (id: string, data: Partial<VacancyUnit>) => {
    const res = await fetch(`/api/vacancy-units/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || '保存に失敗しました');
    }

    await fetchData();
  };

  if (loading) {
    return <Loading text="読み込み中..." />;
  }

  const activeUnits = units.filter((u) => u.status === 'active');
  const totalAvailable = units.reduce((sum, u) => sum + u.availableCount, 0);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            空室外部公開管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            外部向け空室情報を管理します
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/vacancies" target="_blank">
            <Button variant="secondary" className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              公開ページ
            </Button>
          </Link>
          <Button
            variant="secondary"
            onClick={fetchData}
            disabled={refreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            更新
          </Button>
        </div>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="text-2xl font-bold text-blue-600">{units.length}</div>
          <div className="text-sm text-gray-600">登録施設</div>
        </Card>
        <Card className="p-4 bg-green-50 border-green-200">
          <div className="text-2xl font-bold text-green-600">{activeUnits.length}</div>
          <div className="text-sm text-gray-600">公開中</div>
        </Card>
        <Card className="p-4 bg-purple-50 border-purple-200">
          <div className="text-2xl font-bold text-purple-600">{totalAvailable}</div>
          <div className="text-sm text-gray-600">総空室数</div>
        </Card>
      </div>

      {/* 施設一覧 */}
      {units.length === 0 ? (
        <Card className="p-8 text-center">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">空室情報が登録されていません</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {units.map((unit) => {
            const statusConfig = STATUS_CONFIG[unit.status];
            return (
              <Card key={unit.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-lg">{unit.buildingName}</h3>
                      <Badge className={`${statusConfig.bg} ${statusConfig.color}`}>
                        {statusConfig.label}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPin className="w-4 h-4" />
                        {unit.area}
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Users className="w-4 h-4" />
                        空室 {unit.availableCount} / {unit.capacity}
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="w-4 h-4" />
                        {formatDate(unit.availableFrom)}〜
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <DollarSign className="w-4 h-4" />
                        {formatPrice(unit.priceRangeJson?.monthlyMin, unit.priceRangeJson?.monthlyMax)}
                      </div>
                    </div>

                    {unit.conditionsJson && (
                      <div className="flex items-center gap-2 mt-2 text-sm">
                        <Heart className="w-4 h-4 text-pink-500" />
                        {unit.conditionsJson.minCareLevel && unit.conditionsJson.maxCareLevel ? (
                          <span>
                            {CARE_LEVEL_LABELS[unit.conditionsJson.minCareLevel]}〜
                            {CARE_LEVEL_LABELS[unit.conditionsJson.maxCareLevel]}
                          </span>
                        ) : (
                          <span>条件なし</span>
                        )}
                        {unit.conditionsJson.acceptsDementia && (
                          <Badge className="bg-purple-100 text-purple-700 text-xs">認知症可</Badge>
                        )}
                        {unit.conditionsJson.acceptsMedicalCare && (
                          <Badge className="bg-blue-100 text-blue-700 text-xs">医療対応</Badge>
                        )}
                        {unit.conditionsJson.acceptsTerminalCare && (
                          <Badge className="bg-pink-100 text-pink-700 text-xs">看取り可</Badge>
                        )}
                      </div>
                    )}

                    <div className="text-xs text-gray-400 mt-2">
                      最終更新: {formatDateTime(unit.updatedAt)}
                      {unit.updatedByUserName && ` by ${unit.updatedByUserName}`}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      variant="secondary"
                      className="flex items-center gap-1 text-sm"
                      onClick={() => setEditUnit(unit)}
                    >
                      <Edit2 className="w-4 h-4" />
                      編集
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex items-center gap-1 text-sm"
                      onClick={() => setHistoryUnit(unit)}
                    >
                      <History className="w-4 h-4" />
                      履歴
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 編集モーダル */}
      <EditModal
        unit={editUnit}
        isOpen={!!editUnit}
        onClose={() => setEditUnit(null)}
        onSave={handleSave}
      />

      {/* 履歴モーダル */}
      <HistoryModal
        unit={historyUnit}
        isOpen={!!historyUnit}
        onClose={() => setHistoryUnit(null)}
      />
    </main>
  );
}
