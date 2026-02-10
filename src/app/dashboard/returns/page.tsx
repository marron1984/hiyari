'use client';

import { useState } from 'react';
import {
  RotateCcw,
  Calendar,
  User,
  FileText,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

interface ReturnRecord {
  id: string;
  originalTitle: string;
  originalType: 'approval' | 'report' | 'application' | 'other';
  returnedBy: string;
  returnedAt: string;
  reason: string;
  status: 'pending' | 'resubmitted' | 'resolved' | 'cancelled';
  submitterName: string;
  resubmittedAt: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '対応待ち', color: 'text-amber-700', bg: 'bg-amber-50' },
  resubmitted: { label: '再提出済み', color: 'text-blue-700', bg: 'bg-blue-50' },
  resolved: { label: '解決済み', color: 'text-green-700', bg: 'bg-green-50' },
  cancelled: { label: '取消', color: 'text-zinc-500', bg: 'bg-zinc-100' },
};

const TYPE_LABELS: Record<string, string> = {
  approval: '稟議',
  report: '報告書',
  application: '申請書',
  other: 'その他',
};

type TabType = 'all' | 'pending' | 'resolved';

const DEMO_DATA: ReturnRecord[] = [
  { id: '1', originalTitle: '備品購入申請（プリンター）', originalType: 'approval', returnedBy: '田中部長', returnedAt: '2026-02-09T14:30:00Z', reason: '見積書の添付が不足しています', status: 'pending', submitterName: '鈴木一郎', resubmittedAt: null },
  { id: '2', originalTitle: '月次報告書（1月度）', originalType: 'report', returnedBy: '山田課長', returnedAt: '2026-02-07T10:00:00Z', reason: '出席率データの修正が必要', status: 'resubmitted', submitterName: '佐藤美咲', resubmittedAt: '2026-02-08T09:15:00Z' },
  { id: '3', originalTitle: '有給休暇申請', originalType: 'application', returnedBy: '高橋リーダー', returnedAt: '2026-02-05T16:00:00Z', reason: '代替要員の記載が必要', status: 'resolved', submitterName: '中村健', resubmittedAt: '2026-02-06T08:30:00Z' },
  { id: '4', originalTitle: '研修参加申請', originalType: 'application', returnedBy: '田中部長', returnedAt: '2026-02-04T11:00:00Z', reason: '予算コード変更のため再申請', status: 'pending', submitterName: '渡辺隆', resubmittedAt: null },
];

export default function ReturnsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const tabs: { id: TabType; label: string }[] = [
    { id: 'all', label: 'すべて' },
    { id: 'pending', label: '対応待ち' },
    { id: 'resolved', label: '解決済み' },
  ];

  const filtered = DEMO_DATA.filter((r) => {
    if (activeTab === 'pending') return r.status === 'pending';
    if (activeTab === 'resolved') return r.status === 'resolved' || r.status === 'cancelled';
    return true;
  });

  const pendingCount = DEMO_DATA.filter((r) => r.status === 'pending').length;

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 safe-bottom">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-900">
          <RotateCcw className="w-6 h-6" />
          差戻し管理
        </h1>
        <p className="text-sm text-zinc-500 mt-1">差戻し案件の対応状況を追跡</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-zinc-900">{DEMO_DATA.length}</p>
          <p className="text-xs text-zinc-500">全差戻し</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          <p className="text-xs text-zinc-500">対応待ち</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{DEMO_DATA.filter((r) => r.status === 'resolved').length}</p>
          <p className="text-xs text-zinc-500">解決済み</p>
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
          <RotateCcw className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>差戻し案件はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => {
            const statusCfg = STATUS_CONFIG[record.status];

            return (
              <div key={record.id} className={`bg-white border rounded-xl p-4 hover:border-zinc-300 transition-colors ${record.status === 'pending' ? 'border-amber-200' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center shrink-0">
                    <RotateCcw className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      <span className="text-xs text-zinc-500">{TYPE_LABELS[record.originalType]}</span>
                    </div>
                    <h3 className="font-medium text-zinc-900">{record.originalTitle}</h3>
                    <p className="text-sm text-zinc-500 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      {record.reason}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        差戻し: {new Date(record.returnedAt).toLocaleDateString('ja-JP')}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        差戻し元: {record.returnedBy}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        提出者: {record.submitterName}
                      </span>
                      {record.resubmittedAt && (
                        <span className="flex items-center gap-1 text-blue-500">
                          <CheckCircle className="w-3 h-3" />
                          再提出: {new Date(record.resubmittedAt).toLocaleDateString('ja-JP')}
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
    </main>
  );
}
