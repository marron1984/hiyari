'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  Bell,
  Filter,
  Eye,
  EyeOff,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  Clock,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import type { AnnouncementListItem, AnnouncementPriority } from '@/lib/announcements/types';
import { useApiFetch } from '@/hooks/useApiFetch';

// 優先度設定
const PRIORITY_CONFIG: Record<
  AnnouncementPriority,
  { label: string; icon: typeof AlertCircle; color: string; bgColor: string }
> = {
  urgent: {
    label: '緊急',
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50 border-red-200',
  },
  high: {
    label: '重要',
    icon: AlertTriangle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 border-orange-200',
  },
  normal: {
    label: '通常',
    icon: Info,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
  },
  low: {
    label: '低',
    icon: Info,
    color: 'text-zinc-500',
    bgColor: 'bg-zinc-50 border-zinc-200',
  },
};

export default function AnnouncementsPage() {
  const apiFetch = useApiFetch();
  const [announcements, setAnnouncements] = useState<AnnouncementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState<string | null>(null);

  // データ取得
  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showOnlyUnread) params.set('onlyUnread', 'true');

      const res = await apiFetch(`/api/announcements?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data.announcements);
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error('Failed to fetch announcements:', err);
    } finally {
      setLoading(false);
    }
  }, [showOnlyUnread, apiFetch]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  // 周知を展開＆既読化
  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(id);

    // 未読なら既読化
    const announcement = announcements.find((a) => a.id === id);
    if (announcement && !announcement.isRead) {
      setMarkingRead(id);
      try {
        const res = await apiFetch('/api/read-receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: 'announcement',
            entityId: id,
          }),
        });

        if (res.ok) {
          // ローカル状態を更新
          setAnnouncements((prev) =>
            prev.map((a) => (a.id === id ? { ...a, isRead: true } : a))
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch (err) {
        console.error('Failed to mark read:', err);
      } finally {
        setMarkingRead(null);
      }
    }
  };

  // 日時フォーマット
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今日';
    if (days === 1) return '昨日';
    if (days < 7) return `${days}日前`;

    return d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-zinc-700" />
            <h1 className="text-xl font-bold">周知事項</h1>
            {unreadCount > 0 && (
              <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">
                {unreadCount}件未読
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={fetchAnnouncements}>
            <RefreshCw className="w-4 h-4 mr-1" />
            更新
          </Button>
        </div>

        {/* フィルタ */}
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant={showOnlyUnread ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setShowOnlyUnread(!showOnlyUnread)}
          >
            {showOnlyUnread ? (
              <EyeOff className="w-4 h-4 mr-1" />
            ) : (
              <Filter className="w-4 h-4 mr-1" />
            )}
            {showOnlyUnread ? '未読のみ表示中' : '未読のみ'}
          </Button>
        </div>

        {/* 周知一覧 */}
        {announcements.length === 0 ? (
          <Card>
            <div className="p-8 text-center text-zinc-500">
              {showOnlyUnread ? '未読の周知事項はありません' : '周知事項がありません'}
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {announcements.map((ann) => {
              const config = PRIORITY_CONFIG[ann.priority];
              const Icon = config.icon;
              const isExpanded = expandedId === ann.id;

              return (
                <Card
                  key={ann.id}
                  className={`overflow-hidden transition-all ${
                    !ann.isRead ? 'ring-2 ring-blue-400' : ''
                  }`}
                >
                  <div
                    className={`p-4 cursor-pointer ${config.bgColor} border-b`}
                    onClick={() => handleExpand(ann.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Icon className={`w-5 h-5 mt-0.5 ${config.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {!ann.isRead && (
                              <span className="px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded">
                                未読
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.5 text-xs rounded ${config.color} bg-white`}
                            >
                              {config.label}
                            </span>
                          </div>
                          <h3 className="font-semibold mt-1 text-zinc-900">{ann.title}</h3>
                          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {ann.publishedAt ? formatDate(ann.publishedAt) : '未公開'}
                            </span>
                            <span>{ann.authorName}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {ann.isRead && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                        {markingRead === ann.id ? (
                          <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                        ) : (
                          <ChevronDown
                            className={`w-5 h-5 text-zinc-400 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 bg-white">
                      <div className="prose prose-sm max-w-none text-zinc-700 whitespace-pre-wrap">
                        {ann.content}
                      </div>
                      {ann.expiresAt && (
                        <div className="mt-4 pt-4 border-t text-sm text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            期限：{new Date(ann.expiresAt).toLocaleDateString('ja-JP')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
