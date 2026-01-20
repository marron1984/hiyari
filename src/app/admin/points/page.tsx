'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  Trophy, Plus, Minus, History, Users, Star
} from 'lucide-react';
import {
  getAllUserPoints, getAllPointHistory, adjustPoints
} from '@/lib/points';
import {
  UserPointSummary, PointHistory, POINT_RULES
} from '@/types/points';

type TabType = 'users' | 'history';

export default function AdminPointsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [users, setUsers] = useState<UserPointSummary[]>([]);
  const [history, setHistory] = useState<PointHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustModal, setAdjustModal] = useState<UserPointSummary | null>(null);
  const [adjustPoints_, setAdjustPoints] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  useEffect(() => {
    if (user) loadData();
  }, [user, activeTab]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const data = await getAllUserPoints(user.tenantId);
        setUsers(data);
      } else {
        const data = await getAllPointHistory(user.tenantId);
        setHistory(data);
      }
    } catch (error) {
      console.error('Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = async () => {
    if (!user || !adjustModal || adjustPoints_ === 0) {
      alert('ポイント数を入力してください');
      return;
    }
    if (!adjustReason.trim()) {
      alert('調整理由を入力してください');
      return;
    }

    setAdjustLoading(true);
    try {
      await adjustPoints({
        targetUserId: adjustModal.userId,
        targetUserName: adjustModal.userName,
        targetBranchId: adjustModal.branchId,
        points: adjustPoints_,
        description: adjustReason,
        adminId: user.id,
        adminName: user.name,
        adminRole: user.role,
        tenantId: user.tenantId,
      });
      setAdjustModal(null);
      setAdjustPoints(0);
      setAdjustReason('');
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : '調整に失敗しました');
    } finally {
      setAdjustLoading(false);
    }
  };

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-6 safe-top safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-zinc-900">ポイント管理</h1>
          <Badge className="bg-amber-100 text-amber-700">
            <Star className="w-3 h-3 mr-1" />
            MVP固定ルール
          </Badge>
        </div>

        {/* Point Rules */}
        <Card className="p-4 mb-6">
          <p className="text-sm font-medium text-zinc-700 mb-2">付与ルール</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(POINT_RULES).map(([key, rule]) => (
              key !== 'manual_adjust' && (
                <span key={key} className="px-2 py-1 bg-zinc-100 rounded-lg text-xs text-zinc-600">
                  {rule.label}: {rule.points}pt
                </span>
              )
            ))}
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Users className="w-4 h-4 inline mr-1.5" />
            ユーザー別
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <History className="w-4 h-4 inline mr-1.5" />
            履歴
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
          </div>
        ) : activeTab === 'users' ? (
          users.length === 0 ? (
            <Card className="p-8 text-center">
              <Trophy className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500">ポイントデータがありません</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {users.map((u, index) => (
                <Card key={u.userId} className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0 ? 'bg-amber-400 text-white' :
                      index === 1 ? 'bg-zinc-300 text-white' :
                      index === 2 ? 'bg-amber-600 text-white' :
                      'bg-zinc-100 text-zinc-600'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-zinc-900">{u.userName}</p>
                      <p className="text-xs text-zinc-400">
                        ヒヤリ:{u.incidentPoints} / 改善:{u.improvementPoints} / 稟議:{u.ringiPoints} / 残業:{u.overtimePoints} / 調整:{u.manualPoints}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-zinc-900">{u.totalPoints}<span className="text-sm font-normal text-zinc-400">pt</span></p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAdjustModal(u)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : (
          history.length === 0 ? (
            <Card className="p-8 text-center">
              <History className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500">履歴がありません</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <Card key={h.id} className="p-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      h.points > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {h.points > 0 ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-900">
                        <span className="font-medium">{h.userName}</span>
                        <span className="mx-1 text-zinc-400">·</span>
                        {POINT_RULES[h.reason]?.label || h.reason}
                      </p>
                      {h.description && (
                        <p className="text-xs text-zinc-500">{h.description}</p>
                      )}
                      <p className="text-xs text-zinc-400">{formatDateTime(h.createdAt)}</p>
                    </div>
                    <div className={`text-lg font-bold ${h.points > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {h.points > 0 ? '+' : ''}{h.points}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {/* Adjust Modal */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-2">ポイント調整</h3>
            <p className="text-sm text-zinc-500 mb-4">
              {adjustModal.userName} (現在: {adjustModal.totalPoints}pt)
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  ポイント数 <span className="text-zinc-400">(マイナス可)</span>
                </label>
                <Input
                  type="number"
                  value={adjustPoints_}
                  onChange={(e) => setAdjustPoints(Number(e.target.value))}
                  placeholder="例: 5 または -3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  調整理由 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="調整の理由を入力してください"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                variant="secondary"
                onClick={() => { setAdjustModal(null); setAdjustPoints(0); setAdjustReason(''); }}
                className="flex-1"
              >
                キャンセル
              </Button>
              <Button
                onClick={handleAdjust}
                disabled={adjustLoading}
                className="flex-1"
              >
                調整する
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
