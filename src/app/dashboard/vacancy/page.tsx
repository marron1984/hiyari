'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card, Badge } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { hasMinRole } from '@/lib/auth';
import {
  Building2,
  RefreshCw,
  Clock,
  AlertTriangle,
  TrendingUp,
  Lock,
  Home,
  Wrench,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Filter,
  Plus,
  X,
  Users,
  DoorOpen,
} from 'lucide-react';
import Link from 'next/link';

// ===== 型定義 =====

interface FacilityMetrics {
  id: string;
  name: string;
  area: string;
  capacity: number;
  available: number;
  locked: number;
  occupied: number;
  maintenance: number;
  unknown: number;
  occupancyRate: number | null;
  vacancyRate: number | null;
  lastUpdated: string | null;
  lastUpdatedBy: string | null;
}

interface LockedRoom {
  id: string;
  buildingName: string;
  roomNumber: string;
  lockedCaseId: string | null;
  lockedByName: string | null;
  lockedAt: string | null;
}

interface Warning {
  label: string;
  code: string;
  message: string;
}

interface VacancyMetrics {
  success: boolean;
  summary: {
    totalRooms: number;
    available: number;
    locked: number;
    occupied: number;
    maintenance: number;
    unknown: number;
    occupancyRate: number | null;
    vacancyRate: number | null;
  };
  facilities: FacilityMetrics[];
  lockedRooms: LockedRoom[];
  updatedAt: string;
  warnings: Warning[];
  debug?: {
    roomsQueried: number;
    facilitiesQueried: number;
    unknownStatuses: string[];
    rawStatusCounts: Record<string, number>;
  };
}

// 部屋データ型
interface RoomData {
  id: string;
  buildingName: string;
  roomNumber: string;
  capacity: number;
  status: string;
  note: string | null;
  lockedCaseId: string | null;
  lockedByName: string | null;
  lockedAt: string | null;
  occupantId: string | null;
  occupantName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// ===== フィルタタイプ =====
type StatusFilter = 'all' | 'available' | 'locked' | 'occupied' | 'maintenance' | 'lowOccupancy';
type ViewMode = 'summary' | 'rooms';

// ===== ステータス設定 =====
const ROOM_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  '空室': { label: '空室', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: <Home className="w-3 h-3" /> },
  '予約': { label: 'ロック', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: <Lock className="w-3 h-3" /> },
  '入居中': { label: '入居中', color: 'text-green-700', bgColor: 'bg-green-100', icon: <Users className="w-3 h-3" /> },
  '退去予定': { label: '退去予定', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: <DoorOpen className="w-3 h-3" /> },
  'メンテナンス': { label: '修繕中', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: <Wrench className="w-3 h-3" /> },
};

// 状態変更の選択肢
const STATUS_TRANSITIONS: Record<string, { value: string; label: string }[]> = {
  '空室': [
    { value: 'メンテナンス', label: '修繕中にする' },
    { value: '入居中', label: '入居中にする' },
  ],
  'メンテナンス': [
    { value: '空室', label: '空室にする' },
  ],
  '入居中': [
    { value: '退去予定', label: '退去予定にする' },
    { value: '空室', label: '退去（空室にする）' },
  ],
  '退去予定': [
    { value: '空室', label: '退去完了（空室にする）' },
    { value: '入居中', label: '入居継続' },
  ],
  '予約': [], // 手動変更不可
};

// ===== ユーティリティ =====

function displayRate(rate: number | null): string {
  if (rate === null || rate === undefined) return '--';
  return `${rate}%`;
}

function displayCount(count: number | null): string {
  if (count === null || count === undefined) return '--';
  return count.toString();
}

function getOccupancyColor(rate: number | null): { bg: string; text: string; border: string } {
  if (rate === null) return { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' };
  if (rate >= 95) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
  if (rate >= 85) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  if (rate >= 70) return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' };
  return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
}

function OccupancyBar({ rate }: { rate: number | null }) {
  if (rate === null) {
    return (
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-gray-300 w-0" />
      </div>
    );
  }
  const color = rate >= 95 ? 'bg-green-500' : rate >= 85 ? 'bg-blue-500' : rate >= 70 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${rate}%` }} />
    </div>
  );
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ===== 部屋追加モーダル =====

interface AddRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { buildingName: string; roomNumber: string; capacity: number }) => Promise<void>;
  buildings: string[];
}

function AddRoomModal({ isOpen, onClose, onSubmit, buildings }: AddRoomModalProps) {
  const [buildingName, setBuildingName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit({ buildingName, roomNumber, capacity });
      setBuildingName('');
      setRoomNumber('');
      setCapacity(1);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="w-5 h-5" />
            部屋を追加
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
              建物 <span className="text-red-500">*</span>
            </label>
            <select
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              required
            >
              <option value="">選択してください</option>
              {buildings.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
              <option value="__other__">その他（新規建物）</option>
            </select>
            {buildingName === '__other__' && (
              <input
                type="text"
                placeholder="建物名を入力"
                className="w-full border rounded-lg px-3 py-2 mt-2"
                onChange={(e) => setBuildingName(e.target.value)}
                required
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              部屋番号 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="例: 101, 2F-A"
              className="w-full border rounded-lg px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              定員
            </label>
            <select
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value={1}>1人</option>
              <option value={2}>2人</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={submitting || !buildingName || !roomNumber}
            >
              {submitting ? '追加中...' : '追加'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===== 状態変更ドロップダウン =====

interface StatusChangeDropdownProps {
  room: RoomData;
  onStatusChange: (roomId: string, newStatus: string) => Promise<void>;
  disabled?: boolean;
}

function StatusChangeDropdown({ room, onStatusChange, disabled }: StatusChangeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const transitions = STATUS_TRANSITIONS[room.status] || [];
  const statusConfig = ROOM_STATUS_CONFIG[room.status] || {
    label: room.status,
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: null,
  };

  // 外部クリックで閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = async (newStatus: string) => {
    setChanging(true);
    try {
      await onStatusChange(room.id, newStatus);
    } finally {
      setChanging(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => transitions.length > 0 && !disabled && setIsOpen(!isOpen)}
        disabled={disabled || transitions.length === 0 || changing}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color} ${
          transitions.length > 0 && !disabled ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
        }`}
      >
        {statusConfig.icon}
        {statusConfig.label}
        {transitions.length > 0 && !disabled && (
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {isOpen && transitions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[160px]">
          {transitions.map((t) => (
            <button
              key={t.value}
              onClick={() => handleChange(t.value)}
              disabled={changing}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== メインコンポーネント =====

export default function VacancyPage() {
  const { user, firebaseUser } = useAuth();
  const [metrics, setMetrics] = useState<VacancyMetrics | null>(null);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 表示モード
  const [viewMode, setViewMode] = useState<ViewMode>('summary');

  // フィルタ
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const [showLockedRooms, setShowLockedRooms] = useState(true);

  // モーダル
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);

  // デバッグモード
  const [debugMode, setDebugMode] = useState(false);

  // 自動更新タイマー
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const AUTO_REFRESH_INTERVAL = 60000;

  const isAdmin = hasMinRole(user?.role, 'admin');
  const isLeader = hasMinRole(user?.role, 'leader');

  // 建物リスト
  const buildings = Array.from(new Set(rooms.map((r) => r.buildingName))).sort((a, b) =>
    a.localeCompare(b, 'ja')
  );

  // APIからデータ取得
  const fetchData = useCallback(async (showLoadingState = true) => {
    if (!firebaseUser) return;

    if (showLoadingState) {
      setRefreshing(true);
    }
    setError(null);

    try {
      const token = await firebaseUser.getIdToken();

      // メトリクスと部屋一覧を並列取得
      const [metricsRes, roomsRes] = await Promise.all([
        fetch(debugMode ? '/api/vacancy/metrics?debug=1' : '/api/vacancy/metrics', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch('/api/rooms', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ]);

      if (!metricsRes.ok) {
        const errorData = await metricsRes.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${metricsRes.status}`);
      }

      const metricsData: VacancyMetrics = await metricsRes.json();
      if (!metricsData.success) {
        throw new Error('メトリクス取得に失敗しました');
      }
      setMetrics(metricsData);

      if (roomsRes.ok) {
        const roomsData = await roomsRes.json();
        if (roomsData.success) {
          setRooms(roomsData.rooms || []);
        }
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Data fetch error:', err);
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser, debugMode]);

  // 初回ロード & デバッグモード変更時
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 自動更新
  useEffect(() => {
    timerRef.current = setInterval(() => {
      fetchData(false);
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [fetchData]);

  // URLパラメータからデバッグモード検出
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debug') === '1' && isAdmin) {
        setDebugMode(true);
      }
    }
  }, [isAdmin]);

  // 手動更新
  const handleRefresh = () => {
    fetchData(true);
  };

  // 部屋追加
  const handleAddRoom = async (data: { buildingName: string; roomNumber: string; capacity: number }) => {
    if (!firebaseUser) throw new Error('認証が必要です');

    const token = await firebaseUser.getIdToken();
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || '追加に失敗しました');
    }

    // データを再取得
    await fetchData(false);
  };

  // 状態変更
  const handleStatusChange = async (roomId: string, newStatus: string) => {
    if (!firebaseUser) throw new Error('認証が必要です');

    const token = await firebaseUser.getIdToken();
    const res = await fetch(`/api/rooms/${roomId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || '状態変更に失敗しました');
    }

    // データを再取得
    await fetchData(false);
  };

  // フィルタされた施設リスト
  const filteredFacilities = metrics?.facilities.filter((f) => {
    switch (statusFilter) {
      case 'available':
        return f.available > 0;
      case 'locked':
        return f.locked > 0;
      case 'occupied':
        return f.occupied > 0;
      case 'maintenance':
        return f.maintenance > 0;
      case 'lowOccupancy':
        return f.occupancyRate !== null && f.occupancyRate < 70;
      default:
        return true;
    }
  }) || [];

  // フィルタされた部屋リスト
  const filteredRooms = rooms.filter((r) => {
    // 建物フィルター
    if (buildingFilter !== 'all' && r.buildingName !== buildingFilter) {
      return false;
    }
    // ステータスフィルター
    switch (statusFilter) {
      case 'available':
        return r.status === '空室';
      case 'locked':
        return r.status === '予約';
      case 'occupied':
        return r.status === '入居中' || r.status === '退去予定';
      case 'maintenance':
        return r.status === 'メンテナンス';
      default:
        return true;
    }
  });

  // 低稼働施設
  const lowOccupancyFacilities = metrics?.facilities.filter(
    (f) => f.occupancyRate !== null && f.occupancyRate < 70
  ) || [];

  if (loading) {
    return <Loading />;
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Building2 className="w-6 h-6" />
                空室・稼働状況
              </h1>
              {lastUpdated && (
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  最終更新: {formatTime(lastUpdated.toISOString())}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant="primary"
                  onClick={() => setShowAddRoomModal(true)}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  部屋を追加
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                更新
              </Button>
            </div>
          </div>

          {/* エラーバナー */}
          {error && (
            <Card className="p-4 mb-6 bg-red-50 border border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-800">データ取得エラー</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
                <Button variant="secondary" onClick={handleRefresh} className="text-sm">
                  再試行
                </Button>
              </div>
            </Card>
          )}

          {/* 警告バナー */}
          {metrics?.warnings && metrics.warnings.length > 0 && (
            <Card className="p-4 mb-6 bg-yellow-50 border border-yellow-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800">警告</p>
                  {metrics.warnings.map((w, i) => (
                    <p key={i} className="text-sm text-yellow-700 mt-1">
                      [{w.label}] {w.message}
                    </p>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* サマリーカード */}
          {metrics && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              {/* 全体稼働率 */}
              <Card className={`p-4 ${getOccupancyColor(metrics.summary.occupancyRate).bg} border ${getOccupancyColor(metrics.summary.occupancyRate).border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-medium text-gray-600">稼働率</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-bold ${getOccupancyColor(metrics.summary.occupancyRate).text}`}>
                    {displayRate(metrics.summary.occupancyRate)}
                  </span>
                </div>
                <div className="mt-2">
                  <OccupancyBar rate={metrics.summary.occupancyRate} />
                </div>
              </Card>

              {/* 空室数 */}
              <Card className="p-4 bg-blue-50 border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Home className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-medium text-gray-600">空室</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-blue-600">
                    {displayCount(metrics.summary.available)}
                  </span>
                  <span className="text-gray-500 text-sm">室</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">即入居可</p>
              </Card>

              {/* ロック数 */}
              <Card className="p-4 bg-purple-50 border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-medium text-gray-600">ロック</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-purple-600">
                    {displayCount(metrics.summary.locked)}
                  </span>
                  <span className="text-gray-500 text-sm">室</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">申込中</p>
              </Card>

              {/* 入居中 */}
              <Card className="p-4 bg-green-50 border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-medium text-gray-600">入居中</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-green-600">
                    {displayCount(metrics.summary.occupied)}
                  </span>
                  <span className="text-gray-500 text-sm">室</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">/ {displayCount(metrics.summary.totalRooms)}室</p>
              </Card>

              {/* 修繕中 */}
              <Card className="p-4 bg-yellow-50 border border-yellow-200">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench className="w-4 h-4 text-yellow-600" />
                  <span className="text-xs font-medium text-gray-600">修繕中</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-yellow-600">
                    {displayCount(metrics.summary.maintenance)}
                  </span>
                  <span className="text-gray-500 text-sm">室</span>
                </div>
              </Card>
            </div>
          )}

          {/* 表示モード切替 */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setViewMode('summary')}
                className={`px-4 py-2 text-sm font-medium ${
                  viewMode === 'summary'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                施設サマリー
              </button>
              <button
                onClick={() => setViewMode('rooms')}
                className={`px-4 py-2 text-sm font-medium ${
                  viewMode === 'rooms'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                部屋一覧
              </button>
            </div>

            {/* 建物フィルター（部屋一覧モード時のみ） */}
            {viewMode === 'rooms' && buildings.length > 0 && (
              <select
                value={buildingFilter}
                onChange={(e) => setBuildingFilter(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">全建物</option>
                {buildings.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            )}
          </div>

          {/* フィルタチップ */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400" />
            {[
              { key: 'all', label: '全て', count: viewMode === 'summary' ? metrics?.facilities.length : rooms.length },
              { key: 'available', label: '空室', count: viewMode === 'summary' ? metrics?.facilities.filter(f => f.available > 0).length : rooms.filter(r => r.status === '空室').length },
              { key: 'locked', label: 'ロック', count: viewMode === 'summary' ? metrics?.facilities.filter(f => f.locked > 0).length : rooms.filter(r => r.status === '予約').length },
              { key: 'occupied', label: '入居中', count: viewMode === 'summary' ? metrics?.facilities.filter(f => f.occupied > 0).length : rooms.filter(r => r.status === '入居中' || r.status === '退去予定').length },
              { key: 'maintenance', label: '修繕中', count: viewMode === 'summary' ? metrics?.facilities.filter(f => f.maintenance > 0).length : rooms.filter(r => r.status === 'メンテナンス').length },
            ].map((chip) => (
              <button
                key={chip.key}
                onClick={() => setStatusFilter(chip.key as StatusFilter)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === chip.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {chip.label}
                {chip.count !== undefined && (
                  <span className="ml-1 opacity-75">({chip.count})</span>
                )}
              </button>
            ))}
          </div>

          {/* 低稼働アラート */}
          {viewMode === 'summary' && lowOccupancyFacilities.length > 0 && statusFilter === 'all' && (
            <Card className="p-4 mb-6 bg-red-50 border border-red-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">入居促進が必要な施設</p>
                  <p className="text-sm text-red-700 mt-1">
                    {lowOccupancyFacilities.map(f => f.name).join('、')} の稼働率が70%を下回っています
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* ロック済み部屋（サマリーモード） */}
          {viewMode === 'summary' && metrics && metrics.lockedRooms.length > 0 && (
            <Card className="mb-6 border border-purple-200">
              <button
                onClick={() => setShowLockedRooms(!showLockedRooms)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-purple-600" />
                  <span className="font-medium text-purple-800">
                    ロック中の部屋（{metrics.lockedRooms.length}室）
                  </span>
                </div>
                {showLockedRooms ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              {showLockedRooms && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-gray-600 mb-3">
                    入居希望者の申込によりロックされている部屋です
                  </p>
                  <div className="space-y-2">
                    {metrics.lockedRooms.map((room) => (
                      <div
                        key={room.id}
                        className="flex items-center justify-between p-3 bg-purple-50 rounded-lg"
                      >
                        <div>
                          <span className="font-medium text-purple-800">
                            {room.buildingName} {room.roomNumber}
                          </span>
                          {room.lockedByName && (
                            <span className="text-xs text-purple-600 ml-2">
                              by {room.lockedByName}
                            </span>
                          )}
                          {room.lockedAt && (
                            <span className="text-xs text-gray-500 ml-2">
                              ({formatTime(room.lockedAt)}〜)
                            </span>
                          )}
                        </div>
                        {room.lockedCaseId && (
                          <Link
                            href={`/dashboard/prospects/${room.lockedCaseId}`}
                            className="text-sm text-purple-600 hover:underline"
                          >
                            詳細
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* 施設一覧テーブル（サマリーモード） */}
          {viewMode === 'summary' && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        施設
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        稼働率
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <Home className="w-3 h-3 inline mr-1" />空室
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <Lock className="w-3 h-3 inline mr-1" />ロック
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <Building2 className="w-3 h-3 inline mr-1" />入居
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <Wrench className="w-3 h-3 inline mr-1" />修繕
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredFacilities.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          {statusFilter === 'all' ? '施設データがありません' : '該当する施設がありません'}
                        </td>
                      </tr>
                    ) : (
                      filteredFacilities.map((facility) => {
                        const colors = getOccupancyColor(facility.occupancyRate);
                        return (
                          <tr key={facility.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4">
                              <div className="font-medium text-gray-900">{facility.name}</div>
                              {facility.area && (
                                <div className="text-xs text-gray-500">{facility.area}</div>
                              )}
                              {facility.lastUpdated && (
                                <div className="text-xs text-gray-400 mt-1">
                                  更新: {formatTime(facility.lastUpdated)}
                                  {facility.lastUpdatedBy && ` (${facility.lastUpdatedBy})`}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className={`text-lg font-bold ${colors.text}`}>
                                  {displayRate(facility.occupancyRate)}
                                </span>
                                <div className="w-16">
                                  <OccupancyBar rate={facility.occupancyRate} />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center">
                              {facility.available > 0 ? (
                                <Badge variant="info" className="min-w-[2rem]">
                                  {facility.available}
                                </Badge>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-center">
                              {facility.locked > 0 ? (
                                <Badge variant="default" className="min-w-[2rem]">
                                  {facility.locked}
                                </Badge>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="font-medium text-gray-700">
                                {facility.occupied}
                              </span>
                              <span className="text-gray-400 text-xs ml-1">
                                /{facility.capacity || (facility.available + facility.locked + facility.occupied + facility.maintenance)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              {facility.maintenance > 0 ? (
                                <Badge variant="warning" className="min-w-[2rem]">
                                  {facility.maintenance}
                                </Badge>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* 部屋一覧テーブル（部屋モード） */}
          {viewMode === 'rooms' && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        建物
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        部屋番号
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        状態
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ロック/入居者
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        備考
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredRooms.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                          {rooms.length === 0 ? '部屋データがありません' : '該当する部屋がありません'}
                        </td>
                      </tr>
                    ) : (
                      filteredRooms.map((room) => (
                        <tr key={room.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {room.buildingName}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {room.roomNumber}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusChangeDropdown
                              room={room}
                              onStatusChange={handleStatusChange}
                              disabled={!isLeader}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {room.status === '予約' && room.lockedCaseId && (
                              <Link
                                href={`/dashboard/prospects/${room.lockedCaseId}`}
                                className="text-purple-600 hover:underline"
                              >
                                {room.lockedByName || '申込中'}
                              </Link>
                            )}
                            {(room.status === '入居中' || room.status === '退去予定') && room.occupantName && (
                              <span>{room.occupantName}</span>
                            )}
                            {room.status === '空室' && '-'}
                            {room.status === 'メンテナンス' && '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {room.note || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* デバッグパネル */}
          {debugMode && metrics?.debug && (
            <Card className="mt-6 p-4 bg-gray-900 text-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle className="w-4 h-4" />
                <span className="font-medium">Debug Info</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                <div>
                  <span className="text-gray-400">Rooms Queried:</span>
                  <span className="ml-2">{metrics.debug.roomsQueried}</span>
                </div>
                <div>
                  <span className="text-gray-400">Facilities Queried:</span>
                  <span className="ml-2">{metrics.debug.facilitiesQueried}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-400">Raw Status Counts:</span>
                  <pre className="mt-1 text-xs bg-gray-800 p-2 rounded overflow-auto">
                    {JSON.stringify(metrics.debug.rawStatusCounts, null, 2)}
                  </pre>
                </div>
                {metrics.debug.unknownStatuses.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-yellow-400">Unknown Statuses:</span>
                    <span className="ml-2">{metrics.debug.unknownStatuses.join(', ')}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* フッター情報 */}
          <div className="mt-6 text-center text-xs text-gray-400">
            <p>自動更新: 60秒ごと</p>
            {isAdmin && (
              <p className="mt-1">
                <button
                  onClick={() => setDebugMode(!debugMode)}
                  className="text-gray-500 hover:text-gray-700 underline"
                >
                  {debugMode ? 'デバッグモードOFF' : 'デバッグモードON'}
                </button>
              </p>
            )}
          </div>
        </main>

        {/* 部屋追加モーダル */}
        <AddRoomModal
          isOpen={showAddRoomModal}
          onClose={() => setShowAddRoomModal(false)}
          onSubmit={handleAddRoom}
          buildings={buildings}
        />
      </div>
    </AuthGuard>
  );
}
