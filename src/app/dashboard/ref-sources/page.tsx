'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import {
  Building2,
  Users,
  Hospital,
  User,
  Plus,
  Copy,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
  ExternalLink,
} from 'lucide-react';
import type {
  RefSource,
  RefSourceType,
  RefSourceStatus,
} from '@/lib/refSources/types';
import {
  REF_SOURCE_TYPE_CONFIG,
  REF_SOURCE_STATUS_CONFIG,
} from '@/lib/refSources/types';
import type { BusinessUnit } from '@/lib/business/types';
import { useApiFetch } from '@/hooks/useApiFetch';

// タイプアイコン
const TYPE_ICONS: Record<RefSourceType, React.ReactNode> = {
  hospital: <Hospital className="w-4 h-4" />,
  care_manager: <User className="w-4 h-4" />,
  agency: <Building2 className="w-4 h-4" />,
  other: <Users className="w-4 h-4" />,
};

export default function RefSourcesPage() {
  const apiFetch = useApiFetch();
  const { toast } = useToast();
  const [sources, setSources] = useState<RefSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RefSourceStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<RefSourceType | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // 新規作成フォーム
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<RefSourceType>('hospital');
  const [newAllowedBUs, setNewAllowedBUs] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (typeFilter) params.append('type', typeFilter);
      if (searchQuery) params.append('q', searchQuery);

      const res = await apiFetch(`/api/ref-sources?${params.toString()}`);
      const data = await res.json();
      setSources(data.items || []);
    } catch (error) {
      console.error('Failed to fetch ref sources:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, searchQuery, apiFetch]);

  // 事業単位取得
  useEffect(() => {
    apiFetch('/api/business-units')
      .then((res) => res.json())
      .then((data) => setBusinessUnits(data.items || []))
      .catch(console.error);
  }, [apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ステータス切り替え
  const toggleStatus = async (ref: string, currentStatus: RefSourceStatus) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    try {
      const res = await apiFetch(`/api/ref-sources/${ref}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setSources((prev) =>
          prev.map((s) =>
            s.ref === ref ? { ...s, status: newStatus } : s
          )
        );
      }
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  // refコードをコピー
  const copyRefCode = async (ref: string) => {
    const url = `${window.location.origin}/vacancies?ref=${ref}`;
    await navigator.clipboard.writeText(url);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  // 新規作成
  const handleCreate = async () => {
    if (!newName) return;
    setCreating(true);
    try {
      const res = await apiFetch('/api/ref-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          type: newType,
          allowedBusinessUnitIds: newAllowedBUs.length > 0 ? newAllowedBUs : undefined,
          note: newNote || undefined,
        }),
      });

      if (res.ok) {
        // リセットと再取得
        setNewName('');
        setNewType('hospital');
        setNewAllowedBUs([]);
        setNewNote('');
        setShowCreateModal(false);
        fetchData();
      } else {
        const data = await res.json();
        toast(data.error || '作成に失敗しました', 'error');
      }
    } catch (error) {
      console.error('Failed to create:', error);
    } finally {
      setCreating(false);
    }
  };

  // 日付フォーマット
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ExternalLink className="w-6 h-6 text-blue-600" />
            紹介元（ref）管理
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            紹介会社・病院・ケアマネージャーからの流入を追跡
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2 rounded-lg hover:bg-gray-100"
            title="更新"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1" />
            新規作成
          </Button>
        </div>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <ExternalLink className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {sources.filter((s) => s.status === 'active').length}
              </div>
              <div className="text-xs text-gray-500">有効な紹介元</div>
            </div>
          </div>
        </Card>

        {(['hospital', 'care_manager', 'agency', 'other'] as RefSourceType[]).map((type) => (
          <Card
            key={type}
            className={`p-4 cursor-pointer ${typeFilter === type ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100">
                {TYPE_ICONS[type]}
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {sources.filter((s) => s.type === type).length}
                </div>
                <div className="text-xs text-gray-500">
                  {REF_SOURCE_TYPE_CONFIG[type].label}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* フィルター */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="検索..."
            className="pl-10 pr-4 py-2 border rounded-lg w-full text-sm"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RefSourceStatus | '')}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">全ステータス</option>
          <option value="active">有効のみ</option>
          <option value="disabled">無効のみ</option>
        </select>

        {(statusFilter || typeFilter) && (
          <button
            onClick={() => {
              setStatusFilter('');
              setTypeFilter('');
            }}
            className="text-sm text-blue-600 hover:underline"
          >
            フィルタをクリア
          </button>
        )}
      </div>

      {/* 一覧 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : sources.length === 0 ? (
        <Card className="p-12 text-center">
          <ExternalLink className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">紹介元がありません</p>
          <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1" />
            作成する
          </Button>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    refコード
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    紹介元名
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    タイプ
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    許可事業
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    ステータス
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    作成日
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sources.map((source) => {
                  const typeConfig = REF_SOURCE_TYPE_CONFIG[source.type];
                  const statusConfig = REF_SOURCE_STATUS_CONFIG[source.status];

                  return (
                    <tr key={source.ref} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <code className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                          {source.ref}
                        </code>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {source.name}
                        {source.note && (
                          <span className="block text-xs text-gray-400 mt-0.5">
                            {source.note}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          {TYPE_ICONS[source.type]}
                          {typeConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {source.allowedBusinessUnitIds.length === 0 ? (
                          <span className="text-gray-400">全事業</span>
                        ) : (
                          <span className="text-xs">
                            {source.allowedBusinessUnitIds
                              .map(
                                (id) =>
                                  businessUnits.find((b) => b.id === id)?.name ||
                                  id
                              )
                              .join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            toggleStatus(source.ref, source.status)
                          }
                          className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${statusConfig.bg} ${statusConfig.color}`}
                        >
                          {source.status === 'active' ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          {statusConfig.label}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(source.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => copyRefCode(source.ref)}
                          className="p-2 rounded hover:bg-gray-100 text-gray-500"
                          title="URLをコピー"
                        >
                          {copiedRef === source.ref ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 新規作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">紹介元を作成</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  紹介元名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例: ○○病院 地域連携室"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">タイプ</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as RefSourceType)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {Object.entries(REF_SOURCE_TYPE_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.icon} {config.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  許可事業（空欄で全事業許可）
                </label>
                <div className="space-y-1 max-h-32 overflow-y-auto border rounded-lg p-2">
                  {businessUnits.map((bu) => (
                    <label key={bu.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newAllowedBUs.includes(bu.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewAllowedBUs((prev) => [...prev, bu.id]);
                          } else {
                            setNewAllowedBUs((prev) =>
                              prev.filter((id) => id !== bu.id)
                            );
                          }
                        }}
                      />
                      {bu.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">メモ</label>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="任意のメモ"
                  className="w-full px-3 py-2 border rounded-lg h-20 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCreateModal(false)}
              >
                キャンセル
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={!newName || creating}
              >
                {creating ? '作成中...' : '作成'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
