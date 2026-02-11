'use client';

import { useState } from 'react';
import {
  Banknote,
  Calendar,
  Phone,
  Mail,
  MessageSquare,
} from 'lucide-react';

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

const DEMO_DATA: DunningRecord[] = [
  { id: '1', residentName: '山田太郎', amount: 45000, method: 'phone', result: 'promised', dunnedAt: '2026-02-08T10:30:00Z', note: '2/15までに入金予定', staffName: '田中花子' },
  { id: '2', residentName: '佐藤花子', amount: 32000, method: 'letter', result: 'no_answer', dunnedAt: '2026-02-07T14:00:00Z', note: null, staffName: '鈴木一郎' },
  { id: '3', residentName: '高橋健一', amount: 28000, method: 'phone', result: 'paid', dunnedAt: '2026-02-05T11:00:00Z', note: '全額入金確認', staffName: '田中花子' },
  { id: '4', residentName: '中村美咲', amount: 56000, method: 'email', result: 'contacted', dunnedAt: '2026-02-06T09:15:00Z', note: '家族に連絡済み', staffName: '山本太郎' },
  { id: '5', residentName: '渡辺隆', amount: 120000, method: 'visit', result: 'partial_paid', dunnedAt: '2026-02-04T13:30:00Z', note: '60,000円入金、残額2/20予定', staffName: '鈴木一郎' },
];

export default function DunningHistoryPage() {
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const tabs: { id: TabType; label: string }[] = [
    { id: 'all', label: 'すべて' },
    { id: 'pending', label: '未解決' },
    { id: 'resolved', label: '解決済み' },
  ];

  const filtered = DEMO_DATA.filter((d) => {
    if (activeTab === 'pending') return d.result !== 'paid';
    if (activeTab === 'resolved') return d.result === 'paid';
    return true;
  });

  const totalUnpaid = DEMO_DATA.filter((d) => d.result !== 'paid').reduce((s, d) => s + d.amount, 0);

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 safe-bottom">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-900">
          <Banknote className="w-6 h-6" />
          督促履歴
        </h1>
        <p className="text-sm text-zinc-500 mt-1">未収金の督促連絡記録を管理</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-zinc-900">{DEMO_DATA.length}</p>
          <p className="text-xs text-zinc-500">督促件数</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-600">¥{totalUnpaid.toLocaleString()}</p>
          <p className="text-xs text-zinc-500">未回収残高</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{DEMO_DATA.filter((d) => d.result === 'paid').length}</p>
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
                      未収額: <span className="font-medium text-zinc-700">¥{record.amount.toLocaleString()}</span>
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
