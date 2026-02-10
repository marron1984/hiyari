'use client';

import { useState } from 'react';
import {
  Award,
  Calendar,
  CheckCircle,
  Clock,
  Users,
} from 'lucide-react';

interface Certification {
  id: string;
  staffName: string;
  certName: string;
  certType: 'national' | 'prefectural' | 'private' | 'internal';
  status: 'valid' | 'expiring' | 'expired' | 'pending';
  acquiredAt: string;
  expiresAt: string | null;
  renewalDueAt: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  valid: { label: '有効', color: 'text-green-700', bg: 'bg-green-50' },
  expiring: { label: '期限間近', color: 'text-orange-700', bg: 'bg-orange-50' },
  expired: { label: '期限切れ', color: 'text-red-700', bg: 'bg-red-50' },
  pending: { label: '取得予定', color: 'text-blue-700', bg: 'bg-blue-50' },
};

const TYPE_LABELS: Record<string, string> = {
  national: '国家資格',
  prefectural: '都道府県資格',
  private: '民間資格',
  internal: '社内認定',
};

type TabType = 'all' | 'expiring' | 'expired';

const DEMO_DATA: Certification[] = [
  { id: '1', staffName: '田中花子', certName: '介護福祉士', certType: 'national', status: 'valid', acquiredAt: '2022-04-01', expiresAt: '2027-03-31', renewalDueAt: null },
  { id: '2', staffName: '鈴木一郎', certName: '介護支援専門員', certType: 'national', status: 'expiring', acquiredAt: '2021-10-01', expiresAt: '2026-03-31', renewalDueAt: '2026-02-28' },
  { id: '3', staffName: '山田太郎', certName: '認知症介護実践者研修', certType: 'prefectural', status: 'valid', acquiredAt: '2023-08-15', expiresAt: null, renewalDueAt: null },
  { id: '4', staffName: '佐藤美咲', certName: '福祉用具専門相談員', certType: 'private', status: 'expired', acquiredAt: '2020-06-01', expiresAt: '2025-05-31', renewalDueAt: '2025-04-30' },
  { id: '5', staffName: '高橋健', certName: '普通救命講習', certType: 'internal', status: 'expiring', acquiredAt: '2024-01-15', expiresAt: '2026-01-14', renewalDueAt: '2025-12-15' },
];

export default function CertificationsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const tabs: { id: TabType; label: string }[] = [
    { id: 'all', label: 'すべて' },
    { id: 'expiring', label: '期限間近' },
    { id: 'expired', label: '期限切れ' },
  ];

  const filtered = DEMO_DATA.filter((c) => {
    if (activeTab === 'expiring') return c.status === 'expiring';
    if (activeTab === 'expired') return c.status === 'expired';
    return true;
  });

  const stats = {
    total: DEMO_DATA.length,
    valid: DEMO_DATA.filter((c) => c.status === 'valid').length,
    expiring: DEMO_DATA.filter((c) => c.status === 'expiring').length,
    expired: DEMO_DATA.filter((c) => c.status === 'expired').length,
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 safe-bottom">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-900">
          <Award className="w-6 h-6" />
          資格管理
        </h1>
        <p className="text-sm text-zinc-500 mt-1">従業員の資格取得状況・有効期限を管理</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-zinc-900">{stats.total}</p>
          <p className="text-xs text-zinc-500">全資格</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.valid}</p>
          <p className="text-xs text-zinc-500">有効</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-orange-600">{stats.expiring}</p>
          <p className="text-xs text-zinc-500">期限間近</p>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
          <p className="text-xs text-zinc-500">期限切れ</p>
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
          <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>該当する資格はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((cert) => {
            const statusCfg = STATUS_CONFIG[cert.status];
            return (
              <div key={cert.id} className={`bg-white border rounded-xl p-4 hover:border-zinc-300 transition-colors ${cert.status === 'expired' ? 'border-red-200' : cert.status === 'expiring' ? 'border-orange-200' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      <span className="text-xs text-zinc-500">{TYPE_LABELS[cert.certType]}</span>
                    </div>
                    <h3 className="font-medium text-zinc-900">{cert.certName}</h3>
                    <p className="text-sm text-zinc-500 mt-0.5 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {cert.staffName}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        取得: {new Date(cert.acquiredAt).toLocaleDateString('ja-JP')}
                      </span>
                      {cert.expiresAt && (
                        <span className={`flex items-center gap-1 ${cert.status === 'expired' ? 'text-red-500 font-medium' : cert.status === 'expiring' ? 'text-orange-500 font-medium' : ''}`}>
                          <Calendar className="w-3 h-3" />
                          期限: {new Date(cert.expiresAt).toLocaleDateString('ja-JP')}
                        </span>
                      )}
                      {cert.renewalDueAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          更新期限: {new Date(cert.renewalDueAt).toLocaleDateString('ja-JP')}
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
