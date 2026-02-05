'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, Check, Clock, FileText, AlertTriangle, Calendar, MessageSquare, ClipboardCheck, RotateCcw, Brain, Heart, Flame, Banknote } from 'lucide-react';
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
const NOTIFICATION_CONFIG: Record<NotificationType, { icon: typeof Bell; color: string; bg: string }> = {
  clock_reminder: { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
  overtime_request: { icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50' },
  overtime_approved: { icon: Check, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  overtime_rejected: { icon: X, color: 'text-red-600', bg: 'bg-red-50' },
  shift_published: { icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
  shift_changed: { icon: Calendar, color: 'text-orange-600', bg: 'bg-orange-50' },
  missing_clock: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  long_hours_warning: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  incident_submitted: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
  incident_commented: { icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50' },
  // AA-HUB 申請通知
  approval_pending: { icon: ClipboardCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
  application_approved: { icon: Check, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  application_rejected: { icon: X, color: 'text-red-600', bg: 'bg-red-50' },
  application_returned: { icon: RotateCcw, color: 'text-orange-600', bg: 'bg-orange-50' },
  // 支払い通知
  payment_completed: { icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  payment_failed: { icon: Banknote, color: 'text-red-600', bg: 'bg-red-50' },
  // AI副社長
  ai_anomaly_report: { icon: Brain, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ai_organization_health: { icon: Heart, color: 'text-pink-600', bg: 'bg-pink-50' },
  ai_todo_high: { icon: Flame, color: 'text-red-600', bg: 'bg-red-50' },
  ai_vp_ticket_created: { icon: ClipboardCheck, color: 'text-indigo-600', bg: 'bg-indigo-50' },  // Task 043
  // Task 038: 未分類スコープ（正式名称 + レガシー）
  business_scope_unclassified: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  unclassified_scope: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  // Ticket 071: 空室問い合わせSLA超過
  vacancy_inquiry_sla_breach: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  // Ticket 075: 空室ユニット更新
  vacancy_unit_updated: { icon: Bell, color: 'text-blue-600', bg: 'bg-blue-50' },
  // Ticket 075: 空室更新提案
  vacancy_suggestion_created: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  system: { icon: Bell, color: 'text-zinc-600', bg: 'bg-zinc-50' },
};

// 相対時間表示（Firestore Timestamp / Date / string 対応）
function formatRelativeTime(value: Date | unknown): string {
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
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // 通知を購読
  useEffect(() => {
    if (!user?.id) return;

    const unsubNotifications = subscribeToNotifications(user.id, setNotifications);
    const unsubCount = subscribeToUnreadCount(user.id, setUnreadCount);

    return () => {
      unsubNotifications();
      unsubCount();
    };
  }, [user?.id]);

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // 通知クリック
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
    setIsOpen(false);
  };

  // 全て既読
  const handleMarkAllRead = async () => {
    if (!user?.id) return;
    await markAllAsRead(user.id);
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* ベルボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative p-2 rounded-xl transition-colors',
          isOpen ? 'bg-zinc-100' : 'hover:bg-zinc-100'
        )}
        aria-label="通知"
      >
        <Bell className="w-5 h-5 text-zinc-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 通知パネル */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-zinc-100 overflow-hidden z-50 animate-slide-down">
          {/* ヘッダー */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
            <h3 className="font-semibold text-zinc-900">通知</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                すべて既読
              </button>
            )}
          </div>

          {/* 通知リスト */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-zinc-400">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">通知はありません</p>
              </div>
            ) : (
              <ul>
                {notifications.map((notification) => {
                  const config = NOTIFICATION_CONFIG[notification.type];
                  const Icon = config.icon;

                  return (
                    <li key={notification.id}>
                      <button
                        onClick={() => handleNotificationClick(notification)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
                          notification.read
                            ? 'bg-white hover:bg-zinc-50'
                            : 'bg-blue-50/50 hover:bg-blue-50'
                        )}
                      >
                        <div className={cn('p-2 rounded-xl shrink-0', config.bg)}>
                          <Icon className={cn('w-4 h-4', config.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-sm',
                            notification.read ? 'text-zinc-600' : 'text-zinc-900 font-medium'
                          )}>
                            {notification.title}
                          </p>
                          <p className="text-sm text-zinc-500 mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-xs text-zinc-400 mt-1">
                            {formatRelativeTime(notification.createdAt)}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
