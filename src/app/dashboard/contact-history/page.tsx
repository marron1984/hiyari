'use client';

import { useState, useEffect } from 'react';
import {
  Phone,
  Mail,
  MessageSquare,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Filter,
  AlertTriangle,
} from 'lucide-react';
import type { FamilyContactLog } from '@/lib/familyLog/types';

const CONTACT_TYPE_LABELS: Record<string, { label: string; icon: typeof Phone }> = {
  phone: { label: '電話', icon: Phone },
  sms: { label: 'SMS', icon: MessageSquare },
  line: { label: 'LINE', icon: MessageSquare },
  email: { label: 'メール', icon: Mail },
  in_person: { label: '対面', icon: Users },
  other: { label: 'その他', icon: MessageSquare },
};

const CATEGORY_LABELS: Record<string, string> = {
  routine: '定期連絡',
  medical: '医療',
  safety: '安全',
  billing: '請求',
  complaint: '苦情',
  other: 'その他',
};

const IMPORTANCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  normal: { label: '通常', color: 'text-zinc-600', bg: 'bg-zinc-100' },
  high: { label: '重要', color: 'text-amber-700', bg: 'bg-amber-50' },
  critical: { label: '緊急', color: 'text-red-700', bg: 'bg-red-50' },
};

export default function ContactHistoryPage() {
  const [logs, setLogs] = useState<FamilyContactLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [categoryFilter, directionFilter]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      if (directionFilter) params.append('direction', directionFilter);
      params.append('limit', '50');

      const res = await fetch(`/api/family-contact?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 safe-bottom">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-900">
            <Phone className="w-6 h-6" />
            連絡履歴
          </h1>
          <p className="text-sm text-zinc-500 mt-1">入居者・家族との連絡記録を一元管理</p>
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
        <div className="bg-zinc-50 border rounded-xl p-4 mb-4 flex flex-wrap gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">カテゴリ: すべて</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">方向: すべて</option>
            <option value="outbound">発信</option>
            <option value="inbound">着信</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
            <p className="text-sm text-zinc-500">読み込み中...</p>
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>連絡履歴はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const contactCfg = CONTACT_TYPE_LABELS[log.contactType] || CONTACT_TYPE_LABELS.other;
            const impCfg = IMPORTANCE_CONFIG[log.importance] || IMPORTANCE_CONFIG.normal;
            const Icon = contactCfg.icon;
            const DirectionIcon = log.direction === 'outbound' ? ArrowUpRight : ArrowDownLeft;

            return (
              <div key={log.id} className="bg-white border rounded-xl p-4 hover:border-zinc-300 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-medium text-zinc-500 flex items-center gap-1">
                        <DirectionIcon className="w-3 h-3" />
                        {log.direction === 'outbound' ? '発信' : '着信'}
                      </span>
                      <span className="text-xs text-zinc-400">{contactCfg.label}</span>
                      <span className="text-xs text-zinc-400">{CATEGORY_LABELS[log.category] || log.category}</span>
                      {log.importance !== 'normal' && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${impCfg.bg} ${impCfg.color}`}>
                          {log.importance === 'critical' && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                          {impCfg.label}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-zinc-900">{log.summary}</p>
                    {log.counterpartName && (
                      <p className="text-sm text-zinc-500 mt-0.5">
                        {log.counterpartName}
                        {log.counterpartRelation && ` (${log.counterpartRelation})`}
                      </p>
                    )}
                    <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.occurredAt).toLocaleString('ja-JP')}
                    </p>
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
