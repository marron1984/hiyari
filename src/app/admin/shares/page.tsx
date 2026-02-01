'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input } from '@/components/ui';
import type { SharePackage } from '@/lib/shares/types';
import {
  Share2,
  Plus,
  Copy,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  AlertTriangle,
  Eye,
  Trash2,
  Shield,
  Link as LinkIcon,
} from 'lucide-react';

type ShareListItem = {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'revoked' | 'expired';
  createdAt: string;
  createdByUserName?: string;
  expiresAt: string;
  accessCount: number;
  lastAccessedAt?: string;
};

type ShareStats = {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  totalAccesses: number;
};

export default function AdminSharesPage() {
  const [shares, setShares] = useState<ShareListItem[]>([]);
  const [stats, setStats] = useState<ShareStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newShareToken, setNewShareToken] = useState<string | null>(null);
  const [newShareUrl, setNewShareUrl] = useState<string | null>(null);

  // フォーム
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newExpiresInDays, setNewExpiresInDays] = useState(30);
  const [creating, setCreating] = useState(false);

  // 共有一覧を取得
  const fetchShares = async () => {
    try {
      const response = await fetch('/api/shares');
      const data = await response.json();
      if (data.success) {
        setShares(data.shares);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch shares:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
  }, []);

  // 共有作成
  const handleCreate = async () => {
    if (!newName.trim()) return;

    setCreating(true);
    try {
      const response = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          description: newDescription,
          expiresInDays: newExpiresInDays,
        }),
      });
      const data = await response.json();

      if (data.success) {
        setNewShareToken(data.token);
        setNewShareUrl(data.shareUrl);
        fetchShares();
      } else {
        alert(data.error || '作成に失敗しました');
      }
    } catch (error) {
      console.error('Failed to create share:', error);
      alert('作成に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  // 共有失効
  const handleRevoke = async (shareId: string) => {
    if (!confirm('この共有リンクを失効しますか？\n失効すると、リンクは使用できなくなります。')) {
      return;
    }

    try {
      const response = await fetch(`/api/shares/${shareId}/revoke`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        fetchShares();
      } else {
        alert(data.error || '失効に失敗しました');
      }
    } catch (error) {
      console.error('Failed to revoke share:', error);
      alert('失効に失敗しました');
    }
  };

  // クリップボードにコピー
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('クリップボードにコピーしました');
  };

  // ステータスバッジ
  const StatusBadge = ({ status }: { status: 'active' | 'revoked' | 'expired' }) => {
    if (status === 'active') {
      return (
        <Badge className="bg-green-100 text-green-700 text-xs">
          <CheckCircle className="w-3 h-3 mr-1" />
          有効
        </Badge>
      );
    }
    if (status === 'revoked') {
      return (
        <Badge className="bg-red-100 text-red-700 text-xs">
          <XCircle className="w-3 h-3 mr-1" />
          失効
        </Badge>
      );
    }
    return (
      <Badge className="bg-zinc-100 text-zinc-600 text-xs">
        <Clock className="w-3 h-3 mr-1" />
        期限切れ
      </Badge>
    );
  };

  // モーダルを閉じる
  const closeModal = () => {
    setShowCreateModal(false);
    setNewName('');
    setNewDescription('');
    setNewExpiresInDays(30);
    setNewShareToken(null);
    setNewShareUrl(null);
  };

  return (
    <main className="pb-8">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
              <Share2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">外部共有管理</h1>
              <p className="text-sm text-gray-500">
                金融機関・投資家向けダッシュボード共有
              </p>
            </div>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1" />
            新規共有を作成
          </Button>
        </div>

        {/* 注意事項 */}
        <Card className="mb-6 bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  外部共有に関する注意事項
                </p>
                <ul className="text-xs text-amber-700 mt-1 list-disc list-inside space-y-1">
                  <li>共有リンクは発行時点のスナップショット（凍結データ）です</li>
                  <li>トークンは発行時に一度だけ表示されます。安全に保管してください</li>
                  <li>不要になったリンクは速やかに失効してください</li>
                  <li>アクセスログは監査目的で記録されています</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 統計 */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-zinc-800">{stats.total}</p>
                <p className="text-sm text-zinc-500">総数</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{stats.active}</p>
                <p className="text-sm text-zinc-500">有効</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-red-600">{stats.revoked}</p>
                <p className="text-sm text-zinc-500">失効</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">{stats.totalAccesses}</p>
                <p className="text-sm text-zinc-500">総アクセス</p>
              </div>
            </Card>
          </div>
        )}

        {/* 共有一覧 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">共有リンク一覧</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-zinc-500">読み込み中...</div>
            ) : shares.length === 0 ? (
              <div className="text-center py-8">
                <LinkIcon className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                <p className="text-zinc-500">共有リンクはまだありません</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  最初の共有を作成
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {shares.map((share) => (
                  <div
                    key={share.id}
                    className={`p-4 rounded-lg border ${
                      share.status === 'active'
                        ? 'bg-white border-zinc-200'
                        : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{share.name}</span>
                          <StatusBadge status={share.status} />
                        </div>
                        {share.description && (
                          <p className="text-sm text-zinc-500 mb-2">
                            {share.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
                          <span>
                            作成: {new Date(share.createdAt).toLocaleDateString('ja-JP')}
                          </span>
                          <span>
                            期限: {new Date(share.expiresAt).toLocaleDateString('ja-JP')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {share.accessCount}回アクセス
                          </span>
                          {share.createdByUserName && (
                            <span>作成者: {share.createdByUserName}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {share.status === 'active' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevoke(share.id)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-600" />
                {newShareToken ? '共有リンク発行完了' : '新規外部共有を作成'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {newShareToken ? (
                <div>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                    <div className="flex items-center gap-2 text-green-700 mb-2">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">共有リンクを発行しました</span>
                    </div>
                    <p className="text-sm text-green-600">
                      以下のURLを外部共有先に送付してください
                    </p>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      共有URL
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={newShareUrl || ''}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        onClick={() => copyToClipboard(newShareUrl || '')}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">
                          重要：このトークンは一度だけ表示されます
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          URLを安全に保管してください。このダイアログを閉じると、
                          トークンは再表示できません。
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={closeModal}>閉じる</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">
                        共有名 <span className="text-red-500">*</span>
                      </label>
                      <Input
                        placeholder="例：〇〇銀行向け 2026年2月 共有"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">
                        説明（任意）
                      </label>
                      <Input
                        placeholder="例：融資審査用の経営状況レポート"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">
                        有効期限（日数）
                      </label>
                      <select
                        className="w-full border border-zinc-300 rounded-lg px-3 py-2"
                        value={newExpiresInDays}
                        onChange={(e) => setNewExpiresInDays(Number(e.target.value))}
                      >
                        <option value={7}>7日間</option>
                        <option value={14}>14日間</option>
                        <option value={30}>30日間</option>
                        <option value={60}>60日間</option>
                        <option value={90}>90日間</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 mt-6">
                    <Button variant="outline" onClick={closeModal}>
                      キャンセル
                    </Button>
                    <Button
                      onClick={handleCreate}
                      disabled={!newName.trim() || creating}
                    >
                      {creating ? '作成中...' : '共有を作成'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
