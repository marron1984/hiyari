'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileCheck,
  AlertTriangle,
  Clock,
  Plus,
  ChevronRight,
  User,
  Filter,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Calendar,
  FileText,
  Settings,
} from 'lucide-react';
import type {
  AgreementType,
  AgreementConsent,
  AgreementStats,
  SubjectType,
  ConsentStatus,
} from '@/lib/agreements/types';
import {
  AGREEMENT_CATEGORY_LABELS,
  CONSENT_STATUS_CONFIG,
  CONSENT_METHOD_LABELS,
  SUBJECT_TYPE_LABELS,
  isExpired,
  isExpiring,
  daysUntilExpiry,
} from '@/lib/agreements/types';

type TabType = 'consents' | 'expired' | 'expiring' | 'types';

export default function ConsentPage() {
  const [activeTab, setActiveTab] = useState<TabType>('consents');
  const [consents, setConsents] = useState<AgreementConsent[]>([]);
  const [types, setTypes] = useState<AgreementType[]>([]);
  const [stats, setStats] = useState<AgreementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedConsent, setSelectedConsent] = useState<AgreementConsent | null>(null);
  const [filterTypeId, setFilterTypeId] = useState<string>('');
  const [filterSubjectType, setFilterSubjectType] = useState<SubjectType | ''>('');

  useEffect(() => {
    fetchData();
  }, [activeTab, filterTypeId, filterSubjectType]);

  async function fetchData() {
    setLoading(true);
    try {
      // 統計取得
      const statsRes = await fetch('/api/agreements/stats');
      const statsData = await statsRes.json();
      if (statsData.success) setStats(statsData.stats);

      // 種別一覧取得
      const typesRes = await fetch('/api/agreements/types?active=true');
      const typesData = await typesRes.json();
      if (typesData.success) setTypes(typesData.types);

      // 同意レコード取得
      let url = '/api/agreements/consents?';
      if (activeTab === 'expired') {
        url += 'expired=true&';
      } else if (activeTab === 'expiring') {
        url += 'expiringWithinDays=30&';
      }
      if (filterTypeId) {
        url += `agreementTypeId=${filterTypeId}&`;
      }
      if (filterSubjectType) {
        url += `subjectType=${filterSubjectType}&`;
      }

      const consentsRes = await fetch(url);
      const consentsData = await consentsRes.json();
      if (consentsData.success) setConsents(consentsData.consents);
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecordConsent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch('/api/agreements/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agreementTypeId: formData.get('agreementTypeId'),
          subjectType: formData.get('subjectType'),
          subjectId: formData.get('subjectId') || null,
          subjectName: formData.get('subjectName'),
          consentStatus: formData.get('consentStatus'),
          method: formData.get('method'),
          note: formData.get('note') || null,
        }),
      });

      if (res.ok) {
        setShowRecordModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('同意記録エラー:', error);
    }
  }

  async function handleRenew(consentId: string) {
    const newValidUntil = prompt('新しい有効期限を入力してください（YYYY-MM-DD形式）');
    if (!newValidUntil) return;

    try {
      const res = await fetch(`/api/agreements/consents/${consentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'renew',
          newValidUntil,
          note: '期限更新',
        }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('更新エラー:', error);
    }
  }

  async function handleWithdraw(consentId: string) {
    if (!confirm('この同意を撤回しますか？')) return;

    try {
      const res = await fetch(`/api/agreements/consents/${consentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'withdraw',
          note: '撤回処理',
        }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('撤回エラー:', error);
    }
  }

  function getTypeTitle(typeId: string): string {
    return types.find((t) => t.id === typeId)?.title ?? '不明';
  }

  function getExpiryStatus(consent: AgreementConsent): {
    label: string;
    color: string;
    bgColor: string;
  } | null {
    if (!consent.validUntil) return null;
    if (isExpired(consent.validUntil)) {
      return { label: '期限切れ', color: 'text-red-700', bgColor: 'bg-red-100' };
    }
    if (isExpiring(consent.validUntil)) {
      const days = daysUntilExpiry(consent.validUntil);
      return {
        label: `あと${days}日`,
        color: 'text-amber-700',
        bgColor: 'bg-amber-100',
      };
    }
    return null;
  }

  if (loading && consents.length === 0) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 rounded w-48" />
          <div className="h-32 bg-zinc-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">同意書管理</h1>
          <p className="text-zinc-600 mt-1">
            同意書の取得状況と期限を管理
          </p>
        </div>
        <button
          onClick={() => setShowRecordModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          同意を記録
        </button>
      </div>

      {/* サマリーカード */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="flex items-center gap-2 text-zinc-600 text-sm">
              <FileCheck className="w-4 h-4" />
              総同意件数
            </div>
            <div className="mt-2 text-2xl font-bold text-zinc-800">
              {stats.totalConsents}
            </div>
          </div>

          <div
            className={`bg-white rounded-lg border p-4 ${
              stats.expiredCount > 0
                ? 'border-red-200 bg-red-50'
                : 'border-zinc-200'
            }`}
          >
            <div
              className={`flex items-center gap-2 text-sm ${
                stats.expiredCount > 0 ? 'text-red-600' : 'text-zinc-600'
              }`}
            >
              <XCircle className="w-4 h-4" />
              期限切れ
            </div>
            <div
              className={`mt-2 text-2xl font-bold ${
                stats.expiredCount > 0 ? 'text-red-600' : 'text-zinc-800'
              }`}
            >
              {stats.expiredCount}
            </div>
          </div>

          <div
            className={`bg-white rounded-lg border p-4 ${
              stats.expiringCount > 0
                ? 'border-amber-200 bg-amber-50'
                : 'border-zinc-200'
            }`}
          >
            <div
              className={`flex items-center gap-2 text-sm ${
                stats.expiringCount > 0 ? 'text-amber-600' : 'text-zinc-600'
              }`}
            >
              <Clock className="w-4 h-4" />
              期限接近
            </div>
            <div
              className={`mt-2 text-2xl font-bold ${
                stats.expiringCount > 0 ? 'text-amber-600' : 'text-zinc-800'
              }`}
            >
              {stats.expiringCount}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="flex items-center gap-2 text-zinc-600 text-sm">
              <Calendar className="w-4 h-4" />
              今月の記録
            </div>
            <div className="mt-2 text-2xl font-bold text-green-600">
              {stats.consentedCountThisMonth}
            </div>
          </div>
        </div>
      )}

      {/* タブ */}
      <div className="border-b border-zinc-200">
        <nav className="flex gap-4">
          {[
            { key: 'consents', label: '同意レコード', icon: FileCheck },
            { key: 'expired', label: '期限切れ', icon: XCircle },
            { key: 'expiring', label: '期限接近', icon: Clock },
            { key: 'types', label: '種別管理', icon: Settings },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as TabType)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {key === 'expired' && stats && stats.expiredCount > 0 && (
                <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                  {stats.expiredCount}
                </span>
              )}
              {key === 'expiring' && stats && stats.expiringCount > 0 && (
                <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                  {stats.expiringCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* フィルター（同意レコード/期限切れ/期限接近タブ用） */}
      {activeTab !== 'types' && (
        <div className="flex gap-4">
          <select
            value={filterTypeId}
            onChange={(e) => setFilterTypeId(e.target.value)}
            className="px-3 py-2 border border-zinc-300 rounded-lg text-sm"
          >
            <option value="">全ての種別</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <select
            value={filterSubjectType}
            onChange={(e) => setFilterSubjectType(e.target.value as SubjectType | '')}
            className="px-3 py-2 border border-zinc-300 rounded-lg text-sm"
          >
            <option value="">全ての対象</option>
            {Object.entries(SUBJECT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" />
            更新
          </button>
        </div>
      )}

      {/* コンテンツ */}
      {activeTab === 'types' ? (
        // 種別一覧
        <div className="bg-white rounded-lg border border-zinc-200">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="font-semibold text-zinc-800">同意書種別</h2>
          </div>
          <div className="divide-y divide-zinc-200">
            {types.map((type) => (
              <div key={type.id} className="p-4 hover:bg-zinc-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-zinc-900">{type.title}</h3>
                    <p className="text-sm text-zinc-600 mt-1">
                      {type.description}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                      <span className="px-2 py-0.5 bg-zinc-100 rounded">
                        {AGREEMENT_CATEGORY_LABELS[type.category]}
                      </span>
                      {type.requiresRenewal && (
                        <span className="flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" />
                          {type.defaultValidDays}日更新
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      type.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {type.isActive ? '有効' : '無効'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // 同意レコード一覧
        <div className="bg-white rounded-lg border border-zinc-200">
          {consents.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              該当する同意レコードがありません
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">
                    対象者
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">
                    同意書種別
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">
                    状態
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">
                    同意日
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-zinc-600">
                    有効期限
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-zinc-600">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {consents.map((consent) => {
                  const expiryStatus = getExpiryStatus(consent);
                  const statusConfig = CONSENT_STATUS_CONFIG[consent.consentStatus];

                  return (
                    <tr key={consent.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-zinc-400" />
                          <div>
                            <div className="font-medium text-zinc-900">
                              {consent.subjectName}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {SUBJECT_TYPE_LABELS[consent.subjectType]}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-700">
                        {getTypeTitle(consent.agreementTypeId)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs rounded ${statusConfig.bgColor} ${statusConfig.color}`}
                        >
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">
                        {consent.consentedAt
                          ? new Date(consent.consentedAt).toLocaleDateString('ja-JP')
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {consent.validUntil ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-zinc-600">
                              {new Date(consent.validUntil).toLocaleDateString('ja-JP')}
                            </span>
                            {expiryStatus && (
                              <span
                                className={`px-2 py-0.5 text-xs rounded ${expiryStatus.bgColor} ${expiryStatus.color}`}
                              >
                                {expiryStatus.label}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-zinc-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/e-sign?agreementConsentId=${consent.id}`}
                            className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded"
                          >
                            署名ログ
                          </Link>
                          {consent.consentStatus === 'consented' &&
                            consent.validUntil && (
                              <button
                                onClick={() => handleRenew(consent.id)}
                                className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                              >
                                更新
                              </button>
                            )}
                          {consent.consentStatus === 'consented' && (
                            <button
                              onClick={() => handleWithdraw(consent.id)}
                              className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                            >
                              撤回
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 同意記録モーダル */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b border-zinc-200">
              <h2 className="text-lg font-semibold">同意を記録</h2>
            </div>
            <form onSubmit={handleRecordConsent} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  同意書種別
                </label>
                <select
                  name="agreementTypeId"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                >
                  <option value="">選択してください</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  対象種別
                </label>
                <select
                  name="subjectType"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                >
                  {Object.entries(SUBJECT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  対象者名
                </label>
                <input
                  type="text"
                  name="subjectName"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="山田太郎"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  対象者ID（任意）
                </label>
                <input
                  type="text"
                  name="subjectId"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="resident_001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  同意状況
                </label>
                <select
                  name="consentStatus"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                >
                  <option value="consented">同意済</option>
                  <option value="declined">不同意</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  取得方法
                </label>
                <select
                  name="method"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                >
                  {Object.entries(CONSENT_METHOD_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  備考（任意）
                </label>
                <textarea
                  name="note"
                  rows={2}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  記録
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
