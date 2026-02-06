'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button, Card, Badge } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  Building2,
  RefreshCw,
  Plus,
  Minus,
  Edit2,
  History,
  ExternalLink,
  MapPin,
  Users,
  Calendar,
  DollarSign,
  Heart,
  X,
  Filter,
  Check,
  Pause,
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
  updatedByUserId: string;
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
  active: { label: '公開中', color: 'text-green-700', bg: 'bg-green-50', icon: Check },
  paused: { label: '一時停止', color: 'text-zinc-600', bg: 'bg-zinc-100', icon: Pause },
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

// ===== インライン編集コンポーネント =====

interface InlineCountEditorProps {
  value: number;
  onChange: (value: number) => Promise<void>;
  max?: number;
  disabled?: boolean;
}

function InlineCountEditor({ value, onChange, max, disabled }: InlineCountEditorProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const [saving, setSaving] = useState(false);

  const handleIncrement = async () => {
    if (saving || disabled) return;
    if (max !== undefined && value >= max) return;
    setSaving(true);
    try {
      await onChange(value + 1);
    } finally {
      setSaving(false);
    }
  };

  const handleDecrement = async () => {
    if (saving || disabled || value <= 0) return;
    setSaving(true);
    try {
      await onChange(value - 1);
    } finally {
      setSaving(false);
    }
  };

  const handleDirectInput = async () => {
    const newValue = parseInt(inputValue, 10);
    if (isNaN(newValue) || newValue < 0) {
      setInputValue(value.toString());
      setEditing(false);
      return;
    }
    if (max !== undefined && newValue > max) {
      setInputValue(value.toString());
      setEditing(false);
      return;
    }
    if (newValue !== value) {
      setSaving(true);
      try {
        await onChange(newValue);
      } finally {
        setSaving(false);
      }
    }
    setEditing(false);
  };

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleDecrement}
        disabled={saving || disabled || value <= 0}
        className="w-7 h-7 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Minus className="w-4 h-4" />
      </button>
      {editing ? (
        <input
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleDirectInput}
          onKeyDown={(e) => e.key === 'Enter' && handleDirectInput()}
          className="w-12 h-7 text-center border rounded text-sm"
          autoFocus
          min={0}
          max={max}
        />
      ) : (
        <button
          onClick={() => !disabled && setEditing(true)}
          disabled={disabled}
          className="w-12 h-7 text-center font-bold text-lg hover:bg-gray-50 rounded disabled:cursor-not-allowed"
        >
          {saving ? '...' : value}
        </button>
      )}
      <button
        onClick={handleIncrement}
        disabled={saving || disabled || (max !== undefined && value >= max)}
        className="w-7 h-7 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

// ===== インラインステータストグル =====

interface InlineStatusToggleProps {
  value: 'active' | 'paused';
  onChange: (value: 'active' | 'paused') => Promise<void>;
  disabled?: boolean;
}

function InlineStatusToggle({ value, onChange, disabled }: InlineStatusToggleProps) {
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    if (saving || disabled) return;
    setSaving(true);
    try {
      await onChange(value === 'active' ? 'paused' : 'active');
    } finally {
      setSaving(false);
    }
  };

  const config = STATUS_CONFIG[value];

  return (
    <button
      onClick={handleToggle}
      disabled={saving || disabled}
      className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 transition-colors ${config.bg} ${config.color} hover:opacity-80 disabled:cursor-not-allowed`}
    >
      {saving ? (
        <RefreshCw className="w-3 h-3 animate-spin" />
      ) : (
        <config.icon className="w-3 h-3" />
      )}
      {config.label}
    </button>
  );
}

// ===== インライン日付編集 =====

interface InlineDateEditorProps {
  value: string | null;
  onChange: (value: string | null) => Promise<void>;
  disabled?: boolean;
}

function InlineDateEditor({ value, onChange, disabled }: InlineDateEditorProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value?.split('T')[0] || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    const newValue = inputValue || null;
    if (newValue !== value?.split('T')[0] && newValue !== (value === null ? null : value)) {
      setSaving(true);
      try {
        await onChange(newValue);
      } finally {
        setSaving(false);
      }
    }
    setEditing(false);
  };

  useEffect(() => {
    setInputValue(value?.split('T')[0] || '');
  }, [value]);

  if (editing) {
    return (
      <input
        type="date"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        className="w-32 px-2 py-1 border rounded text-sm"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={() => !disabled && setEditing(true)}
      disabled={disabled}
      className="text-sm text-gray-600 hover:text-gray-900 hover:underline disabled:cursor-not-allowed flex items-center gap-1"
    >
      <Calendar className="w-4 h-4" />
      {saving ? '...' : formatDate(value)}
    </button>
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
      fetch(`/api/vacancy-units/${unit.id}/history?limit=20`)
        .then((res) => res.json())
        .then((data) => setUpdates(data.updates || []))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [isOpen, unit]);

  if (!isOpen || !unit) return null;

  const formatChangeValue = (value: unknown): string => {
    if (value === null || value === undefined) return '未設定';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const fieldLabels: Record<string, string> = {
    availableCount: '空室数',
    availableFrom: '入居可能日',
    status: 'ステータス',
    buildingName: '施設名',
    area: 'エリア',
    roomType: '部屋タイプ',
    capacity: '定員',
    created: '作成',
  };

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
                  <div className="space-y-1 text-gray-600">
                    {Object.entries(update.changedFieldsJson).map(([field, change]) => (
                      <div key={field} className="flex items-center gap-2">
                        <span className="font-medium text-gray-700">{fieldLabels[field] || field}:</span>
                        <span className="text-red-600 line-through">{formatChangeValue(change.before)}</span>
                        <span>→</span>
                        <span className="text-green-600">{formatChangeValue(change.after)}</span>
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

// ===== フィルターパネル =====

interface FiltersProps {
  businessUnitId: string;
  status: string;
  roomType: string;
  onBusinessUnitChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRoomTypeChange: (value: string) => void;
  businessUnits: string[];
  roomTypes: string[];
}

function FiltersPanel({
  businessUnitId,
  status,
  roomType,
  onBusinessUnitChange,
  onStatusChange,
  onRoomTypeChange,
  businessUnits,
  roomTypes,
}: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 rounded-lg mb-4">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-600">フィルタ:</span>
      </div>

      <select
        value={businessUnitId}
        onChange={(e) => onBusinessUnitChange(e.target.value)}
        className="text-sm border rounded px-2 py-1"
      >
        <option value="">全事業所</option>
        {businessUnits.map((bu) => (
          <option key={bu} value={bu}>{bu}</option>
        ))}
      </select>

      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
        className="text-sm border rounded px-2 py-1"
      >
        <option value="">全ステータス</option>
        <option value="active">公開中</option>
        <option value="paused">一時停止</option>
      </select>

      <select
        value={roomType}
        onChange={(e) => onRoomTypeChange(e.target.value)}
        className="text-sm border rounded px-2 py-1"
      >
        <option value="">全部屋タイプ</option>
        {roomTypes.map((rt) => (
          <option key={rt} value={rt}>{rt}</option>
        ))}
      </select>
    </div>
  );
}

// ===== メインコンポーネント =====

export default function VacanciesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [units, setUnits] = useState<VacancyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyUnit, setHistoryUnit] = useState<VacancyUnit | null>(null);

  // フィルター状態
  const [filterBusinessUnit, setFilterBusinessUnit] = useState(searchParams.get('businessUnitId') || '');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  const [filterRoomType, setFilterRoomType] = useState(searchParams.get('roomType') || '');

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (filterBusinessUnit) params.set('businessUnitId', filterBusinessUnit);
      if (filterStatus) params.set('status', filterStatus);
      if (filterRoomType) params.set('roomType', filterRoomType);

      const res = await fetch(`/api/vacancy-units?${params.toString()}`);
      const data = await res.json();
      setUnits(data.items || []);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterBusinessUnit, filterStatus, filterRoomType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // フィルター変更時にURLを更新
  useEffect(() => {
    const params = new URLSearchParams();
    if (filterBusinessUnit) params.set('businessUnitId', filterBusinessUnit);
    if (filterStatus) params.set('status', filterStatus);
    if (filterRoomType) params.set('roomType', filterRoomType);
    const query = params.toString();
    router.replace(query ? `?${query}` : '/dashboard/vacancies', { scroll: false });
  }, [filterBusinessUnit, filterStatus, filterRoomType, router]);

  // インライン更新用のPATCH関数
  const patchUnit = useCallback(async (id: string, data: Partial<VacancyUnit>) => {
    const res = await fetch(`/api/vacancy-units/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || '更新に失敗しました');
    }

    const result = await res.json();
    // ローカル状態を更新
    setUnits((prev) => prev.map((u) => (u.id === id ? result.unit : u)));
    return result.unit;
  }, []);

  if (loading) {
    return <Loading text="読み込み中..." />;
  }

  // フィルター用のユニークな値を抽出
  const allBusinessUnits = [...new Set(units.map((u) => u.businessUnitId))];
  const allRoomTypes = [...new Set(units.map((u) => u.roomType))];

  const activeUnits = units.filter((u) => u.status === 'active');
  const totalAvailable = units.reduce((sum, u) => sum + u.availableCount, 0);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            空室管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            空室情報をリアルタイムで更新できます
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

      {/* フィルター */}
      <FiltersPanel
        businessUnitId={filterBusinessUnit}
        status={filterStatus}
        roomType={filterRoomType}
        onBusinessUnitChange={setFilterBusinessUnit}
        onStatusChange={setFilterStatus}
        onRoomTypeChange={setFilterRoomType}
        businessUnits={allBusinessUnits}
        roomTypes={allRoomTypes}
      />

      {/* 施設一覧テーブル */}
      {units.length === 0 ? (
        <Card className="p-8 text-center">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">空室情報がありません</p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">施設名</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">エリア</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">部屋タイプ</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">空室数</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">入居可能日</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">ステータス</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">最終更新</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{unit.buildingName}</div>
                    <div className="text-xs text-gray-500">{unit.businessUnitId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <MapPin className="w-4 h-4" />
                      {unit.area}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{unit.roomType}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <InlineCountEditor
                        value={unit.availableCount}
                        max={unit.capacity}
                        onChange={async (value) => {
                          await patchUnit(unit.id, { availableCount: value });
                        }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 text-center mt-1">
                      / {unit.capacity}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <InlineDateEditor
                      value={unit.availableFrom}
                      onChange={async (value) => {
                        await patchUnit(unit.id, { availableFrom: value });
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <InlineStatusToggle
                        value={unit.status}
                        onChange={async (value) => {
                          await patchUnit(unit.id, { status: value });
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-500">
                      {formatDateTime(unit.updatedAt)}
                    </div>
                    <div className="text-xs text-gray-400">
                      {unit.updatedByUserName || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <Button
                        variant="secondary"
                        className="flex items-center gap-1 text-xs px-2 py-1"
                        onClick={() => setHistoryUnit(unit)}
                      >
                        <History className="w-3 h-3" />
                        履歴
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 履歴モーダル */}
      <HistoryModal
        unit={historyUnit}
        isOpen={!!historyUnit}
        onClose={() => setHistoryUnit(null)}
      />
    </main>
  );
}
