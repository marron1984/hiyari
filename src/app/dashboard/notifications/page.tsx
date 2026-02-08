'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Bell, Settings, Check, CheckCheck, X, Clock, FileText,
  AlertTriangle, Calendar, MessageSquare, ClipboardCheck,
  RotateCcw, Brain, Heart, Flame, Banknote, Filter, Inbox,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Notification, NotificationType } from '@/types/notification';
import {
  subscribeToNotifications,
  subscribeToUnreadCount,
  markAsRead,
  markAllAsRead,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { toDate } from '@/lib/date';

// 通知タイプ別のアイコンと色
const NOTIFICATION_CONFIG: Record<NotificationType, { icon: typeof Bell; color: string; bg: string; label: string }> = {
  clock_reminder: { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50', label: '打刻リマインダー' },
  overtime_request: { icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50', label: '残業申請' },
  overtime_approved: { icon: Check, color: 'text-emerald-600', bg: 'bg-emerald-50', label: '残業承認' },
  overtime_rejected: { icon: X, color: 'text-red-600', bg: 'bg-red-50', label: '残業却下' },
  shift_published: { icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50', label: 'シフト公開' },
  shift_changed: { icon: Calendar, color: 'text-orange-600', bg: 'bg-orange-50', label: 'シフト変更' },
  missing_clock: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: '打刻漏れ' },
  long_hours_warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', label: '長時間労働' },
  incident_submitted: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', label: 'インシデント' },
  incident_commented: { icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50', label: 'コメント' },
  approval_pending: { icon: ClipboardCheck, color: 'text-amber-600', bg: 'bg-amber-50', label: '承認待ち' },
  application_approved: { icon: Check, color: 'text-emerald-600', bg: 'bg-emerald-50', label: '承認完了' },
  application_rejected: { icon: X, color: 'text-red-600', bg: 'bg-red-50', label: '却下' },
  application_returned: { icon: RotateCcw, color: 'text-orange-600', bg: 'bg-orange-50', label: '差戻し' },
  payment_completed: { icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50', label: '支払完了' },
  payment_failed: { icon: Banknote, color: 'text-red-600', bg: 'bg-red-50', label: '支払失敗' },
  ai_anomaly_report: { icon: Brain, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'AI違和感' },
  ai_organization_health: { icon: Heart, color: 'text-pink-600', bg: 'bg-pink-50', label: '組織温度' },
  ai_todo_high: { icon: Flame, color: 'text-red-600', bg: 'bg-red-50', label: 'AI優先TODO' },
  ai_vp_ticket_created: { icon: ClipboardCheck, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'AIチケット' },
  business_scope_unclassified: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', label: '未分類警告' },
  unclassified_scope: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', label: '未分類警告' },
  mbr_action_created: { icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'MBR起票' },
  mbr_action_overdue: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: 'MBR期限超過' },
  vacancy_inquiry: { icon: Bell, color: 'text-blue-600', bg: 'bg-blue-50', label: '空室問い合わせ' },
  vacancy_inquiry_sla_breach: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', label: 'SLA超過' },
  vacancy_unit_updated: { icon: Bell, color: 'text-blue-600', bg: 'bg-blue-50', label: '空室更新' },
  vacancy_suggestion_created: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', label: '空室提案' },
  system: { icon: Bell, color: 'text-zinc-600', bg: 'bg-zinc-50', label: 'システム' },
};

// カテゴリ定義
type FilterCategory = 'all' | 'attendance' | 'approval' | 'ai' | 'vacancy' | 'other';

const FILTER_CATEGORIES: { key: FilterCategory; label: string; types: NotificationType[] }[] = [
  { key: 'all', label: 'すべて', types: [] },
  {
    key: 'attendance', label: '勤怠',
    types: ['clock_reminder', 'overtime_request', 'overtime_approved', 'overtime_rejected', 'shift_published', 'shift_changed', 'missing_clock', 'long_hours_warning'],
  },
  {
    key: 'approval', label: '承認・申請',
    types: ['approval_pending', 'application_approved', 'application_rejected', 'application_returned', 'payment_completed', 'payment_failed'],
  },
  {
    key: 'ai', label: 'AI副社長',
    types: ['ai_anomaly_report', 'ai_organization_health', 'ai_todo_high', 'ai_vp_ticket_created'],
  },
  {
    key: 'vacancy', label: '空室',
    types: ['vacancy_inquiry', 'vacancy_inquiry_sla_breach', 'vacancy_unit_updated', 'vacancy_suggestion_created'],
  },
  {
    key: 'other', label: 'その他',
    types: ['incident_submitted', 'incident_commented', 'business_scope_unclassified', 'unclassified_scope', 'mbr_action_created', 'mbr_action_overdue', 'system'],
  },
];

function formatDateTime(value: Date | unknown): string {
  const date = toDate(value);
  if (!date) return '-';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'たった今';
  if (diffMins < 60) return `${diffMins}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays < 7) return `${diffDays}日前`;
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'read'>('all');

  useEffect(() => {
    if (!user?.id) return;
    const unsubNotifications = subscribeToNotifications(user.id, setNotifications, 200);
    const unsubCount = subscribeToUnreadCount(user.id, setUnreadCount);
    return () => {
      unsubNotifications();
      unsubCount();
    };
  }, [user?.id]);

  const handleClick = useCallback(async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  }, [router]);

  const handleMarkAllRead = useCallback(async () => {
    if (!user?.id) return;
    await markAllAsRead(user.id);
  }, [user?.id]);

  // フィルタ適用
  const filtered = notifications.filter((n) => {
    if (filterStatus === 'unread' && n.read) return false;
    if (filterStatus === 'read' && !n.read) return false;
    if (filterCategory !== 'all') {
      const cat = FILTER_CATEGORIES.find((c) => c.key === filterCategory);
      if (cat && !cat.types.includes(n.type)) return false;
    }
    return true;
  });

  // 日付グループ化
  const grouped = groupByDate(filtered);

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-zinc-500">ログインしてください</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">通知センター</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {unreadCount > 0 ? `${unreadCount}件の未読通知` : '未読通知なし'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              すべて既読
            </button>
          )}
          <Link
            href="/settings/notifications"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
            通知設定
          </Link>
        </div>
      </div>

      {/* フィルタ */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-600">フィルタ</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {FILTER_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setFilterCategory(cat.key)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg font-medium transition-colors',
                filterCategory === cat.key
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['all', 'unread', 'read'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg font-medium transition-colors',
                filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              )}
            >
              {status === 'all' ? 'すべて' : status === 'unread' ? '未読' : '既読'}
            </button>
          ))}
        </div>
      </div>

      {/* 通知リスト */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 py-16 text-center">
          <Inbox className="w-12 h-12 mx-auto mb-3 text-zinc-300" />
          <p className="text-zinc-500 font-medium">通知はありません</p>
          <p className="text-sm text-zinc-400 mt-1">
            {filterCategory !== 'all' || filterStatus !== 'all'
              ? 'フィルタ条件を変更してみてください'
              : '新しい通知が届くとここに表示されます'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ label, items }) => (
            <div key={label}>
              <h3 className="text-sm font-medium text-zinc-500 mb-2 px-1">{label}</h3>
              <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden">
                {items.map((notification) => {
                  const config = NOTIFICATION_CONFIG[notification.type];
                  const Icon = config.icon;

                  return (
                    <button
                      key={notification.id}
                      onClick={() => handleClick(notification)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors',
                        notification.read
                          ? 'bg-white hover:bg-zinc-50'
                          : 'bg-blue-50/40 hover:bg-blue-50/70'
                      )}
                    >
                      <div className={cn('p-2 rounded-xl shrink-0 mt-0.5', config.bg)}>
                        <Icon className={cn('w-4 h-4', config.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded font-medium',
                            config.bg, config.color
                          )}>
                            {config.label}
                          </span>
                          <span className="text-xs text-zinc-400">
                            {formatDateTime(notification.createdAt)}
                          </span>
                        </div>
                        <p className={cn(
                          'text-sm mt-1',
                          notification.read ? 'text-zinc-600' : 'text-zinc-900 font-medium'
                        )}>
                          {notification.title}
                        </p>
                        {notification.message && notification.message !== notification.title && (
                          <p className="text-sm text-zinc-500 mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                        )}
                      </div>
                      {!notification.read && (
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 mt-3" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 通知を日付でグループ化 */
function groupByDate(notifications: Notification[]): { label: string; items: Notification[] }[] {
  const groups = new Map<string, Notification[]>();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  for (const n of notifications) {
    const date = toDate(n.createdAt);
    if (!date) continue;

    let label: string;
    if (date >= today) {
      label = '今日';
    } else if (date >= yesterday) {
      label = '昨日';
    } else if (date >= weekAgo) {
      label = '今週';
    } else {
      label = date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
    }

    const group = groups.get(label) || [];
    group.push(n);
    groups.set(label, group);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}
