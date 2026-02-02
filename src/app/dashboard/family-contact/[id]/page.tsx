'use client';

/**
 * 家族連絡ログ詳細ページ
 *
 * /dashboard/family-contact/[id]
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Phone,
  Mail,
  MessageSquare,
  Users,
  Calendar,
  User,
  Edit2,
  Save,
  X,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  Link as LinkIcon,
} from 'lucide-react';
import type {
  FamilyContactLog,
  FamilyLogCategory,
  FamilyLogContactType,
  FamilyLogDirection,
  FamilyLogImportance,
} from '@/lib/familyLog/types';
import {
  FAMILY_LOG_CATEGORY_LABELS,
  FAMILY_LOG_CONTACT_TYPE_LABELS,
  FAMILY_LOG_DIRECTION_LABELS,
  FAMILY_LOG_IMPORTANCE_LABELS,
  FAMILY_LOG_IMPORTANCE_CONFIG,
  FAMILY_LOG_CATEGORY_CONFIG,
} from '@/lib/familyLog/types';

// 連絡手段アイコン
const ContactTypeIcon = ({ type }: { type: FamilyLogContactType }) => {
  switch (type) {
    case 'phone':
      return <Phone size={16} />;
    case 'email':
      return <Mail size={16} />;
    case 'sms':
    case 'line':
      return <MessageSquare size={16} />;
    case 'in_person':
      return <Users size={16} />;
    default:
      return <MessageSquare size={16} />;
  }
};

export default function FamilyContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const logId = params.id as string;

  const [log, setLog] = useState<FamilyContactLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 編集モード
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    contactType: 'phone' as FamilyLogContactType,
    direction: 'outbound' as FamilyLogDirection,
    category: 'routine' as FamilyLogCategory,
    importance: 'normal' as FamilyLogImportance,
    counterpartName: '',
    counterpartRelation: '',
    summary: '',
    detail: '',
  });
  const [saving, setSaving] = useState(false);

  // データ取得
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/family-contact/${logId}`);

      if (!res.ok) {
        throw new Error('連絡ログの取得に失敗しました');
      }

      const data = await res.json();
      setLog(data.log);

      // 編集データ初期化
      if (data.log) {
        setEditData({
          contactType: data.log.contactType,
          direction: data.log.direction,
          category: data.log.category,
          importance: data.log.importance,
          counterpartName: data.log.counterpartName || '',
          counterpartRelation: data.log.counterpartRelation || '',
          summary: data.log.summary,
          detail: data.log.detail || '',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [logId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 保存
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/family-contact/${logId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });

      if (!res.ok) throw new Error('更新に失敗しました');

      await fetchData();
      setEditMode(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  // 日時フォーマット
  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP');
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 rounded w-1/3" />
          <div className="h-32 bg-zinc-200 rounded" />
          <div className="h-64 bg-zinc-200 rounded" />
        </div>
      </div>
    );
  }

  if (error || !log) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error || '連絡ログが見つかりません'}</p>
          <Link
            href="/dashboard/family-contact"
            className="text-red-600 underline mt-2 inline-block"
          >
            一覧に戻る
          </Link>
        </div>
      </div>
    );
  }

  const importanceConfig = FAMILY_LOG_IMPORTANCE_CONFIG[log.importance];
  const categoryConfig = FAMILY_LOG_CATEGORY_CONFIG[log.category];

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/family-contact"
            className="text-zinc-500 hover:text-zinc-700"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${importanceConfig.bg} ${importanceConfig.text}`}
              >
                {importanceConfig.label}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${categoryConfig.bg} ${categoryConfig.text}`}
              >
                {categoryConfig.label}
              </span>
              {log.importance === 'critical' && (
                <AlertTriangle size={16} className="text-red-500" />
              )}
            </div>
            <h1 className="text-xl font-bold text-zinc-800 mt-1">
              {log.summary}
            </h1>
          </div>
        </div>
        <div className="flex gap-2">
          {!editMode ? (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-2 px-4 py-2 text-zinc-600 border border-zinc-300 rounded-lg hover:bg-zinc-50"
            >
              <Edit2 size={16} />
              編集
            </button>
          ) : (
            <>
              <button
                onClick={() => setEditMode(false)}
                className="flex items-center gap-2 px-4 py-2 text-zinc-600 border border-zinc-300 rounded-lg hover:bg-zinc-50"
              >
                <X size={16} />
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? '保存中...' : '保存'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 概要 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
            <ContactTypeIcon type={log.contactType} />
            連絡手段
          </div>
          <p className="font-medium flex items-center gap-2">
            {FAMILY_LOG_CONTACT_TYPE_LABELS[log.contactType]}
            {log.direction === 'outbound' ? (
              <ArrowUpRight size={14} className="text-blue-500" />
            ) : (
              <ArrowDownLeft size={14} className="text-green-500" />
            )}
            <span className="text-sm text-zinc-500">
              ({FAMILY_LOG_DIRECTION_LABELS[log.direction]})
            </span>
          </p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
            <User size={14} />
            相手方
          </div>
          <p className="font-medium">
            {log.counterpartName || '（未入力）'}
            {log.counterpartRelation && (
              <span className="text-sm text-zinc-500 ml-1">
                ({log.counterpartRelation})
              </span>
            )}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
            <Calendar size={14} />
            連絡日時
          </div>
          <p className="font-medium">{formatDateTime(log.occurredAt)}</p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
            <User size={14} />
            記録者
          </div>
          <p className="font-medium">{log.recordedByUserId}</p>
        </div>
      </div>

      {/* 対象 */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4">
        <h2 className="text-sm font-semibold text-zinc-700 mb-2">対象</h2>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-500">種別:</span>
          <span className="font-medium">{log.subjectType === 'client' ? '利用者' : log.subjectType}</span>
          <span className="text-zinc-500">ID:</span>
          <span className="font-medium">{log.subjectId}</span>
        </div>
      </div>

      {/* 内容 */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">連絡内容</h2>

        {editMode ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  連絡手段
                </label>
                <select
                  value={editData.contactType}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      contactType: e.target.value as FamilyLogContactType,
                    })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
                >
                  {Object.entries(FAMILY_LOG_CONTACT_TYPE_LABELS).map(
                    ([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  方向
                </label>
                <select
                  value={editData.direction}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      direction: e.target.value as FamilyLogDirection,
                    })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
                >
                  {Object.entries(FAMILY_LOG_DIRECTION_LABELS).map(
                    ([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  カテゴリ
                </label>
                <select
                  value={editData.category}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      category: e.target.value as FamilyLogCategory,
                    })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
                >
                  {Object.entries(FAMILY_LOG_CATEGORY_LABELS).map(
                    ([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  重要度
                </label>
                <select
                  value={editData.importance}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      importance: e.target.value as FamilyLogImportance,
                    })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
                >
                  {Object.entries(FAMILY_LOG_IMPORTANCE_LABELS).map(
                    ([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  相手方氏名
                </label>
                <input
                  type="text"
                  value={editData.counterpartName}
                  onChange={(e) =>
                    setEditData({ ...editData, counterpartName: e.target.value })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">
                  続柄
                </label>
                <input
                  type="text"
                  value={editData.counterpartRelation}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      counterpartRelation: e.target.value,
                    })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                要約
              </label>
              <input
                type="text"
                value={editData.summary}
                onChange={(e) =>
                  setEditData({ ...editData, summary: e.target.value })
                }
                className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                詳細
              </label>
              <textarea
                value={editData.detail}
                onChange={(e) =>
                  setEditData({ ...editData, detail: e.target.value })
                }
                rows={6}
                className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-zinc-500 mb-1">要約</p>
              <p className="text-zinc-800 font-medium">{log.summary}</p>
            </div>
            {log.detail && (
              <div>
                <p className="text-xs text-zinc-500 mb-1">詳細</p>
                <p className="text-zinc-700 whitespace-pre-wrap">{log.detail}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 関連情報 */}
      {(log.relatedType || log.relatedId) && (
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2 flex items-center gap-2">
            <LinkIcon size={14} />
            関連情報
          </h2>
          <div className="text-sm">
            {log.relatedType && (
              <span className="mr-4">
                <span className="text-zinc-500">関連種別:</span>{' '}
                <span className="font-medium">{log.relatedType}</span>
              </span>
            )}
            {log.relatedId && (
              <span>
                <span className="text-zinc-500">関連ID:</span>{' '}
                <span className="font-medium">{log.relatedId}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* メタ情報 */}
      <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
        <div className="flex items-center gap-6 text-xs text-zinc-500">
          <span>作成日時: {formatDateTime(log.createdAt)}</span>
          <span>更新日時: {formatDateTime(log.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}
