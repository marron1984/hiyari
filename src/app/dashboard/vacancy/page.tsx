'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Plus,
  X,
  Users,
  DoorOpen,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

// ===== 型定義 =====

interface FacilityData {
  id: string;
  name: string;
  address: string | null;
  area: string | null;
  capacity: number | null;
  note: string | null;
  isActive: boolean;
}

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
}

interface FacilitySummary {
  facilityId: string;
  facilityName: string;
  totalRooms: number;
  available: number;
  locked: number;
  occupied: number;
  maintenance: number;
  occupancyRate: number | null;
}

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

function getOccupancyColor(rate: number | null): string {
  if (rate === null) return 'text-gray-500';
  if (rate >= 95) return 'text-green-600';
  if (rate >= 85) return 'text-blue-600';
  if (rate >= 70) return 'text-yellow-600';
  return 'text-red-600';
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

// ===== 施設追加モーダル =====

interface AddFacilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; address?: string; note?: string }) => Promise<void>;
}

function AddFacilityModal({ isOpen, onClose, onSubmit }: AddFacilityModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit({ name, address: address || undefined, note: note || undefined });
      setName('');
      setAddress('');
      setNote('');
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
            <Building2 className="w-5 h-5" />
            施設を追加
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
              施設名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: パシフィック"
              className="w-full border rounded-lg px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              住所
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例: 東京都..."
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              備考
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="メモ..."
              className="w-full border rounded-lg px-3 py-2 h-20 resize-none"
            />
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
              disabled={submitting || !name.trim()}
            >
              {submitting ? '追加中...' : '追加'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===== 部屋追加モーダル =====

interface AddRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { buildingName: string; roomNumber: string; capacity: number }) => Promise<void>;
  facilityName: string;
}

function AddRoomModal({ isOpen, onClose, onSubmit, facilityName }: AddRoomModalProps) {
  const [roomNumber, setRoomNumber] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit({ buildingName: facilityName, roomNumber, capacity });
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
            {facilityName} に部屋を追加
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
              disabled={submitting || !roomNumber.trim()}
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

// ===== 施設詳細ドロワー =====

interface FacilityDrawerProps {
  facility: FacilityData | null;
  rooms: RoomData[];
  isOpen: boolean;
  onClose: () => void;
  onAddRoom: () => void;
  onStatusChange: (roomId: string, newStatus: string) => Promise<void>;
  canAddRoom: boolean;
  canChangeStatus: boolean;
}

function FacilityDrawer({
  facility,
  rooms,
  isOpen,
  onClose,
  onAddRoom,
  onStatusChange,
  canAddRoom,
  canChangeStatus,
}: FacilityDrawerProps) {
  if (!isOpen || !facility) return null;

  const facilityRooms = rooms.filter((r) => r.buildingName === facility.name);
  const summary = {
    total: facilityRooms.length,
    available: facilityRooms.filter((r) => r.status === '空室').length,
    locked: facilityRooms.filter((r) => r.status === '予約').length,
    occupied: facilityRooms.filter((r) => r.status === '入居中' || r.status === '退去予定').length,
    maintenance: facilityRooms.filter((r) => r.status === 'メンテナンス').length,
  };

  return (
    <>
      {/* オーバーレイ */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* ドロワー */}
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl z-50 flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {facility.name}
            </h2>
            {facility.address && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" />
                {facility.address}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* サマリー */}
        <div className="grid grid-cols-4 gap-2 p-4 bg-gray-50 border-b">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{summary.available}</div>
            <div className="text-xs text-gray-500">空室</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{summary.locked}</div>
            <div className="text-xs text-gray-500">ロック</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{summary.occupied}</div>
            <div className="text-xs text-gray-500">入居中</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{summary.maintenance}</div>
            <div className="text-xs text-gray-500">修繕中</div>
          </div>
        </div>

        {/* アクション */}
        <div className="p-4 border-b">
          {canAddRoom && (
            <Button
              onClick={onAddRoom}
              className="w-full flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              部屋を追加
            </Button>
          )}
        </div>

        {/* 部屋一覧 */}
        <div className="flex-1 overflow-y-auto">
          {facilityRooms.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Home className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>部屋がありません</p>
              {canAddRoom && (
                <p className="text-sm mt-2">「部屋を追加」から登録してください</p>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">部屋番号</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">状態</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">入居者/ロック</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {facilityRooms.map((room) => (
                  <tr key={room.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{room.roomNumber}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusChangeDropdown
                        room={room}
                        onStatusChange={onStatusChange}
                        disabled={!canChangeStatus}
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
                      {room.status === '空室' && <span className="text-gray-400">-</span>}
                      {room.status === 'メンテナンス' && <span className="text-gray-400">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// ===== 施設カード =====

interface FacilityCardProps {
  facility: FacilityData;
  summary: FacilitySummary;
  onClick: () => void;
}

function FacilityCard({ facility, summary, onClick }: FacilityCardProps) {
  const occupancyRate = summary.totalRooms > 0
    ? Math.round((summary.occupied / summary.totalRooms) * 100)
    : null;

  return (
    <Card
      className="relative overflow-hidden hover:shadow-md transition-all cursor-pointer border-zinc-200 active:scale-[0.99]"
      onClick={onClick}
    >
      {/* 左アクセントバー */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
        occupancyRate === null ? 'bg-zinc-300' :
        occupancyRate >= 95 ? 'bg-emerald-500' :
        occupancyRate >= 85 ? 'bg-blue-500' :
        occupancyRate >= 70 ? 'bg-amber-500' : 'bg-red-500'
      }`} />

      <div className="p-4 pl-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2 text-zinc-900">
              <Building2 className="w-5 h-5 text-blue-600" />
              {facility.name}
            </h3>
            {facility.address && (
              <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {facility.address}
              </p>
            )}
          </div>
          <ChevronRight className="w-5 h-5 text-zinc-300" />
        </div>

        {/* サマリー数字 */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="text-center p-2 bg-blue-50 rounded-lg">
            <div className="text-lg font-bold tabular-nums text-blue-600">{summary.available}</div>
            <div className="text-[10px] text-zinc-500">空室</div>
          </div>
          <div className="text-center p-2 bg-violet-50 rounded-lg">
            <div className="text-lg font-bold tabular-nums text-violet-600">{summary.locked}</div>
            <div className="text-[10px] text-zinc-500">ロック</div>
          </div>
          <div className="text-center p-2 bg-emerald-50 rounded-lg">
            <div className="text-lg font-bold tabular-nums text-emerald-600">{summary.occupied}</div>
            <div className="text-[10px] text-zinc-500">入居中</div>
          </div>
          <div className="text-center p-2 bg-amber-50 rounded-lg">
            <div className="text-lg font-bold tabular-nums text-amber-600">{summary.maintenance}</div>
            <div className="text-[10px] text-zinc-500">修繕</div>
          </div>
        </div>

        {/* 稼働率バー */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                occupancyRate === null ? 'bg-zinc-300' :
                occupancyRate >= 95 ? 'bg-emerald-500' :
                occupancyRate >= 85 ? 'bg-blue-500' :
                occupancyRate >= 70 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${occupancyRate || 0}%` }}
            />
          </div>
          <span className={`text-sm font-bold tabular-nums ${getOccupancyColor(occupancyRate)}`}>
            {occupancyRate !== null ? `${occupancyRate}%` : '--'}
          </span>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          稼働率 ({summary.occupied}/{summary.totalRooms}室)
        </p>
      </div>
    </Card>
  );
}

// ===== メインコンポーネント =====

export default function VacancyPage() {
  const { user, firebaseUser } = useAuth();
  const [facilities, setFacilities] = useState<FacilityData[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ドロワー・モーダル
  const [selectedFacility, setSelectedFacility] = useState<FacilityData | null>(null);
  const [showAddFacilityModal, setShowAddFacilityModal] = useState(false);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);

  // 自動更新タイマー
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const AUTO_REFRESH_INTERVAL = 60000;

  const isAdmin = hasMinRole(user?.role, 'admin');
  const isLeader = hasMinRole(user?.role, 'leader');

  // 施設ごとのサマリーを計算
  const facilitySummaries: Record<string, FacilitySummary> = {};
  facilities.forEach((f) => {
    const facilityRooms = rooms.filter((r) => r.buildingName === f.name);
    const occupied = facilityRooms.filter((r) => r.status === '入居中' || r.status === '退去予定').length;
    const total = facilityRooms.length;
    facilitySummaries[f.id] = {
      facilityId: f.id,
      facilityName: f.name,
      totalRooms: total,
      available: facilityRooms.filter((r) => r.status === '空室').length,
      locked: facilityRooms.filter((r) => r.status === '予約').length,
      occupied,
      maintenance: facilityRooms.filter((r) => r.status === 'メンテナンス').length,
      occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : null,
    };
  });

  // 全体サマリー
  const totalSummary = {
    totalRooms: rooms.length,
    available: rooms.filter((r) => r.status === '空室').length,
    locked: rooms.filter((r) => r.status === '予約').length,
    occupied: rooms.filter((r) => r.status === '入居中' || r.status === '退去予定').length,
    maintenance: rooms.filter((r) => r.status === 'メンテナンス').length,
    occupancyRate: rooms.length > 0
      ? Math.round((rooms.filter((r) => r.status === '入居中' || r.status === '退去予定').length / rooms.length) * 100)
      : null,
  };

  // APIからデータ取得
  const fetchData = useCallback(async (showLoadingState = true) => {
    if (!firebaseUser) return;

    if (showLoadingState) {
      setRefreshing(true);
    }
    setError(null);

    try {
      const token = await firebaseUser.getIdToken();

      const [facilitiesRes, roomsRes] = await Promise.all([
        fetch('/api/facilities', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
        fetch('/api/rooms', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }),
      ]);

      if (facilitiesRes.ok) {
        const data = await facilitiesRes.json();
        if (data.success) {
          setFacilities(data.facilities || []);
        }
      }

      if (roomsRes.ok) {
        const data = await roomsRes.json();
        if (data.success) {
          setRooms(data.rooms || []);
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
  }, [firebaseUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  // 施設追加
  const handleAddFacility = async (data: { name: string; address?: string; note?: string }) => {
    if (!firebaseUser) throw new Error('認証が必要です');

    const token = await firebaseUser.getIdToken();
    const res = await fetch('/api/facilities', {
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

    await fetchData(false);
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

    await fetchData(false);
  };

  if (loading) {
    return <Loading text="読み込み中..." />;
  }

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
                施設・部屋・状態を一元管理します
              </p>
              {lastUpdated && (
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  最終更新: {formatTime(lastUpdated.toISOString())}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isAdmin && (
                <Button
                  variant="secondary"
                  onClick={() => setShowAddFacilityModal(true)}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  施設を追加
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => fetchData(true)}
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
                <Button variant="secondary" onClick={() => fetchData(true)} className="text-sm">
                  再試行
                </Button>
              </div>
            </Card>
          )}

          {/* 全体サマリー */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Card className="p-3 border-zinc-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-medium text-zinc-500">稼働率</span>
              </div>
              <div className={`text-2xl font-bold tabular-nums ${getOccupancyColor(totalSummary.occupancyRate)}`}>
                {totalSummary.occupancyRate !== null ? `${totalSummary.occupancyRate}%` : '--'}
              </div>
            </Card>
            <Card className="p-3 border-zinc-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <Home className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-medium text-zinc-500">空室</span>
              </div>
              <div className="text-2xl font-bold tabular-nums text-blue-600">{totalSummary.available}</div>
            </Card>
            <Card className="p-3 border-zinc-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center">
                  <Lock className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-medium text-zinc-500">ロック</span>
              </div>
              <div className="text-2xl font-bold tabular-nums text-violet-600">{totalSummary.locked}</div>
            </Card>
            <Card className="p-3 border-zinc-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-medium text-zinc-500">入居中</span>
              </div>
              <div className="text-2xl font-bold tabular-nums text-emerald-600">{totalSummary.occupied}</div>
            </Card>
            <Card className="p-3 border-zinc-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                  <Wrench className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-medium text-zinc-500">修繕中</span>
              </div>
              <div className="text-2xl font-bold tabular-nums text-amber-600">{totalSummary.maintenance}</div>
            </Card>
          </div>

          {/* 施設カード一覧 */}
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            施設一覧
          </h2>

          {facilities.length === 0 ? (
            <Card className="p-8 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">施設が登録されていません</p>
              {isAdmin && (
                <Button
                  onClick={() => setShowAddFacilityModal(true)}
                  className="mt-4"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  施設を追加
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {facilities.map((facility) => (
                <FacilityCard
                  key={facility.id}
                  facility={facility}
                  summary={facilitySummaries[facility.id] || {
                    facilityId: facility.id,
                    facilityName: facility.name,
                    totalRooms: 0,
                    available: 0,
                    locked: 0,
                    occupied: 0,
                    maintenance: 0,
                    occupancyRate: null,
                  }}
                  onClick={() => setSelectedFacility(facility)}
                />
              ))}
            </div>
          )}

          {/* フッター */}
          <div className="mt-8 text-center text-xs text-gray-400">
            <p>自動更新: 60秒ごと</p>
          </div>

          {/* 施設詳細ドロワー */}
          <FacilityDrawer
            facility={selectedFacility}
            rooms={rooms}
            isOpen={!!selectedFacility}
            onClose={() => setSelectedFacility(null)}
            onAddRoom={() => setShowAddRoomModal(true)}
            onStatusChange={handleStatusChange}
            canAddRoom={isAdmin}
            canChangeStatus={isLeader}
          />

          {/* 施設追加モーダル */}
          <AddFacilityModal
            isOpen={showAddFacilityModal}
            onClose={() => setShowAddFacilityModal(false)}
            onSubmit={handleAddFacility}
          />

          {/* 部屋追加モーダル */}
          {selectedFacility && (
            <AddRoomModal
              isOpen={showAddRoomModal}
              onClose={() => setShowAddRoomModal(false)}
              onSubmit={handleAddRoom}
              facilityName={selectedFacility.name}
            />
          )}
        </main>
  );
}
