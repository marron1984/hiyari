'use client';

/**
 * キーパーソン管理ページ
 *
 * /dashboard/key-person
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Edit2,
  X,
  Trash2,
  Save,
  Star,
} from 'lucide-react';
import type {
  KeyPersonContact,
  KeyPersonSubjectType,
  PreferredContactType,
  ConsentStatus,
} from '@/lib/keyPerson/types';
import {
  PREFERRED_CONTACT_TYPE_LABELS,
  CONSENT_STATUS_LABELS,
  PREFERRED_CONTACT_TYPE_CONFIG,
  CONSENT_STATUS_CONFIG,
  maskPhone,
  maskEmail,
} from '@/lib/keyPerson/types';

// デモ: PIIを表示するか（manager以上）
const CAN_VIEW_PII = true;

interface Subject {
  subjectType: KeyPersonSubjectType;
  subjectId: string;
  contactCount: number;
}

export default function KeyPersonPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<{
    type: KeyPersonSubjectType;
    id: string;
  } | null>(null);
  const [contacts, setContacts] = useState<KeyPersonContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // 検索
  const [searchQuery, setSearchQuery] = useState('');

  // 新規作成モーダル
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newContact, setNewContact] = useState({
    subjectId: '',
    name: '',
    relation: '',
    phone: '',
    email: '',
    lineIdOrHint: '',
    preferredContactType: 'phone' as PreferredContactType,
    availableTimeHint: '',
    notes: '',
    isEmergency: false,
    consentStatus: 'unknown' as ConsentStatus,
  });
  const [submitting, setSubmitting] = useState(false);

  // 編集モーダル
  const [editingContact, setEditingContact] = useState<KeyPersonContact | null>(null);
  const [editData, setEditData] = useState({
    name: '',
    relation: '',
    phone: '',
    email: '',
    lineIdOrHint: '',
    preferredContactType: 'phone' as PreferredContactType,
    availableTimeHint: '',
    notes: '',
    isEmergency: false,
    consentStatus: 'unknown' as ConsentStatus,
  });

  // 対象一覧取得
  const fetchSubjects = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/key-person/subjects');
      const data = await res.json();
      setSubjects(data.subjects || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 連絡先一覧取得
  const fetchContacts = useCallback(async (subjectType: KeyPersonSubjectType, subjectId: string) => {
    try {
      setLoadingContacts(true);
      const res = await fetch(
        `/api/key-person?subjectType=${subjectType}&subjectId=${subjectId}`
      );
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  // 対象選択
  const handleSelectSubject = (subjectType: KeyPersonSubjectType, subjectId: string) => {
    setSelectedSubject({ type: subjectType, id: subjectId });
    fetchContacts(subjectType, subjectId);
  };

  // 直接検索
  const handleDirectSearch = () => {
    if (searchQuery.trim()) {
      setSelectedSubject({ type: 'client', id: searchQuery.trim() });
      fetchContacts('client', searchQuery.trim());
    }
  };

  // 新規作成
  const handleCreate = async () => {
    if (!newContact.subjectId || !newContact.name) {
      alert('利用者IDと名前は必須です');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/key-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectType: 'client',
          ...newContact,
        }),
      });

      if (!res.ok) throw new Error('作成に失敗しました');

      setShowCreateModal(false);
      setNewContact({
        subjectId: '',
        name: '',
        relation: '',
        phone: '',
        email: '',
        lineIdOrHint: '',
        preferredContactType: 'phone',
        availableTimeHint: '',
        notes: '',
        isEmergency: false,
        consentStatus: 'unknown',
      });

      // 作成した対象を選択
      setSelectedSubject({ type: 'client', id: newContact.subjectId });
      await fetchContacts('client', newContact.subjectId);
      await fetchSubjects();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  // 編集開始
  const startEdit = (contact: KeyPersonContact) => {
    setEditingContact(contact);
    setEditData({
      name: contact.name,
      relation: contact.relation || '',
      phone: contact.phone || '',
      email: contact.email || '',
      lineIdOrHint: contact.lineIdOrHint || '',
      preferredContactType: contact.preferredContactType || 'phone',
      availableTimeHint: contact.availableTimeHint || '',
      notes: contact.notes || '',
      isEmergency: contact.isEmergency,
      consentStatus: contact.consentStatus || 'unknown',
    });
  };

  // 編集保存
  const handleSaveEdit = async () => {
    if (!editingContact) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/key-person/${editingContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });

      if (!res.ok) throw new Error('更新に失敗しました');

      setEditingContact(null);
      if (selectedSubject) {
        await fetchContacts(selectedSubject.type, selectedSubject.id);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  // 無効化
  const handleDeactivate = async (contact: KeyPersonContact) => {
    if (!confirm(`「${contact.name}」を無効化しますか？`)) return;

    try {
      const res = await fetch(`/api/key-person/${contact.id}/deactivate`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('無効化に失敗しました');

      if (selectedSubject) {
        await fetchContacts(selectedSubject.type, selectedSubject.id);
        await fetchSubjects();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'エラーが発生しました');
    }
  };

  // 並び替え
  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    if (!selectedSubject) return;

    const newContacts = [...contacts];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newContacts.length) return;

    [newContacts[index], newContacts[targetIndex]] = [
      newContacts[targetIndex],
      newContacts[index],
    ];

    const orderedIds = newContacts.map((c) => c.id);

    try {
      const res = await fetch('/api/key-person/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectType: selectedSubject.type,
          subjectId: selectedSubject.id,
          orderedIds,
        }),
      });

      if (!res.ok) throw new Error('並び替えに失敗しました');

      await fetchContacts(selectedSubject.type, selectedSubject.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'エラーが発生しました');
    }
  };

  // フィルタされた対象一覧
  const filteredSubjects = subjects.filter((s) =>
    s.subjectId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-800">キーパーソン管理</h1>
          <p className="text-sm text-zinc-500 mt-1">
            利用者ごとの連絡先（キーパーソン）を管理
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          新規登録
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左: 対象選択 */}
        <div className="lg:col-span-1 space-y-4">
          {/* 検索 */}
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDirectSearch()}
                  placeholder="利用者IDを検索..."
                  className="w-full pl-10 pr-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleDirectSearch}
                className="px-3 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200"
              >
                検索
              </button>
            </div>
          </div>

          {/* 対象一覧 */}
          <div className="bg-white rounded-lg border border-zinc-200">
            <div className="p-3 border-b border-zinc-200">
              <h2 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                <Users size={16} />
                登録済み利用者 ({subjects.length})
              </h2>
            </div>
            {loading ? (
              <div className="p-4 text-center text-zinc-500">読み込み中...</div>
            ) : filteredSubjects.length === 0 ? (
              <div className="p-4 text-center text-zinc-500">
                対象がありません
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-zinc-100">
                {filteredSubjects.map((subject) => (
                  <button
                    key={`${subject.subjectType}-${subject.subjectId}`}
                    onClick={() =>
                      handleSelectSubject(subject.subjectType, subject.subjectId)
                    }
                    className={`w-full text-left p-3 hover:bg-zinc-50 transition-colors ${
                      selectedSubject?.id === subject.subjectId
                        ? 'bg-blue-50 border-l-2 border-blue-500'
                        : ''
                    }`}
                  >
                    <div className="font-medium text-zinc-800">
                      {subject.subjectId}
                    </div>
                    <div className="text-xs text-zinc-500">
                      連絡先: {subject.contactCount}件
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右: 連絡先一覧 */}
        <div className="lg:col-span-2">
          {selectedSubject ? (
            <div className="bg-white rounded-lg border border-zinc-200">
              <div className="p-4 border-b border-zinc-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-800">
                      {selectedSubject.id} の連絡先
                    </h2>
                    <p className="text-sm text-zinc-500">
                      優先順位順に表示
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setNewContact({
                        ...newContact,
                        subjectId: selectedSubject.id,
                      });
                      setShowCreateModal(true);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
                  >
                    <Plus size={14} />
                    追加
                  </button>
                </div>
              </div>

              {loadingContacts ? (
                <div className="p-8 text-center text-zinc-500">
                  読み込み中...
                </div>
              ) : contacts.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  連絡先がありません
                </div>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {contacts.map((contact, index) => {
                    const preferredConfig = contact.preferredContactType
                      ? PREFERRED_CONTACT_TYPE_CONFIG[contact.preferredContactType]
                      : null;
                    const consentConfig = contact.consentStatus
                      ? CONSENT_STATUS_CONFIG[contact.consentStatus]
                      : null;

                    return (
                      <div
                        key={contact.id}
                        className="p-4 hover:bg-zinc-50 transition-colors"
                      >
                        <div className="flex items-start gap-4">
                          {/* 優先順位 */}
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => handleReorder(index, 'up')}
                              disabled={index === 0}
                              className="p-1 text-zinc-400 hover:text-zinc-600 disabled:opacity-30"
                            >
                              <ChevronUp size={16} />
                            </button>
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                                contact.priorityOrder === 1
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-zinc-100 text-zinc-600'
                              }`}
                            >
                              {contact.priorityOrder}
                            </div>
                            <button
                              onClick={() => handleReorder(index, 'down')}
                              disabled={index === contacts.length - 1}
                              className="p-1 text-zinc-400 hover:text-zinc-600 disabled:opacity-30"
                            >
                              <ChevronDown size={16} />
                            </button>
                          </div>

                          {/* 内容 */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-zinc-800">
                                {contact.name}
                              </span>
                              {contact.relation && (
                                <span className="text-sm text-zinc-500">
                                  ({contact.relation})
                                </span>
                              )}
                              {contact.isEmergency && (
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium flex items-center gap-1">
                                  <AlertTriangle size={12} />
                                  緊急連絡先
                                </span>
                              )}
                              {contact.priorityOrder === 1 && (
                                <Star
                                  size={14}
                                  className="text-amber-500 fill-amber-500"
                                />
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-sm text-zinc-600 mb-2">
                              {contact.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone size={14} />
                                  {CAN_VIEW_PII
                                    ? contact.phone
                                    : maskPhone(contact.phone)}
                                </span>
                              )}
                              {contact.email && (
                                <span className="flex items-center gap-1">
                                  <Mail size={14} />
                                  {CAN_VIEW_PII
                                    ? contact.email
                                    : maskEmail(contact.email)}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              {preferredConfig && (
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${preferredConfig.bg} ${preferredConfig.text}`}
                                >
                                  推奨: {preferredConfig.label}
                                </span>
                              )}
                              {consentConfig && (
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${consentConfig.bg} ${consentConfig.text}`}
                                >
                                  同意: {consentConfig.label}
                                </span>
                              )}
                              {contact.availableTimeHint && (
                                <span className="text-xs text-zinc-500">
                                  {contact.availableTimeHint}
                                </span>
                              )}
                            </div>

                            {contact.notes && (
                              <div className="mt-2 text-sm text-zinc-600 bg-zinc-50 rounded p-2">
                                {contact.notes}
                              </div>
                            )}
                          </div>

                          {/* 操作 */}
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEdit(contact)}
                              className="p-2 text-zinc-400 hover:text-zinc-600"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeactivate(contact)}
                              className="p-2 text-zinc-400 hover:text-red-600"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-zinc-200 p-8 text-center text-zinc-500">
              <Users size={48} className="mx-auto mb-4 text-zinc-300" />
              <p>左側から利用者を選択してください</p>
              <p className="text-sm mt-2">
                または利用者IDを直接入力して検索
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 新規作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200">
              <h2 className="text-lg font-semibold">新規連絡先登録</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  利用者ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newContact.subjectId}
                  onChange={(e) =>
                    setNewContact({ ...newContact, subjectId: e.target.value })
                  }
                  placeholder="例: client_001"
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    名前 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newContact.name}
                    onChange={(e) =>
                      setNewContact({ ...newContact, name: e.target.value })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    続柄
                  </label>
                  <input
                    type="text"
                    value={newContact.relation}
                    onChange={(e) =>
                      setNewContact({ ...newContact, relation: e.target.value })
                    }
                    placeholder="例: 長女"
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    電話番号
                  </label>
                  <input
                    type="tel"
                    value={newContact.phone}
                    onChange={(e) =>
                      setNewContact({ ...newContact, phone: e.target.value })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    メール
                  </label>
                  <input
                    type="email"
                    value={newContact.email}
                    onChange={(e) =>
                      setNewContact({ ...newContact, email: e.target.value })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    推奨連絡手段
                  </label>
                  <select
                    value={newContact.preferredContactType}
                    onChange={(e) =>
                      setNewContact({
                        ...newContact,
                        preferredContactType: e.target.value as PreferredContactType,
                      })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  >
                    {Object.entries(PREFERRED_CONTACT_TYPE_LABELS).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    同意状況
                  </label>
                  <select
                    value={newContact.consentStatus}
                    onChange={(e) =>
                      setNewContact({
                        ...newContact,
                        consentStatus: e.target.value as ConsentStatus,
                      })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  >
                    {Object.entries(CONSENT_STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  連絡可能時間帯
                </label>
                <input
                  type="text"
                  value={newContact.availableTimeHint}
                  onChange={(e) =>
                    setNewContact({
                      ...newContact,
                      availableTimeHint: e.target.value,
                    })
                  }
                  placeholder="例: 平日18時以降"
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  注意事項
                </label>
                <textarea
                  value={newContact.notes}
                  onChange={(e) =>
                    setNewContact({ ...newContact, notes: e.target.value })
                  }
                  rows={3}
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isEmergency"
                  checked={newContact.isEmergency}
                  onChange={(e) =>
                    setNewContact({
                      ...newContact,
                      isEmergency: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
                <label
                  htmlFor="isEmergency"
                  className="text-sm font-medium text-zinc-700"
                >
                  緊急連絡先として登録
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-zinc-200">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-zinc-600 hover:text-zinc-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? '登録中...' : '登録'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {editingContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200">
              <h2 className="text-lg font-semibold">連絡先を編集</h2>
              <button
                onClick={() => setEditingContact(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    名前
                  </label>
                  <input
                    type="text"
                    value={editData.name}
                    onChange={(e) =>
                      setEditData({ ...editData, name: e.target.value })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    続柄
                  </label>
                  <input
                    type="text"
                    value={editData.relation}
                    onChange={(e) =>
                      setEditData({ ...editData, relation: e.target.value })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    電話番号
                  </label>
                  <input
                    type="tel"
                    value={editData.phone}
                    onChange={(e) =>
                      setEditData({ ...editData, phone: e.target.value })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    メール
                  </label>
                  <input
                    type="email"
                    value={editData.email}
                    onChange={(e) =>
                      setEditData({ ...editData, email: e.target.value })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    推奨連絡手段
                  </label>
                  <select
                    value={editData.preferredContactType}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        preferredContactType: e.target.value as PreferredContactType,
                      })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  >
                    {Object.entries(PREFERRED_CONTACT_TYPE_LABELS).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    同意状況
                  </label>
                  <select
                    value={editData.consentStatus}
                    onChange={(e) =>
                      setEditData({
                        ...editData,
                        consentStatus: e.target.value as ConsentStatus,
                      })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  >
                    {Object.entries(CONSENT_STATUS_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  連絡可能時間帯
                </label>
                <input
                  type="text"
                  value={editData.availableTimeHint}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      availableTimeHint: e.target.value,
                    })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  注意事項
                </label>
                <textarea
                  value={editData.notes}
                  onChange={(e) =>
                    setEditData({ ...editData, notes: e.target.value })
                  }
                  rows={3}
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editIsEmergency"
                  checked={editData.isEmergency}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      isEmergency: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
                <label
                  htmlFor="editIsEmergency"
                  className="text-sm font-medium text-zinc-700"
                >
                  緊急連絡先として登録
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-zinc-200">
              <button
                onClick={() => setEditingContact(null)}
                className="px-4 py-2 text-zinc-600 hover:text-zinc-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={16} />
                {submitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
