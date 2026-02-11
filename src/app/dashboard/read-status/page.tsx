'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { useRole } from '@/contexts/RoleContext';
import {
  Eye,
  EyeOff,
  Bell,
  Users,
  BarChart3,
  ChevronRight,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { AnnouncementListItem } from '@/lib/announcements/types';
import type { ReadStats, UnreadUser } from '@/lib/readTracking/types';
import { useApiFetch } from '@/hooks/useApiFetch';

interface AnnouncementWithStats extends AnnouncementListItem {
  stats?: ReadStats & { unreadUsers: UnreadUser[] };
}

export default function ReadStatusPage() {
  const apiFetch = useApiFetch();
  const { currentRole } = useRole();
  const isManager = ['admin', 'executive', 'manager'].includes(currentRole);

  const [announcements, setAnnouncements] = useState<AnnouncementWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState<string | null>(null);
  const [myUnreadCount, setMyUnreadCount] = useState(0);

  // データ取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/announcements?all=true');
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data.announcements);
        setMyUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 既読統計を取得（管理者のみ）
  const fetchStats = async (announcementId: string) => {
    if (loadingStats === announcementId) return;

    setLoadingStats(announcementId);
    try {
      const res = await apiFetch(`/api/announcements/${announcementId}/read-stats`);
      if (res.ok) {
        const stats = await res.json();
        setAnnouncements((prev) =>
          prev.map((a) =>
            a.id === announcementId ? { ...a, stats } : a
          )
        );
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoadingStats(null);
    }
  };

  // 周知を選択
  const handleSelect = (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }

    setSelectedId(id);

    // 管理者なら統計を取得
    if (isManager) {
      const ann = announcements.find((a) => a.id === id);
      if (ann && !ann.stats) {
        fetchStats(id);
      }
    }
  };

  // 日時フォーマット
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return <Loading />;
  }

  // スタッフ/リーダー向けビュー
  if (!isManager) {
    const unreadAnnouncements = announcements.filter((a) => !a.isRead);

    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />

        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Eye className="w-6 h-6 text-zinc-700" />
              <h1 className="text-xl font-bold">既読管理</h1>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" />
              更新
            </Button>
          </div>

          {/* 未読サマリー */}
          <Card className="mb-6">
            <div className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <EyeOff className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">{myUnreadCount}</div>
                  <div className="text-sm text-zinc-500">未読の周知事項</div>
                </div>
              </div>
            </div>
          </Card>

          {/* 未読一覧 */}
          <Card>
            <div className="p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4" />
                未読の周知事項
              </h2>
            </div>
            {unreadAnnouncements.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>すべての周知事項を確認済みです</p>
              </div>
            ) : (
              <div className="divide-y">
                {unreadAnnouncements.map((ann) => (
                  <Link
                    key={ann.id}
                    href="/dashboard/announcements"
                    className="flex items-center justify-between p-4 hover:bg-zinc-50"
                  >
                    <div>
                      <span className="px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded mr-2">
                        未読
                      </span>
                      <span className="font-medium">{ann.title}</span>
                      <div className="text-xs text-zinc-500 mt-1">
                        {ann.publishedAt && formatDate(ann.publishedAt)} - {ann.authorName}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </main>
      </div>
    );
  }

  // 管理者向けビュー
  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-zinc-700" />
            <h1 className="text-xl font-bold">既読管理（管理者）</h1>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-1" />
            更新
          </Button>
        </div>

        {/* 統計サマリー */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <div className="p-4 flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Bell className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{announcements.length}</div>
                <div className="text-sm text-zinc-500">公開中の周知</div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="p-4 flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Eye className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {announcements.filter((a) => a.isRead).length}
                </div>
                <div className="text-sm text-zinc-500">あなたの既読</div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="p-4 flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-lg">
                <EyeOff className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{myUnreadCount}</div>
                <div className="text-sm text-zinc-500">あなたの未読</div>
              </div>
            </div>
          </Card>
        </div>

        {/* 周知一覧（既読率付き） */}
        <Card>
          <div className="p-4 border-b">
            <h2 className="font-semibold">周知事項の既読状況</h2>
            <p className="text-sm text-zinc-500 mt-1">
              行をクリックすると詳細な既読統計を表示します
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left">タイトル</th>
                  <th className="px-4 py-3 text-left">公開日</th>
                  <th className="px-4 py-3 text-left">作成者</th>
                  <th className="px-4 py-3 text-left">既読率</th>
                  <th className="px-4 py-3 text-left">未読者数</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {announcements.map((ann) => {
                  const isSelected = selectedId === ann.id;
                  const stats = ann.stats;

                  return (
                    <React.Fragment key={ann.id}>
                      <tr
                        className="hover:bg-zinc-50 cursor-pointer"
                        onClick={() => handleSelect(ann.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {!ann.isRead && (
                              <span className="px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded">
                                未読
                              </span>
                            )}
                            <span className="font-medium">{ann.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-600">
                          {ann.publishedAt ? formatDate(ann.publishedAt) : '-'}
                        </td>
                        <td className="px-4 py-3 text-zinc-600">{ann.authorName}</td>
                        <td className="px-4 py-3">
                          {stats ? (
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-zinc-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    stats.readRate >= 80
                                      ? 'bg-green-500'
                                      : stats.readRate >= 50
                                      ? 'bg-yellow-500'
                                      : 'bg-red-500'
                                  }`}
                                  style={{ width: `${stats.readRate}%` }}
                                />
                              </div>
                              <span className="text-xs">{stats.readRate}%</span>
                            </div>
                          ) : loadingStats === ann.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
                          ) : (
                            <span className="text-zinc-400">クリックで取得</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {stats ? (
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                stats.unreadCount === 0
                                  ? 'bg-green-100 text-green-700'
                                  : stats.unreadCount <= 3
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {stats.unreadCount}名
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                      {isSelected && stats && (
                        <tr className="bg-zinc-50">
                          <td colSpan={5} className="px-4 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <h3 className="font-semibold mb-2 flex items-center gap-2">
                                  <BarChart3 className="w-4 h-4" />
                                  既読統計
                                </h3>
                                <div className="grid grid-cols-3 gap-3 text-center">
                                  <div className="p-2 bg-white rounded border">
                                    <div className="text-lg font-bold">{stats.targetCount}</div>
                                    <div className="text-xs text-zinc-500">対象者</div>
                                  </div>
                                  <div className="p-2 bg-white rounded border">
                                    <div className="text-lg font-bold text-green-600">
                                      {stats.readCount}
                                    </div>
                                    <div className="text-xs text-zinc-500">既読</div>
                                  </div>
                                  <div className="p-2 bg-white rounded border">
                                    <div className="text-lg font-bold text-red-600">
                                      {stats.unreadCount}
                                    </div>
                                    <div className="text-xs text-zinc-500">未読</div>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <h3 className="font-semibold mb-2 flex items-center gap-2">
                                  <Users className="w-4 h-4" />
                                  未読者一覧
                                </h3>
                                {stats.unreadUsers.length === 0 ? (
                                  <div className="p-2 bg-white rounded border text-center text-zinc-500">
                                    <CheckCircle className="w-4 h-4 mx-auto mb-1 text-green-500" />
                                    全員が既読
                                  </div>
                                ) : (
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {stats.unreadUsers.map((user) => (
                                      <div
                                        key={user.id}
                                        className="flex items-center justify-between p-2 bg-white rounded border text-sm"
                                      >
                                        <span>{user.name}</span>
                                        <span className="text-xs text-zinc-400">{user.role}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
