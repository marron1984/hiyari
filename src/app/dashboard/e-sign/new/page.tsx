'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, Button } from '@/components/ui';
import {
  FileSignature,
  ArrowLeft,
  Save,
  User,
  FileText,
  Calendar,
} from 'lucide-react';
import type {
  SubjectType,
  SignMethod,
  SignStatus,
} from '@/lib/esign/types';
import {
  SUBJECT_TYPE_CONFIG,
  SIGN_METHOD_CONFIG,
  SIGN_STATUS_CONFIG,
} from '@/lib/esign/types';

export default function ESignNewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // フォーム状態
  const [subjectType, setSubjectType] = useState<SubjectType>('client');
  const [subjectId, setSubjectId] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [method, setMethod] = useState<SignMethod>('paper');
  const [status, setStatus] = useState<SignStatus>('signed');
  const [documentId, setDocumentId] = useState('');
  const [documentVersionId, setDocumentVersionId] = useState('');
  const [agreementConsentId, setAgreementConsentId] = useState('');
  const [contractId, setContractId] = useState('');
  const [requestedAt, setRequestedAt] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!subjectName.trim()) {
      setError('署名者名は必須です');
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        subjectType,
        subjectId: subjectId || null,
        subjectName: subjectName.trim(),
        method,
        status,
        documentId: documentId || null,
        documentVersionId: documentVersionId || null,
        agreementConsentId: agreementConsentId || null,
        contractId: contractId || null,
        requestedAt: requestedAt ? new Date(requestedAt).toISOString() : null,
        signedAt: signedAt ? new Date(signedAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        note: note.trim() || null,
      };

      const res = await fetch('/api/e-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/dashboard/e-sign/${data.record.id}`);
      } else {
        setError(data.error || '作成に失敗しました');
      }
    } catch (err) {
      console.error('[E-Sign New] Error:', err);
      setError('作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/e-sign"
          className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-zinc-600" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <FileSignature className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">署名ログ登録</h1>
            <p className="text-sm text-zinc-500">紙面署名・対面同意などを記録</p>
          </div>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 署名者情報 */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-700">署名者情報</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  対象タイプ <span className="text-red-500">*</span>
                </label>
                <select
                  value={subjectType}
                  onChange={(e) => setSubjectType(e.target.value as SubjectType)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Object.entries(SUBJECT_TYPE_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  対象ID（任意）
                </label>
                <input
                  type="text"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  placeholder="内部ID"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  署名者名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="山田 太郎"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 署名情報 */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileSignature className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-700">署名情報</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  署名方法 <span className="text-red-500">*</span>
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as SignMethod)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Object.entries(SIGN_METHOD_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label} - {config.description}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  ステータス <span className="text-red-500">*</span>
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as SignStatus)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Object.entries(SIGN_STATUS_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 関連文書 */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-700">関連文書（任意）</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  文書ID
                </label>
                <input
                  type="text"
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  placeholder="doc_xxx"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  文書バージョンID（推奨）
                </label>
                <input
                  type="text"
                  value={documentVersionId}
                  onChange={(e) => setDocumentVersionId(e.target.value)}
                  placeholder="docv_xxx"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-zinc-500 mt-1">特定版を固定することを推奨</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  同意ID（agreements）
                </label>
                <input
                  type="text"
                  value={agreementConsentId}
                  onChange={(e) => setAgreementConsentId(e.target.value)}
                  placeholder="consent_xxx"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  契約ID（contracts）
                </label>
                <input
                  type="text"
                  value={contractId}
                  onChange={(e) => setContractId(e.target.value)}
                  placeholder="contract_xxx"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 日時 */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-700">日時情報（任意）</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  依頼日時
                </label>
                <input
                  type="datetime-local"
                  value={requestedAt}
                  onChange={(e) => setRequestedAt(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  署名日時
                </label>
                <input
                  type="datetime-local"
                  value={signedAt}
                  onChange={(e) => setSignedAt(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  署名期限
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 備考 */}
        <Card>
          <CardContent className="p-5">
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              備考（任意）
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="署名に関する補足情報..."
              rows={3}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </CardContent>
        </Card>

        {/* 送信ボタン */}
        <div className="flex justify-end gap-3">
          <Link href="/dashboard/e-sign">
            <Button variant="secondary" type="button">
              キャンセル
            </Button>
          </Link>
          <Button type="submit" disabled={loading} className="gap-1.5">
            <Save className="w-4 h-4" />
            {loading ? '登録中...' : '登録'}
          </Button>
        </div>
      </form>
    </div>
  );
}
