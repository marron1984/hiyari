'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle,
  Filter,
  Calendar,
  Building2,
} from 'lucide-react';
import type { Contract, ContractStatus, ContractType } from '@/lib/contracts/types';

const STATUS_CONFIG: Record<ContractStatus, { label: string; color: string; bg: string }> = {
  draft: { label: '下書き', color: 'text-zinc-600', bg: 'bg-zinc-100' },
  pending: { label: '承認待ち', color: 'text-amber-700', bg: 'bg-amber-50' },
  active: { label: '有効', color: 'text-green-700', bg: 'bg-green-50' },
  expiring: { label: '期限間近', color: 'text-orange-700', bg: 'bg-orange-50' },
  expired: { label: '期限切れ', color: 'text-red-700', bg: 'bg-red-50' },
  renewed: { label: '更新済み', color: 'text-blue-700', bg: 'bg-blue-50' },
  terminated: { label: '解約', color: 'text-zinc-500', bg: 'bg-zinc-100' },
};

const TYPE_LABELS: Record<ContractType, string> = {
  service: 'サービス利用',
  lease: '賃貸借',
  maintenance: '保守',
  vendor: '委託',
  employment: '雇用',
  other: 'その他',
};

type TabType = 'all' | 'active' | 'expiring' | 'expired';

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    fetchContracts();
  }, [activeTab, typeFilter]);

  async function fetchContracts() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== 'all') params.append('status', activeTab);
      if (typeFilter) params.append('type', typeFilter);

      const res = await fetch(`/api/contracts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'all', label: 'すべて' },
    { id: 'active', label: '有効' },
    { id: 'expiring', label: '期限間近' },
    { id: 'expired', label: '期限切れ' },
  ];

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 safe-bottom">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-900">
            <FileText className="w-6 h-6" />
            契約書管理
          </h1>
          <p className="text-sm text-zinc-500 mt-1">契約の期限管理・更新アラート</p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-zinc-50"
        >
          <Filter className="w-4 h-4" />
          フィルタ
        </button>
      </div>

      {showFilters && (
        <div className="bg-zinc-50 border rounded-xl p-4 mb-4">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">契約タイプ: すべて</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      )}

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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
            <p className="text-sm text-zinc-500">読み込み中...</p>
          </div>
        </div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>契約データはありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((contract) => {
            const statusCfg = STATUS_CONFIG[contract.status];
            const isExpiring = contract.status === 'expiring' || contract.status === 'expired';

            return (
              <div key={contract.id} className={`bg-white border rounded-xl p-4 hover:border-zinc-300 transition-colors ${isExpiring ? 'border-orange-200' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      <span className="text-xs text-zinc-500">{TYPE_LABELS[contract.type]}</span>
                      {contract.riskLevel === 'high' || contract.riskLevel === 'critical' ? (
                        <span className="text-xs text-red-600 flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" />
                          {contract.riskLevel === 'critical' ? '最高リスク' : '高リスク'}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="font-medium text-zinc-900">{contract.name}</h3>
                    <p className="text-sm text-zinc-500 mt-0.5 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" />
                      {contract.counterpartyName}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(contract.startAt).toLocaleDateString('ja-JP')} 〜 {new Date(contract.endAt).toLocaleDateString('ja-JP')}
                      </span>
                      {contract.amount && (
                        <span>¥{contract.amount.toLocaleString()}</span>
                      )}
                      {contract.renewalDecisionDueAt && (
                        <span className={`flex items-center gap-1 ${new Date(contract.renewalDecisionDueAt) < new Date() ? 'text-red-500 font-medium' : ''}`}>
                          <Clock className="w-3 h-3" />
                          更新判断: {new Date(contract.renewalDecisionDueAt).toLocaleDateString('ja-JP')}
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
