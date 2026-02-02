'use client';

/**
 * 未分類管理画面
 *
 * Implementation Ticket 034: 未分類を現場で即解消できるUI + 一括付与
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, CheckSquare, Square, Building2, Search, RefreshCw } from 'lucide-react';

// ========== 型定義 ==========

interface UnclassifiedItem {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  hint: string;
  suggestedBuId?: string | null;
  suggestedBuName?: string | null;
}

interface BusinessUnit {
  id: string;
  name: string;
  shortName?: string;
}

type EntityType = 'tickets' | 'repairs' | 'correctiveActions';

const TAB_CONFIG: { type: EntityType; label: string; apiPath: string }[] = [
  { type: 'tickets', label: 'チケット', apiPath: '/api/admin/unclassified/tickets' },
  { type: 'repairs', label: '修繕', apiPath: '/api/admin/unclassified/repairs' },
  { type: 'correctiveActions', label: '是正措置', apiPath: '/api/admin/unclassified/corrective-actions' },
];

// ========== コンポーネント ==========

export default function UnclassifiedPage() {
  const [activeTab, setActiveTab] = useState<EntityType>('tickets');
  const [items, setItems] = useState<UnclassifiedItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [targetBuId, setTargetBuId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 事業単位一覧を取得
  useEffect(() => {
    fetch('/api/business/units')
      .then((res) => res.json())
      .then((data) => {
        if (data.items) {
          setBusinessUnits(data.items);
        }
      })
      .catch(console.error);
  }, []);

  // 未分類一覧を取得
  const fetchItems = async () => {
    setIsLoading(true);
    setSelectedIds(new Set());
    setMessage(null);

    const tabConfig = TAB_CONFIG.find((t) => t.type === activeTab);
    if (!tabConfig) return;

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      params.set('limit', '100');

      const res = await fetch(`${tabConfig.apiPath}?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setItems(data.items);
        setTotalCount(data.totalCount);
      } else {
        setMessage({ type: 'error', text: data.error || '取得に失敗しました' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '通信エラーが発生しました' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [activeTab]);

  // 検索
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchItems();
  };

  // 選択操作
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(items.map((i) => i.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // 一括付与
  const handleAssign = async () => {
    if (selectedIds.size === 0) {
      setMessage({ type: 'error', text: '対象を選択してください' });
      return;
    }
    if (!targetBuId) {
      setMessage({ type: 'error', text: '付与先の事業単位を選択してください' });
      return;
    }

    const targetBu = businessUnits.find((bu) => bu.id === targetBuId);
    const confirmMsg = `${selectedIds.size}件に「${targetBu?.name || targetBuId}」を付与します。よろしいですか？`;

    if (!confirm(confirmMsg)) return;

    setIsAssigning(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/unclassified/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: activeTab,
          ids: Array.from(selectedIds),
          targetBusinessUnitId: targetBuId,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: `${data.affectedCount}件に事業単位を付与しました（${data.skippedCount}件スキップ）`,
        });
        setSelectedIds(new Set());
        setTargetBuId('');
        // 一覧を再取得
        fetchItems();
      } else {
        setMessage({ type: 'error', text: data.error || '付与に失敗しました' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '通信エラーが発生しました' });
    } finally {
      setIsAssigning(false);
    }
  };

  // 日付フォーマット
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
          未分類レコード管理
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          businessUnitId が未設定のレコードを確認し、事業単位を一括付与できます
        </p>
      </div>

      {/* メッセージ */}
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* タブ */}
      <div className="flex gap-1 mb-4 border-b border-zinc-200">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.type}
            onClick={() => setActiveTab(tab.type)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.type
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 検索・操作バー */}
      <div className="flex flex-wrap gap-4 items-center mb-4">
        {/* 検索 */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="タイトル・ヒントで検索..."
              className="pl-9 pr-4 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 bg-zinc-100 text-zinc-700 rounded-lg text-sm hover:bg-zinc-200"
          >
            検索
          </button>
        </form>

        {/* 更新ボタン */}
        <button
          onClick={fetchItems}
          disabled={isLoading}
          className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          更新
        </button>

        {/* 件数 */}
        <span className="text-sm text-zinc-500">
          {totalCount}件
          {selectedIds.size > 0 && ` / ${selectedIds.size}件選択中`}
        </span>

        {/* 選択操作 */}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={selectAll}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            全選択
          </button>
          <button
            onClick={clearSelection}
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            選択解除
          </button>
        </div>
      </div>

      {/* 一括付与パネル */}
      {selectedIds.size > 0 && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">
                {selectedIds.size}件に事業単位を付与
              </span>
            </div>
            <select
              value={targetBuId}
              onChange={(e) => setTargetBuId(e.target.value)}
              className="px-3 py-2 border border-blue-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">事業単位を選択...</option>
              {businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>
                  {bu.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleAssign}
              disabled={isAssigning || !targetBuId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAssigning ? '処理中...' : '付与する'}
            </button>
          </div>
        </div>
      )}

      {/* テーブル */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-zinc-500">
            読み込み中...
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            未分類のレコードはありません
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === items.length && items.length > 0}
                    onChange={() => {
                      if (selectedIds.size === items.length) {
                        clearSelection();
                      } else {
                        selectAll();
                      }
                    }}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  タイトル
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  ステータス
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  ヒント
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  作成日
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-zinc-50 cursor-pointer ${
                    selectedIds.has(item.id) ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => toggleSelect(item.id)}
                >
                  <td className="px-4 py-3">
                    {selectedIds.has(item.id) ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5 text-zinc-300" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-zinc-900">{item.title}</div>
                    <div className="text-xs text-zinc-400">{item.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {item.hint}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {formatDate(item.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* フッター */}
      <div className="mt-4 text-xs text-zinc-400">
        ※ 一括付与は、現在 businessUnitId が未設定のレコードのみが対象となります（安全装置）
      </div>
    </div>
  );
}
