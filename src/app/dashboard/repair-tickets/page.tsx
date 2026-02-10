'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Wrench,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle,
  RefreshCw,
  Filter,
  MapPin,
  X,
} from 'lucide-react';
import type {
  RepairRecord,
  RepairStatus,
  RepairCategory,
  SafetyRisk,
  RepairStats,
} from '@/lib/repairs/types';
import {
  REPAIR_STATUS_CONFIG,
  SAFETY_RISK_CONFIG,
  REPAIR_CATEGORY_CONFIG,
} from '@/lib/repairs/types';

type TabType = 'all' | 'high_risk' | 'active' | 'overdue' | 'completed';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'すべて', icon: <Wrench className="w-4 h-4" /> },
  { id: 'high_risk', label: '高リスク', icon: <AlertTriangle className="w-4 h-4" /> },
  { id: 'active', label: '対応中', icon: <RefreshCw className="w-4 h-4" /> },
  { id: 'overdue', label: '期限超過', icon: <Clock className="w-4 h-4" /> },
  { id: 'completed', label: '完了', icon: <CheckCircle className="w-4 h-4" /> },
];

export default function RepairTicketsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [stats, setStats] = useState<RepairStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  // フィルタ
  const [statusFilter, setStatusFilter] = useState<RepairStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<RepairCategory | ''>('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 統計取得
      const statsRes = await fetch('/api/repairs/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // 一覧取得
      const params = new URLSearchParams();

      switch (activeTab) {
        case 'high_risk':
          params.append('safetyRisk', 'high');
          break;
        case 'active':
          // reported, assessing, scheduled, in_progress
          break;
        case 'overdue':
          params.append('overdue', 'true');
          break;
        case 'completed':
          params.append('status', 'completed');
          break;
      }

      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('category', categoryFilter);

      const repairsRes = await fetch(`/api/repairs?${params.toString()}`);
      if (repairsRes.ok) {
        const repairsData = await repairsRes.json();
        setRepairs(repairsData.repairs || []);
        setTotalCount(repairsData.total || 0);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, categoryFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 新規作成
  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch('/api/repairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.get('title'),
          description: formData.get('description'),
          category: formData.get('category') || undefined,
          safetyRisk: formData.get('safetyRisk') || undefined,
          location: formData.get('location') || undefined,
        }),
      });

      if (res.ok) {
        setShowNewModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('作成エラー:', error);
    }
  }

  // タブに応じたフィルタリング
  const filteredRepairs = repairs.filter((r) => {
    if (activeTab === 'active') {
      return ['reported', 'assessing', 'scheduled', 'in_progress'].includes(r.status);
    }
    return true;
  });

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 safe-bottom">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-900">
            <Wrench className="w-6 h-6" />
            修繕チケット
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            設備故障・修理依頼の進捗を追跡します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-zinc-50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            フィルタ
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新規修繕依頼
          </button>
        </div>
      </div>

      {/* 統計カード */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="text-sm text-zinc-500">オープン</div>
            <div className="text-2xl font-bold text-blue-600 tabular-nums">{stats.open}</div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="text-sm text-zinc-500">高リスク</div>
            <div className="text-2xl font-bold text-red-600 tabular-nums">{stats.highRiskOpen}</div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="text-sm text-zinc-500">期限超過</div>
            <div className="text-2xl font-bold text-amber-600 tabular-nums">{stats.overdue}</div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="text-sm text-zinc-500">今月完了</div>
            <div className="text-2xl font-bold text-green-600 tabular-nums">{stats.completedThisMonth}</div>
          </div>
        </div>
      )}

      {/* フィルタ */}
      {showFilters && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RepairStatus | '')}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">ステータス: すべて</option>
            {Object.entries(REPAIR_STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as RepairCategory | '')}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">カテゴリ: すべて</option>
            {Object.entries(REPAIR_CATEGORY_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* タブ */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'high_risk' && stats?.highRiskOpen ? (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full">
                {stats.highRiskOpen}
              </span>
            ) : null}
            {tab.id === 'overdue' && stats?.overdue ? (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                {stats.overdue}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* 一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
            <p className="text-sm text-zinc-500">読み込み中...</p>
          </div>
        </div>
      ) : filteredRepairs.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>修繕チケットはありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRepairs.map((repair) => {
            const statusCfg = REPAIR_STATUS_CONFIG[repair.status];
            const riskCfg = SAFETY_RISK_CONFIG[repair.safetyRisk];
            const catCfg = REPAIR_CATEGORY_CONFIG[repair.category];

            return (
              <div
                key={repair.id}
                className="bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${riskCfg.bg} ${riskCfg.color}`}>
                        {riskCfg.label}
                      </span>
                      {catCfg && (
                        <span className="text-xs text-zinc-500">
                          {catCfg.icon} {catCfg.label}
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-zinc-900">{repair.title}</h3>
                    <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{repair.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                      {repair.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {repair.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(repair.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                      {repair.dueAt && (
                        <span className={`flex items-center gap-1 ${
                          new Date(repair.dueAt) < new Date() && repair.status !== 'completed'
                            ? 'text-red-500 font-medium'
                            : ''
                        }`}>
                          期限: {new Date(repair.dueAt).toLocaleDateString('ja-JP')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 件数表示 */}
      {!loading && (
        <div className="mt-4 text-center text-sm text-zinc-400">
          {totalCount}件中 {filteredRepairs.length}件を表示
        </div>
      )}

      {/* 新規作成モーダル */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Plus className="w-5 h-5" />
                新規修繕依頼
              </h2>
              <button onClick={() => setShowNewModal(false)} className="p-2 hover:bg-zinc-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  タイトル <span className="text-red-500">*</span>
                </label>
                <input
                  name="title"
                  required
                  placeholder="例: 2F廊下の照明が点灯しない"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  詳細 <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="description"
                  required
                  placeholder="状況を詳しく記載..."
                  className="w-full border rounded-lg px-3 py-2 text-sm h-24 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">カテゴリ</label>
                  <select name="category" className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">選択...</option>
                    {Object.entries(REPAIR_CATEGORY_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">安全リスク</label>
                  <select name="safetyRisk" className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">選択...</option>
                    {Object.entries(SAFETY_RISK_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">場所</label>
                <input
                  name="location"
                  placeholder="例: 2F廊下"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-zinc-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800"
                >
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
