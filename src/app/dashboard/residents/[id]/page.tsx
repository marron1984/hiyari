'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { getResident, updateResident } from '@/lib/resident';
import { getDocuments, generateRequiredDocuments } from '@/lib/document';
import { hasMinRole } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import {
  Resident,
  RESIDENT_STATUS_CONFIG,
  calculateAge,
  getDaysUntilBirthday,
} from '@/types/resident';
import { Document, DOCUMENT_STATUS_CONFIG } from '@/types/document';
import {
  ArrowLeft,
  User,
  Building2,
  Calendar,
  Phone,
  FileText,
  Edit,
  Save,
  X,
  Cake,
  Upload,
  Download,
  AlertTriangle,
  Check,
  Clock,
  FilePlus,
  RefreshCw,
} from 'lucide-react';

type TabType = 'basic' | 'documents' | 'logs';

export default function ResidentDetailPage() {
  return (
    <AuthGuard>
      <ResidentDetailContent />
    </AuthGuard>
  );
}

function ResidentDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [resident, setResident] = useState<Resident | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('basic');

  // 編集モード
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Resident>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 書類生成
  const [generatingDocs, setGeneratingDocs] = useState(false);

  // アップロード
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocId, setUploadDocId] = useState<string | null>(null);

  const residentId = params.id as string;
  const canManage = hasMinRole(user?.role, 'leader');

  const fetchData = useCallback(async () => {
    if (!residentId || !user) return;
    setLoading(true);
    try {
      const [residentData, docsData] = await Promise.all([
        getResident(residentId),
        getDocuments(user.tenantId, { ownerType: 'RESIDENT', ownerId: residentId }),
      ]);

      if (!residentData) {
        router.push('/dashboard/residents');
        return;
      }

      setResident(residentData);
      setDocuments(docsData);
      setEditData(residentData);
    } catch (err) {
      console.error('Failed to fetch resident:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [residentId, user, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!resident || !user) return;
    setSaving(true);
    setError(null);
    try {
      await updateResident(resident.id, editData, user.id);
      setSuccess('保存しました');
      setEditing(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDocuments = async () => {
    if (!resident || !user) return;
    setGeneratingDocs(true);
    setError(null);
    try {
      const created = await generateRequiredDocuments(
        'RESIDENT',
        resident.id,
        resident.name,
        user.tenantId,
        user.id,
        user.name
      );
      setSuccess(`${created.length}件の必須書類を生成しました`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '書類生成に失敗しました');
    } finally {
      setGeneratingDocs(false);
    }
  };

  const handleUploadClick = (docId: string) => {
    setUploadDocId(docId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadDocId) return;

    setUploading(true);
    setError(null);

    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error('認証が必要です');

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/documents/${uploadDocId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'アップロードに失敗しました');
      }

      setSuccess('アップロードしました');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました');
    } finally {
      setUploading(false);
      setUploadDocId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  if (!resident) {
    return (
      <>
        <Header />
        <main className="pb-20 md:pb-8">
          <div className="max-w-4xl mx-auto px-4 py-6 text-center">
            <p className="text-gray-500">入居者が見つかりません</p>
          </div>
        </main>
      </>
    );
  }

  const statusConfig = RESIDENT_STATUS_CONFIG[resident.status];

  // 日付変換ヘルパー
  const toDate = (d: Date | string | undefined): Date | null => {
    if (!d) return null;
    return d instanceof Date ? d : new Date(d);
  };
  const formatDate = (d: Date | string | undefined): string | undefined => {
    const date = toDate(d);
    return date?.toLocaleDateString('ja-JP');
  };

  const birthDateObj = toDate(resident.birthDate);
  const age = birthDateObj ? calculateAge(birthDateObj) : null;
  const daysUntilBirthday = birthDateObj ? getDaysUntilBirthday(birthDateObj) : null;

  const docStats = {
    total: documents.length,
    missing: documents.filter((d) => d.status === 'MISSING').length,
    submitted: documents.filter((d) => d.status === 'SUBMITTED').length,
    expired: documents.filter((d) => d.status === 'EXPIRED').length,
  };

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* 戻るボタン */}
          <Link
            href="/dashboard/residents"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            一覧に戻る
          </Link>

          {/* メッセージ */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
              {success}
            </div>
          )}

          {/* ヘッダーカード */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl font-bold">{resident.name}</h1>
                    {resident.nameKana && (
                      <span className="text-gray-500">({resident.nameKana})</span>
                    )}
                    <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
                      {statusConfig.label}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    {age !== null && <span>{age}歳</span>}
                    {birthDateObj && (
                      <span className="flex items-center gap-1">
                        <Cake className="w-3 h-3" />
                        {birthDateObj.toLocaleDateString('ja-JP')}
                        {daysUntilBirthday !== null && daysUntilBirthday <= 30 && (
                          <Badge className="bg-pink-50 text-pink-600 text-xs ml-1">
                            {daysUntilBirthday === 0 ? '今日!' : `${daysUntilBirthday}日後`}
                          </Badge>
                        )}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {resident.facilityName || '未設定'}
                      {resident.roomNumber && ` / ${resident.roomNumber}`}
                    </span>
                  </div>
                </div>

                {canManage && (
                  <div className="flex gap-2">
                    {editing ? (
                      <>
                        <Button onClick={handleSave} disabled={saving}>
                          <Save className="w-4 h-4 mr-1" />
                          保存
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditing(false);
                            setEditData(resident);
                          }}
                        >
                          <X className="w-4 h-4 mr-1" />
                          キャンセル
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" onClick={() => setEditing(true)}>
                        <Edit className="w-4 h-4 mr-1" />
                        編集
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* 書類ステータス */}
              <div className="mt-4 pt-4 border-t flex gap-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">書類:</span>
                  {docStats.missing > 0 && (
                    <Badge className="bg-red-50 text-red-600">
                      未回収{docStats.missing}
                    </Badge>
                  )}
                  {docStats.expired > 0 && (
                    <Badge className="bg-yellow-50 text-yellow-600">
                      期限切{docStats.expired}
                    </Badge>
                  )}
                  <Badge className="bg-green-50 text-green-600">
                    回収済{docStats.submitted}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* タブ */}
          <div className="flex border-b mb-6">
            {[
              { key: 'basic', label: '基本情報', icon: User },
              { key: 'documents', label: '書類', icon: FileText },
              { key: 'logs', label: '連絡ログ', icon: Clock },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as TabType)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 -mb-px transition-colors ${
                  activeTab === key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* 基本情報タブ */}
          {activeTab === 'basic' && (
            <div className="grid md:grid-cols-2 gap-6">
              {/* 基本情報 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4" />
                    基本情報
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <InfoRow
                    label="氏名"
                    value={resident.name}
                    editing={editing}
                    field="name"
                    editData={editData}
                    setEditData={setEditData}
                  />
                  <InfoRow
                    label="ふりがな"
                    value={resident.nameKana}
                    editing={editing}
                    field="nameKana"
                    editData={editData}
                    setEditData={setEditData}
                  />
                  <InfoRow
                    label="生年月日"
                    value={formatDate(resident.birthDate)}
                    editing={editing}
                    field="birthDate"
                    editData={editData}
                    setEditData={setEditData}
                    type="date"
                  />
                  <InfoRow label="年齢" value={age !== null ? `${age}歳` : undefined} />
                  <InfoRow label="性別" value={resident.gender} />
                  <InfoRow label="介護度" value={resident.careLevel} />
                </CardContent>
              </Card>

              {/* 入居情報 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    入居情報
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <InfoRow
                    label="建物"
                    value={resident.facilityName}
                    editing={editing}
                    field="facilityName"
                    editData={editData}
                    setEditData={setEditData}
                  />
                  <InfoRow
                    label="部屋番号"
                    value={resident.roomNumber}
                    editing={editing}
                    field="roomNumber"
                    editData={editData}
                    setEditData={setEditData}
                  />
                  <InfoRow
                    label="入居開始日"
                    value={formatDate(resident.moveInDate)}
                    editing={editing}
                    field="moveInDate"
                    editData={editData}
                    setEditData={setEditData}
                    type="date"
                  />
                  <InfoRow
                    label="退去予定日"
                    value={formatDate(resident.moveOutPlannedDate)}
                    editing={editing}
                    field="moveOutPlannedDate"
                    editData={editData}
                    setEditData={setEditData}
                    type="date"
                  />
                </CardContent>
              </Card>

              {/* キーパーソン */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    キーパーソン
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <InfoRow
                    label="氏名"
                    value={resident.keyPersonName}
                    editing={editing}
                    field="keyPersonName"
                    editData={editData}
                    setEditData={setEditData}
                  />
                  <InfoRow
                    label="続柄"
                    value={resident.keyPersonRelation}
                    editing={editing}
                    field="keyPersonRelation"
                    editData={editData}
                    setEditData={setEditData}
                  />
                  <InfoRow
                    label="連絡先"
                    value={resident.keyPersonContact}
                    editing={editing}
                    field="keyPersonContact"
                    editData={editData}
                    setEditData={setEditData}
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {/* 書類タブ */}
          {activeTab === 'documents' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    書類一覧
                    <Badge>{documents.length}件</Badge>
                  </span>
                  {canManage && documents.length === 0 && (
                    <Button onClick={handleGenerateDocuments} disabled={generatingDocs}>
                      {generatingDocs ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <FilePlus className="w-4 h-4 mr-1" />
                          必須書類を生成
                        </>
                      )}
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                />

                {documents.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>書類がありません</p>
                    <p className="text-sm mt-2">
                      「必須書類を生成」ボタンで入居時必須書類を作成できます
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {documents.map((doc) => {
                      const docStatusConfig = DOCUMENT_STATUS_CONFIG[doc.status];
                      return (
                        <div
                          key={doc.id}
                          className="py-4 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${docStatusConfig.bgColor}`}>
                              <FileText className={`w-5 h-5 ${docStatusConfig.color}`} />
                            </div>
                            <div>
                              <p className="font-medium">
                                {doc.docTypeName || doc.docType}
                              </p>
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                {doc.dueDate && (
                                  <span>期限: {doc.dueDate.toLocaleDateString('ja-JP')}</span>
                                )}
                                {doc.version > 1 && <span>v{doc.version}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className={`${docStatusConfig.bgColor} ${docStatusConfig.color}`}>
                              {docStatusConfig.label}
                            </Badge>
                            {doc.fileUrl ? (
                              <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            ) : (
                              canManage && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleUploadClick(doc.id)}
                                  disabled={uploading}
                                >
                                  <Upload className="w-4 h-4 mr-1" />
                                  アップロード
                                </Button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 連絡ログタブ */}
          {activeTab === 'logs' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  連絡ログ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>連絡ログ機能は後続で実装予定です</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}

// 情報行コンポーネント
function InfoRow({
  label,
  value,
  editing = false,
  field,
  editData,
  setEditData,
  type = 'text',
}: {
  label: string;
  value?: string | null;
  editing?: boolean;
  field?: keyof Resident;
  editData?: Partial<Resident>;
  setEditData?: React.Dispatch<React.SetStateAction<Partial<Resident>>>;
  type?: 'text' | 'date' | 'number';
}) {
  if (editing && field && editData && setEditData) {
    const currentValue = editData[field];
    let inputValue = '';

    if (type === 'date' && currentValue instanceof Date) {
      inputValue = currentValue.toISOString().split('T')[0];
    } else if (currentValue !== undefined && currentValue !== null) {
      inputValue = String(currentValue);
    }

    return (
      <div className="flex justify-between items-center">
        <span className="text-gray-500 text-sm">{label}</span>
        <Input
          type={type}
          value={inputValue}
          onChange={(e) => {
            let newValue: string | number | Date | undefined = e.target.value;
            if (type === 'number') {
              newValue = parseInt(e.target.value) || undefined;
            } else if (type === 'date' && e.target.value) {
              newValue = new Date(e.target.value);
            }
            setEditData({ ...editData, [field]: newValue });
          }}
          className="w-48 text-right"
        />
      </div>
    );
  }

  return (
    <div className="flex justify-between">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-sm">{value || '-'}</span>
    </div>
  );
}
