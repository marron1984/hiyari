'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import {
  Shield,
  ShieldOff,
  AlertTriangle,
  Ban,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  FileText,
  Activity,
} from 'lucide-react';
import type { SpamRule, SpamEvent, BlocklistEntry, SpamAction } from '@/lib/spam/types';

// アクション別アイコン
const ACTION_CONFIG: Record<SpamAction, { icon: React.ReactNode; color: string; bg: string }> = {
  allow: { icon: <Shield className="w-4 h-4" />, color: 'text-green-600', bg: 'bg-green-100' },
  warn: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  throttle: { icon: <Activity className="w-4 h-4" />, color: 'text-orange-600', bg: 'bg-orange-100' },
  block: { icon: <Ban className="w-4 h-4" />, color: 'text-red-600', bg: 'bg-red-100' },
};

// タブ
type TabType = 'rules' | 'blocklist' | 'events';

export default function SpamDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>('rules');
  const [loading, setLoading] = useState(true);

  // ルール
  const [rules, setRules] = useState<SpamRule[]>([]);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [newRule, setNewRule] = useState({
    type: 'ng_word' as 'ng_word' | 'regex',
    pattern: '',
    severity: 'warn' as 'warn' | 'block',
    description: '',
  });

  // ブロックリスト
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);
  const [showBlocklistModal, setShowBlocklistModal] = useState(false);
  const [newBlocklist, setNewBlocklist] = useState({
    kind: 'email' as 'ip' | 'email' | 'phone' | 'ref',
    value: '',
    reason: '',
    expiresAt: '',
  });

  // イベント
  const [events, setEvents] = useState<SpamEvent[]>([]);
  const [stats, setStats] = useState<{ total: number; byAction: Record<string, number> }>({
    total: 0,
    byAction: {},
  });

  // データ取得
  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/spam-rules');
      const data = await res.json();
      setRules(data.rules || []);
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    }
  }, []);

  const fetchBlocklist = useCallback(async () => {
    try {
      const res = await fetch('/api/spam-blocklist');
      const data = await res.json();
      setBlocklist(data.entries || []);
    } catch (error) {
      console.error('Failed to fetch blocklist:', error);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/spam-events?limit=100');
      const data = await res.json();
      setEvents(data.events || []);
      setStats(data.stats || { total: 0, byAction: {} });
    } catch (error) {
      console.error('Failed to fetch events:', error);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRules(), fetchBlocklist(), fetchEvents()]);
    setLoading(false);
  }, [fetchRules, fetchBlocklist, fetchEvents]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ルール作成
  const handleCreateRule = async () => {
    try {
      const res = await fetch('/api/spam-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });

      if (res.ok) {
        setShowRuleModal(false);
        setNewRule({ type: 'ng_word', pattern: '', severity: 'warn', description: '' });
        fetchRules();
      } else {
        const data = await res.json();
        alert(data.error || 'ルールの作成に失敗しました');
      }
    } catch (error) {
      console.error('Failed to create rule:', error);
    }
  };

  // ブロックリスト追加
  const handleAddBlocklist = async () => {
    try {
      const res = await fetch('/api/spam-blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newBlocklist,
          expiresAt: newBlocklist.expiresAt || null,
        }),
      });

      if (res.ok) {
        setShowBlocklistModal(false);
        setNewBlocklist({ kind: 'email', value: '', reason: '', expiresAt: '' });
        fetchBlocklist();
      } else {
        const data = await res.json();
        alert(data.error || '追加に失敗しました');
      }
    } catch (error) {
      console.error('Failed to add to blocklist:', error);
    }
  };

  // ブロックリスト削除
  const handleRemoveBlocklist = async (id: string) => {
    if (!confirm('この項目を削除しますか？')) return;

    try {
      const res = await fetch(`/api/spam-blocklist?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchBlocklist();
      }
    } catch (error) {
      console.error('Failed to remove from blocklist:', error);
    }
  };

  // 日時フォーマット
  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            迷惑フィルタ管理
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            NGワード・ブロックリスト・イベントログ
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="p-2 rounded-lg hover:bg-gray-100"
          title="更新"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Shield className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.byAction.allow ?? 0}</div>
              <div className="text-xs text-gray-500">Allow</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.byAction.warn ?? 0}</div>
              <div className="text-xs text-gray-500">Warn</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100">
              <Activity className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.byAction.throttle ?? 0}</div>
              <div className="text-xs text-gray-500">Throttle</div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100">
              <Ban className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.byAction.block ?? 0}</div>
              <div className="text-xs text-gray-500">Block</div>
            </div>
          </div>
        </Card>
      </div>

      {/* タブ */}
      <div className="border-b">
        <div className="flex gap-4">
          {[
            { key: 'rules' as TabType, label: 'ルール', icon: <FileText className="w-4 h-4" /> },
            { key: 'blocklist' as TabType, label: 'ブロックリスト', icon: <Ban className="w-4 h-4" /> },
            { key: 'events' as TabType, label: 'イベントログ', icon: <Eye className="w-4 h-4" /> },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ルールタブ */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowRuleModal(true)}>
              <Plus className="w-4 h-4 mr-1" />
              ルール追加
            </Button>
          </div>

          {rules.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">
              ルールがありません
            </Card>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <Card key={rule.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={rule.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                        {rule.enabled ? '有効' : '無効'}
                      </Badge>
                      <Badge className={rule.severity === 'block' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>
                        {rule.severity === 'block' ? 'Block' : 'Warn'}
                      </Badge>
                      <span className="text-sm text-gray-500">{rule.type}</span>
                      <code className="px-2 py-1 bg-gray-100 rounded text-sm">
                        {rule.pattern}
                      </code>
                    </div>
                    <div className="text-sm text-gray-400">
                      {rule.description}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ブロックリストタブ */}
      {activeTab === 'blocklist' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowBlocklistModal(true)}>
              <Plus className="w-4 h-4 mr-1" />
              追加
            </Button>
          </div>

          {blocklist.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">
              ブロックリストは空です
            </Card>
          ) : (
            <div className="space-y-2">
              {blocklist.map((entry) => (
                <Card key={entry.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-gray-100 text-gray-700">
                        {entry.kind}
                      </Badge>
                      <code className="px-2 py-1 bg-gray-100 rounded text-sm">
                        {entry.valueHash.slice(0, 16)}...
                      </code>
                      <span className="text-sm text-gray-600">{entry.reason}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {entry.expiresAt && (
                        <span className="text-xs text-gray-400">
                          期限: {formatDateTime(entry.expiresAt)}
                        </span>
                      )}
                      <button
                        onClick={() => handleRemoveBlocklist(entry.id)}
                        className="p-1 rounded hover:bg-red-100 text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* イベントログタブ */}
      {activeTab === 'events' && (
        <div className="space-y-2">
          {events.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">
              イベントがありません
            </Card>
          ) : (
            events.map((event) => {
              const config = ACTION_CONFIG[event.action];
              return (
                <Card key={event.id} className="p-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded ${config.bg}`}>
                      {config.icon}
                    </div>
                    <Badge className={`${config.bg} ${config.color}`}>
                      {event.action}
                    </Badge>
                    <span className="text-sm text-gray-700 flex-1">
                      {event.reason}
                    </span>
                    <span className="text-xs text-gray-400">
                      {event.ipHint || '-'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDateTime(event.occurredAt)}
                    </span>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ルール追加モーダル */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">ルール追加</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">タイプ</label>
                <select
                  value={newRule.type}
                  onChange={(e) => setNewRule({ ...newRule, type: e.target.value as 'ng_word' | 'regex' })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="ng_word">NGワード</option>
                  <option value="regex">正規表現</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">パターン</label>
                <input
                  type="text"
                  value={newRule.pattern}
                  onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                  placeholder="例: スパム, <script.*>"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">アクション</label>
                <select
                  value={newRule.severity}
                  onChange={(e) => setNewRule({ ...newRule, severity: e.target.value as 'warn' | 'block' })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="warn">Warn（通すが記録）</option>
                  <option value="block">Block（拒否）</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">説明（任意）</label>
                <input
                  type="text"
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                  placeholder="このルールの説明"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowRuleModal(false)}>
                キャンセル
              </Button>
              <Button className="flex-1" onClick={handleCreateRule} disabled={!newRule.pattern}>
                追加
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ブロックリスト追加モーダル */}
      {showBlocklistModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">ブロックリスト追加</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">種別</label>
                <select
                  value={newBlocklist.kind}
                  onChange={(e) => setNewBlocklist({ ...newBlocklist, kind: e.target.value as 'ip' | 'email' | 'phone' | 'ref' })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="ip">IPアドレス</option>
                  <option value="email">メールアドレス</option>
                  <option value="phone">電話番号</option>
                  <option value="ref">紹介コード</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">値</label>
                <input
                  type="text"
                  value={newBlocklist.value}
                  onChange={(e) => setNewBlocklist({ ...newBlocklist, value: e.target.value })}
                  placeholder="ブロックする値"
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">※ハッシュ化して保存されます</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">理由</label>
                <input
                  type="text"
                  value={newBlocklist.reason}
                  onChange={(e) => setNewBlocklist({ ...newBlocklist, reason: e.target.value })}
                  placeholder="ブロック理由"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">有効期限（任意）</label>
                <input
                  type="datetime-local"
                  value={newBlocklist.expiresAt}
                  onChange={(e) => setNewBlocklist({ ...newBlocklist, expiresAt: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">※空欄で永久ブロック</p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowBlocklistModal(false)}>
                キャンセル
              </Button>
              <Button
                className="flex-1"
                onClick={handleAddBlocklist}
                disabled={!newBlocklist.value || !newBlocklist.reason}
              >
                追加
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
