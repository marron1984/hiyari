'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  RefreshCw,
  Shield,
  Building,
  Mail,
  Clock,
  Calendar,
  CheckCircle,
  XCircle,
  Eye,
  Settings,
  History,
  X,
} from 'lucide-react';

// ========== 型定義 ==========

type ExternalRoleId =
  | 'external_auditor'
  | 'external_vendor'
  | 'external_accountant'
  | 'external_lawyer'
  | 'external_other';

type ExternalUserStatus = 'active' | 'invited' | 'disabled';

interface ExternalUser {
  id: string;
  email: string;
  displayName: string;
  organization: string | null;
  role: ExternalRoleId;
  status: ExternalUserStatus;
  invitedAt: string | null;
  lastLoginAt: string | null;
  expiresAt: string | null;
  createdByUserId: string;
  createdByName: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExternalAccountsStats {
  total: number;
  active: number;
  invited: number;
  disabled: number;
  byRole: Record<ExternalRoleId, number>;
  expiringSoon: number;
  recentLogins: number;
}

interface AuditLog {
  id: string;
  externalUserId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  ipAddress: string | null;
  timestamp: string;
}

// ========== 設定 ==========

const ROLE_CONFIG: Record<ExternalRoleId, { label: string; color: string; bgColor: string }> = {
  external_auditor: { label: '監査閲覧', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  external_vendor: { label: '業者', color: 'text-orange-700', bgColor: 'bg-orange-50' },
  external_accountant: { label: '会計士', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  external_lawyer: { label: '士業', color: 'text-green-700', bgColor: 'bg-green-50' },
  external_other: { label: 'その他', color: 'text-zinc-700', bgColor: 'bg-zinc-50' },
};

const STATUS_CONFIG: Record<ExternalUserStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  active: { label: '有効', color: 'text-green-700', bgColor: 'bg-green-50', icon: <CheckCircle className="w-4 h-4" /> },
  invited: { label: '招待中', color: 'text-amber-700', bgColor: 'bg-amber-50', icon: <Clock className="w-4 h-4" /> },
  disabled: { label: '無効', color: 'text-zinc-500', bgColor: 'bg-zinc-100', icon: <XCircle className="w-4 h-4" /> },
};

const ACTION_LABELS: Record<string, string> = {
  login: 'ログイン',
  logout: 'ログアウト',
  view: '閲覧',
  download: 'ダウンロード',
  access_denied: 'アクセス拒否',
  invited: '招待',
  activated: '有効化',
  disabled: '無効化',
  policy_updated: 'ポリシー更新',
  expired: '期限切れ',
};

// ========== ユーティリティ ==========

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - new Date().getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function isExpiringSoon(expiresAt: string | null): boolean {
  const days = daysUntilExpiry(expiresAt);
  return days !== null && days > 0 && days <= 30;
}

function isExpired(expiresAt: string | null): boolean {
  const days = daysUntilExpiry(expiresAt);
  return days !== null && days <= 0;
}

// ========== コンポーネント ==========

interface UserCardProps {
  user: ExternalUser;
  onSelect: () => void;
  onAction: (action: 'disable' | 'activate') => void;
}

function UserCard({ user, onSelect, onAction }: UserCardProps) {
  const roleConfig = ROLE_CONFIG[user.role];
  const statusConfig = STATUS_CONFIG[user.status];
  const expiring = isExpiringSoon(user.expiresAt);
  const expired = isExpired(user.expiresAt);

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${roleConfig.bgColor}`}>
            <Shield className={`w-5 h-5 ${roleConfig.color}`} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-zinc-900 truncate">{user.displayName}</div>
            <div className="text-sm text-zinc-500 truncate flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {user.email}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500">
        {user.organization && (
          <span className="flex items-center gap-1">
            <Building className="w-3 h-3" />
            {user.organization}
          </span>
        )}
        <span className={`px-2 py-0.5 rounded ${roleConfig.bgColor} ${roleConfig.color}`}>
          {roleConfig.label}
        </span>
      </div>

      {user.expiresAt && (
        <div className={`mt-2 text-xs flex items-center gap-1 ${
          expired ? 'text-red-600' : expiring ? 'text-amber-600' : 'text-zinc-500'
        }`}>
          <Calendar className="w-3 h-3" />
          有効期限: {formatDate(user.expiresAt)}
          {expired && <span className="ml-1 font-medium">（期限切れ）</span>}
          {expiring && !expired && <span className="ml-1 font-medium">（まもなく期限切れ）</span>}
        </div>
      )}

      {user.lastLoginAt && (
        <div className="mt-1 text-xs text-zinc-400 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          最終ログイン: {formatDateTime(user.lastLoginAt)}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 pt-3 border-t border-zinc-100">
        <button
          onClick={onSelect}
          className="flex-1 text-sm text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1"
        >
          <Eye className="w-4 h-4" />
          詳細
        </button>
        {user.status === 'active' ? (
          <button
            onClick={() => onAction('disable')}
            className="flex-1 text-sm text-red-600 hover:text-red-800 flex items-center justify-center gap-1"
          >
            <XCircle className="w-4 h-4" />
            無効化
          </button>
        ) : user.status !== 'disabled' ? (
          <button
            onClick={() => onAction('activate')}
            className="flex-1 text-sm text-green-600 hover:text-green-800 flex items-center justify-center gap-1"
          >
            <CheckCircle className="w-4 h-4" />
            有効化
          </button>
        ) : (
          <button
            onClick={() => onAction('activate')}
            className="flex-1 text-sm text-zinc-400 hover:text-zinc-600 flex items-center justify-center gap-1"
          >
            <RefreshCw className="w-4 h-4" />
            再有効化
          </button>
        )}
      </div>
    </div>
  );
}

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateUserModal({ isOpen, onClose, onCreated }: CreateUserModalProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState<ExternalRoleId>('external_other');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [activateImmediately, setActivateImmediately] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/external-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          displayName,
          organization: organization || null,
          role,
          expiresAt: expiresAt || null,
          note: note || null,
          activateImmediately,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '作成に失敗しました');
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">外部アカウント作成</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              メールアドレス <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="example@company.jp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              表示名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="山田 太郎"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">所属組織</label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="○○監査法人"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              ロール <span className="text-red-500">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ExternalRoleId)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">有効期限</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-zinc-500">空欄の場合は無期限</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">管理メモ</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="社内用のメモ（外部には表示されません）"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="activateImmediately"
              checked={activateImmediately}
              onChange={(e) => setActivateImmediately(e.target.checked)}
              className="rounded border-zinc-300"
            />
            <label htmlFor="activateImmediately" className="text-sm text-zinc-700">
              即座に有効化（招待メール送信後すぐにアクセス可能）
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-600 hover:text-zinc-800"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '作成中...' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface UserDetailModalProps {
  user: ExternalUser | null;
  onClose: () => void;
  onUpdate: () => void;
}

function UserDetailModal({ user, onClose }: UserDetailModalProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'logs'>('info');

  useEffect(() => {
    if (user && activeTab === 'logs') {
      fetchLogs();
    }
  }, [user, activeTab]);

  async function fetchLogs() {
    if (!user) return;
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/external-accounts/${user.id}/logs?limit=20`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }

  if (!user) return null;

  const roleConfig = ROLE_CONFIG[user.role];
  const statusConfig = STATUS_CONFIG[user.status];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">外部アカウント詳細</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b border-zinc-200">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'info'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Settings className="w-4 h-4 inline mr-1" />
            基本情報
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'logs'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <History className="w-4 h-4 inline mr-1" />
            監査ログ
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'info' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${roleConfig.bgColor}`}>
                  <Shield className={`w-8 h-8 ${roleConfig.color}`} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-zinc-900">{user.displayName}</h3>
                  <div className="text-sm text-zinc-500">{user.email}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${roleConfig.bgColor} ${roleConfig.color}`}>
                      {roleConfig.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-200">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">所属組織</div>
                  <div className="text-sm text-zinc-900">{user.organization || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">有効期限</div>
                  <div className={`text-sm ${isExpired(user.expiresAt) ? 'text-red-600' : isExpiringSoon(user.expiresAt) ? 'text-amber-600' : 'text-zinc-900'}`}>
                    {user.expiresAt ? formatDate(user.expiresAt) : '無期限'}
                    {isExpired(user.expiresAt) && ' （期限切れ）'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">招待日</div>
                  <div className="text-sm text-zinc-900">{formatDateTime(user.invitedAt)}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">最終ログイン</div>
                  <div className="text-sm text-zinc-900">{formatDateTime(user.lastLoginAt)}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">作成者</div>
                  <div className="text-sm text-zinc-900">{user.createdByName || user.createdByUserId}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">作成日</div>
                  <div className="text-sm text-zinc-900">{formatDateTime(user.createdAt)}</div>
                </div>
              </div>

              {user.note && (
                <div className="pt-4 border-t border-zinc-200">
                  <div className="text-xs text-zinc-500 mb-1">管理メモ</div>
                  <div className="text-sm text-zinc-700 bg-zinc-50 rounded p-3">{user.note}</div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {loadingLogs ? (
                <div className="text-center py-8 text-zinc-500">読み込み中...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">監査ログがありません</div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 py-2 border-b border-zinc-100">
                      <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0">
                        <History className="w-4 h-4 text-zinc-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-900">
                          {ACTION_LABELS[log.action] || log.action}
                          {log.targetType && (
                            <span className="text-zinc-500">
                              {' '}/ {log.targetType}
                              {log.targetId && ` (${log.targetId})`}
                            </span>
                          )}
                        </div>
                        {log.details && (
                          <div className="text-xs text-zinc-500 mt-0.5">{log.details}</div>
                        )}
                        <div className="text-xs text-zinc-400 mt-1">
                          {formatDateTime(log.timestamp)}
                          {log.ipAddress && ` | ${log.ipAddress}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ========== メインページ ==========

export default function ExternalAccountsPage() {
  const [users, setUsers] = useState<ExternalUser[]>([]);
  const [stats, setStats] = useState<ExternalAccountsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<ExternalUserStatus | ''>('');
  const [filterRole, setFilterRole] = useState<ExternalRoleId | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ExternalUser | null>(null);

  useEffect(() => {
    fetchData();
  }, [filterStatus, filterRole, searchQuery]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterRole) params.set('role', filterRole);
      if (searchQuery) params.set('search', searchQuery);

      const [usersRes, statsRes] = await Promise.all([
        fetch(`/api/external-accounts?${params.toString()}`),
        fetch('/api/external-accounts/stats'),
      ]);

      const [usersData, statsData] = await Promise.all([usersRes.json(), statsRes.json()]);

      if (usersData.success) {
        setUsers(usersData.users || []);
      }
      if (statsData.success) {
        setStats(statsData.stats);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(userId: string, action: 'disable' | 'activate') {
    try {
      const res = await fetch(`/api/external-accounts/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Action failed:', err);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">外部関係者アカウント</h1>
          <p className="text-zinc-600 mt-1">取引先・監査人などの外部アクセスを管理</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200"
          >
            <RefreshCw className="w-4 h-4" />
            更新
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <UserPlus className="w-4 h-4" />
            新規作成
          </button>
        </div>
      </div>

      {/* 統計サマリー */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white border border-zinc-200 rounded-lg p-4">
            <div className="text-xs text-zinc-500 mb-1">総数</div>
            <div className="text-2xl font-bold text-zinc-900">{stats.total}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-xs text-green-600 mb-1">有効</div>
            <div className="text-2xl font-bold text-green-700">{stats.active}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="text-xs text-amber-600 mb-1">招待中</div>
            <div className="text-2xl font-bold text-amber-700">{stats.invited}</div>
          </div>
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
            <div className="text-xs text-zinc-500 mb-1">無効</div>
            <div className="text-2xl font-bold text-zinc-600">{stats.disabled}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-xs text-red-600 mb-1">期限切れ間近</div>
            <div className="text-2xl font-bold text-red-700">{stats.expiringSoon}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-xs text-blue-600 mb-1">直近7日ログイン</div>
            <div className="text-2xl font-bold text-blue-700">{stats.recentLogins}</div>
          </div>
        </div>
      )}

      {/* フィルター */}
      <div className="flex flex-wrap items-center gap-4 bg-white border border-zinc-200 rounded-lg p-4">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="名前、メール、組織で検索..."
            className="flex-1 border-0 focus:ring-0 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as ExternalUserStatus | '')}
            className="border border-zinc-300 rounded px-2 py-1 text-sm"
          >
            <option value="">全ステータス</option>
            <option value="active">有効</option>
            <option value="invited">招待中</option>
            <option value="disabled">無効</option>
          </select>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as ExternalRoleId | '')}
            className="border border-zinc-300 rounded px-2 py-1 text-sm"
          >
            <option value="">全ロール</option>
            {Object.entries(ROLE_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ユーザー一覧 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-zinc-100 rounded-lg h-48 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>外部アカウントがありません</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 text-blue-600 hover:underline"
          >
            新規作成する
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onSelect={() => setSelectedUser(user)}
              onAction={(action) => handleAction(user.id, action)}
            />
          ))}
        </div>
      )}

      {/* モーダル */}
      <CreateUserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchData}
      />
      <UserDetailModal
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onUpdate={fetchData}
      />
    </div>
  );
}
