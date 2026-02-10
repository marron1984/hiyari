'use client';

import { useState } from 'react';
import {
  Package,
  Search,
} from 'lucide-react';

interface InventoryItem {
  id: string;
  name: string;
  category: 'consumable' | 'equipment' | 'medical' | 'office' | 'other';
  currentStock: number;
  minStock: number;
  unit: string;
  location: string;
  lastOrderedAt: string | null;
  status: 'ok' | 'low' | 'critical' | 'out_of_stock';
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ok: { label: '在庫あり', color: 'text-green-700', bg: 'bg-green-50' },
  low: { label: '残少', color: 'text-amber-700', bg: 'bg-amber-50' },
  critical: { label: '要発注', color: 'text-orange-700', bg: 'bg-orange-50' },
  out_of_stock: { label: '在庫切れ', color: 'text-red-700', bg: 'bg-red-50' },
};

const CATEGORY_LABELS: Record<string, string> = {
  consumable: '消耗品',
  equipment: '設備',
  medical: '医療用品',
  office: '事務用品',
  other: 'その他',
};

type TabType = 'all' | 'low' | 'critical';

const DEMO_DATA: InventoryItem[] = [
  { id: '1', name: '使い捨て手袋（M）', category: 'consumable', currentStock: 120, minStock: 50, unit: '箱', location: '1F倉庫', lastOrderedAt: '2026-01-20', status: 'ok' },
  { id: '2', name: 'おむつ（Lサイズ）', category: 'consumable', currentStock: 15, minStock: 30, unit: 'パック', location: '各階倉庫', lastOrderedAt: '2026-01-15', status: 'critical' },
  { id: '3', name: '消毒用アルコール', category: 'medical', currentStock: 8, minStock: 10, unit: 'L', location: 'ナースステーション', lastOrderedAt: '2026-02-01', status: 'low' },
  { id: '4', name: 'コピー用紙（A4）', category: 'office', currentStock: 0, minStock: 5, unit: '箱', location: '事務室', lastOrderedAt: '2025-12-10', status: 'out_of_stock' },
  { id: '5', name: '車椅子クッション', category: 'equipment', currentStock: 3, minStock: 2, unit: '個', location: 'リハビリ室', lastOrderedAt: '2025-11-01', status: 'ok' },
  { id: '6', name: 'ペーパータオル', category: 'consumable', currentStock: 22, minStock: 20, unit: 'パック', location: '1F倉庫', lastOrderedAt: '2026-02-05', status: 'low' },
];

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const tabs: { id: TabType; label: string }[] = [
    { id: 'all', label: 'すべて' },
    { id: 'low', label: '残少' },
    { id: 'critical', label: '要発注' },
  ];

  const filtered = DEMO_DATA.filter((item) => {
    if (activeTab === 'low') return item.status === 'low';
    if (activeTab === 'critical') return item.status === 'critical' || item.status === 'out_of_stock';
    return true;
  }).filter((item) => {
    if (!searchQuery) return true;
    return item.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const stats = {
    total: DEMO_DATA.length,
    ok: DEMO_DATA.filter((i) => i.status === 'ok').length,
    low: DEMO_DATA.filter((i) => i.status === 'low').length,
    needsOrder: DEMO_DATA.filter((i) => i.status === 'critical' || i.status === 'out_of_stock').length,
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 safe-bottom">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-900">
          <Package className="w-6 h-6" />
          備品在庫管理
        </h1>
        <p className="text-sm text-zinc-500 mt-1">消耗品・設備の在庫状況と発注管理</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-zinc-900">{stats.total}</p>
          <p className="text-xs text-zinc-500">全品目</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.ok}</p>
          <p className="text-xs text-zinc-500">在庫十分</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.low}</p>
          <p className="text-xs text-zinc-500">残少</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{stats.needsOrder}</p>
          <p className="text-xs text-zinc-500">要発注</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="品目名で検索..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>該当する備品はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const statusCfg = STATUS_CONFIG[item.status];
            const stockRatio = item.minStock > 0 ? item.currentStock / item.minStock : 1;

            return (
              <div key={item.id} className={`bg-white border rounded-xl p-4 hover:border-zinc-300 transition-colors ${item.status === 'out_of_stock' ? 'border-red-200' : item.status === 'critical' ? 'border-orange-200' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      <span className="text-xs text-zinc-500">{CATEGORY_LABELS[item.category]}</span>
                    </div>
                    <h3 className="font-medium text-zinc-900">{item.name}</h3>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-zinc-500">在庫: <span className="font-medium text-zinc-700">{item.currentStock}{item.unit}</span></span>
                          <span className="text-zinc-400">基準: {item.minStock}{item.unit}</span>
                        </div>
                        <div className="w-full bg-zinc-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${stockRatio >= 1 ? 'bg-green-500' : stockRatio >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(stockRatio * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400 flex-wrap">
                      <span>{item.location}</span>
                      {item.lastOrderedAt && (
                        <span>最終発注: {new Date(item.lastOrderedAt).toLocaleDateString('ja-JP')}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
