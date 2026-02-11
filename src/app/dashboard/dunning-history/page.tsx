'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Banknote,
  Calendar,
  Phone,
  Mail,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useApiFetch } from '@/hooks/useApiFetch';
import { Loading } from '@/components/Loading';
import type { Receivable } from '@/lib/receivables/types';

interface DunningRecord {
  id: string;
  residentName: string;
  amount: number;
  method: 'phone' | 'letter' | 'email' | 'visit';
  result: 'contacted' | 'promised' | 'no_answer' | 'refused' | 'partial_paid' | 'paid';
  dunnedAt: string;
  note: string | null;
  staffName: string;
}

const METHOD_CONFIG: Record<string, { label: string; icon: typeof Phone }> = {
  phone: { label: '電話', icon: Phone },
  letter: { label: '文書', icon: Mail },
  email: { label: 'メール', icon: Mail },
  visit: { label: '訪問', icon: MessageSquare },
};

const RESULT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  contacted: { label: '連絡済み', color: 'text-blue-700', bg: 'bg-blue-50' },
  promised: { label: '支払約束', color: 'text-amber-700', bg: 'bg-amber-50' },
  no_answer: { label: '不在', color: 'text-zinc-600', bg: 'bg-zinc-100' },
  refused: { label: '拒否', color: 'text-red-700', bg: 'bg-red-50' },
  partial_paid: { label: '一部入金', color: 'text-orange-700', bg: 'bg-orange-50' },
  paid: { label: '入金完了', color: 'text-green-700', bg: 'bg-green-50' },
};

type TabType = 'all' | 'pending' | 'resolved';

/** Map receivable nextActionType to DunningRecord method */
function mapMethod(actionType: string | null): DunningRecord['method'] {
  switch (actionType) {
    case 'call': return 'phone';
    case 'email': return 'email';
    case 'visit': return 'visit';
    case 'letter': return 'letter';
    default: return 'phone';
  }
}

/** Map receivable status to dunning result */
function mapResult(status: string): DunningRecord['result'] {
  switch (status) {
    case 'open': return 'contacted';
    case 'in_collection': return 'contacted';
    case 'promised': return 'promised';
    case 'partial': return 'partial_paid';
    case 'disputed': return 'refused';
    case 'paid': return 'paid';
    case 'writeoff': return 'refused';
    case 'archived': return 'paid';
    default: return 'no_answer';
  }
}

/** Map a Receivable from the API to DunningRecord */
function mapToDunningRecord(receivable: Receivable): DunningRecord {
  return {
    id: receivable.id,
    residentName: receivable.subjectName,
    amount: receivable.amount - (receivable.paidAmount || 0),
    method: mapMethod(receivable.nextActionType),
    result: mapResult(receivable.status),
    dunnedAt: receivable.nextActionAt || receivable.updatedAt,
    note: receivable.riskNote || receivable.description,
    staffName: receivable.ownerRole || '担当未設定',
  };
}

export default function DunningHistoryPage() {
  const { firebaseUser } = useAuth();
  const apiFetch = useApiFetch();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [records, setRecords] = useState<DunningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!firebaseUser) return;
    setError(null);
    try {
      const res = await apiFetch('/api/receivables?limit=200');
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const data = await res.json();
      const items: Receivable[] = data.items || [];
      setRecords(items.map(mapToDunningRecord));
    } catch (err) {
      console.error('Failed to load dunning history:', err);
      setError('督促履歴の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tabs: { id: TabType; label: string }[] = [
    { id: 'all', label: 'すべて' },
    { id: 'pending', label: '未解決' },
    { id: 'resolved', label: '解決済み' },
  ];

  const filtered = records.filter((d) => {
    if (activeTab === 'pending') return d.result !== 'paid';
    if (activeTab === 'resolved') return d.result === 'paid';
    return true;
  });

  const totalUnpaid = records.filter((d) => d.result !== 'paid').reduce((s, d) => s + d.amount, 0);

  if (loading) {
    return <Loading text="督促履歴を読み込み中..." />;
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 safe-bottom">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-900">
            <Banknote className="w-6 h-6" />
            督促履歴
          </h1>
          <button
            onClick={() => { setLoading(true); loadData(); }}
            className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors"
            title="再読み込み"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-zinc-500 mt-1">未収金の督促連絡記録を管理</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-zinc-900">{records.length}</p>
          <p className="text-xs text-zinc-500">督促件数</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-600">&yen;{totalUnpaid.toLocaleString()}</p>
          <p className="text-xs text-zinc-500">未回収残高</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{records.filter((d) => d.result === 'paid').length}</p>
          <p className="text-xs text-zinc-500">入金完了</p>
        </div>
      </div>

      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
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

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Banknote className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>督促履歴はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => {
            const resultCfg = RESULT_CONFIG[record.result];
            const methodCfg = METHOD_CONFIG[record.method];
            const Icon = methodCfg.icon;

            return (
              <div key={record.id} className="bg-white border rounded-xl p-4 hover:border-zinc-300 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${resultCfg.bg} ${resultCfg.color}`}>
                        {resultCfg.label}
                      </span>
                      <span className="text-xs text-zinc-500">{methodCfg.label}</span>
                    </div>
                    <h3 className="font-medium text-zinc-900">{record.residentName}</h3>
                    <p className="text-sm text-zinc-500 mt-0.5">
                      未収額: <span className="font-medium text-zinc-700">&yen;{record.amount.toLocaleString()}</span>
                    </p>
                    {record.note && (
                      <p className="text-sm text-zinc-500 mt-1">{record.note}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(record.dunnedAt).toLocaleString('ja-JP')}
                      </span>
                      <span>担当: {record.staffName}</span>
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
