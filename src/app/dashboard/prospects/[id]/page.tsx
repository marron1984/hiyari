'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Select, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getProspect,
  updateProspectStatus,
  assignProspect,
  updateProspect,
  findAvailableRooms,
  getAuditLogs,
} from '@/lib/prospect';
import { getFacilities } from '@/lib/vacancy';
import { hasMinRole } from '@/lib/auth';
import {
  Prospect,
  ProspectStatus,
  PROSPECT_STATUSES,
  PROSPECT_STATUS_CONFIG,
  Room,
  AuditLog,
  calculateDaysElapsed,
} from '@/types/prospect';
import { Facility } from '@/types/vacancy';
import { User } from '@/types';
import {
  ArrowLeft,
  User as UserIcon,
  Building2,
  Calendar,
  Clock,
  Phone,
  FileText,
  AlertTriangle,
  Check,
  Edit,
  Save,
  X,
  History,
  Home,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getUsers } from '@/lib/firestore';

export default function ProspectDetailPage() {
  return (
    <AuthGuard>
      <ProspectDetailContent />
    </AuthGuard>
  );
}

function ProspectDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // 編集モード
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Prospect>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 折りたたみ
  const [showRawData, setShowRawData] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const canManage = hasMinRole(user?.role, 'leader');

  const fetchData = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    try {
      const [prospectData, facilitiesData, usersData] = await Promise.all([
        getProspect(id as string),
        getFacilities(user.tenantId),
        getUsers(),
      ]);

      if (!prospectData) {
        router.push('/dashboard/prospects');
        return;
      }

      setProspect(prospectData);
      setFacilities(facilitiesData);
      setUsers(usersData);
      setEditData(prospectData);

      // 希望施設に基づいて空き部屋を検索
      if (prospectData.desiredFacility) {
        const rooms = await findAvailableRooms(user.tenantId, prospectData.desiredFacility);
        setAvailableRooms(rooms);
      }

      // 監査ログ
      const logs = await getAuditLogs(user.tenantId, { entity: 'prospect', entityId: id as string });
      setAuditLogs(logs);
    } catch (err) {
      console.error('Failed to fetch prospect:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user, id, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusChange = async (newStatus: ProspectStatus) => {
    if (!prospect || !user || !canManage) return;

    setSaving(true);
    setError(null);
    try {
      const result = await updateProspectStatus(
        prospect.id,
        newStatus,
        undefined,
        user.id,
        user.name,
        user.role
      );
      setSuccess(`ステータスを「${newStatus}」に更新しました`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (assigneeId: string) => {
    if (!prospect || !user || !canManage) return;

    const assignee = users.find((u) => u.id === assigneeId);
    if (!assignee) return;

    setSaving(true);
    setError(null);
    try {
      await assignProspect(
        prospect.id,
        assigneeId,
        assignee.name,
        user.id,
        user.name,
        user.role
      );
      setSuccess(`担当者を「${assignee.name}」に変更しました`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!prospect || !user || !canManage) return;

    setSaving(true);
    setError(null);
    try {
      await updateProspect(
        prospect.id,
        editData,
        user.id,
        user.name,
        user.role
      );
      setSuccess('保存しました');
      setEditing(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
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

  if (!prospect) {
    return (
      <>
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-6 text-center">
          <p className="text-gray-500">入居希望者が見つかりません</p>
        </div>
      </>
    );
  }

  const statusConfig = PROSPECT_STATUS_CONFIG[prospect.status];
  const daysElapsed = calculateDaysElapsed(prospect.receivedAt);

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* 戻るボタン */}
          <Link href="/dashboard/prospects" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4">
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
                    <h1 className="text-2xl font-bold">
                      {prospect.customerName || '名前未登録'}
                    </h1>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
                      {prospect.status}
                    </span>
                    {prospect.duplicateCandidates && prospect.duplicateCandidates.length > 0 && (
                      <Badge variant="warning" className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        重複候補あり
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    {prospect.age && <span>{prospect.age}歳</span>}
                    {prospect.gender && <span>{prospect.gender}</span>}
                    {prospect.careLevel && <Badge variant="default">{prospect.careLevel}</Badge>}
                    <span>受信: {prospect.receivedAt.toLocaleDateString('ja-JP')}</span>
                    <span className={daysElapsed > 7 ? 'text-orange-500' : ''}>
                      滞留{daysElapsed}日
                    </span>
                  </div>
                </div>

                {canManage && (
                  <div className="flex gap-2">
                    {editing ? (
                      <>
                        <Button onClick={handleSaveEdit} disabled={saving}>
                          <Save className="w-4 h-4 mr-1" />
                          保存
                        </Button>
                        <Button variant="secondary" onClick={() => { setEditing(false); setEditData(prospect); }}>
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

              {/* ステータス・担当者変更 */}
              {canManage && !editing && (
                <div className="mt-4 pt-4 border-t flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">ステータス:</label>
                    <Select
                      value={prospect.status}
                      onChange={(e) => handleStatusChange(e.target.value as ProspectStatus)}
                      options={PROSPECT_STATUSES.map((s) => ({ value: s, label: s }))}
                      disabled={saving}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">担当者:</label>
                    <Select
                      value={prospect.assigneeId || ''}
                      onChange={(e) => handleAssign(e.target.value)}
                      options={[
                        { value: '', label: '未割当' },
                        ...users.map((u) => ({ value: u.id, label: u.name })),
                      ]}
                      disabled={saving}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 詳細情報 */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* 顧客情報 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserIcon className="w-4 h-4" />
                  顧客情報
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="顧客名" value={prospect.customerName} editing={editing} field="customerName" editData={editData} setEditData={setEditData} />
                <InfoRow label="年齢" value={prospect.age?.toString()} editing={editing} field="age" editData={editData} setEditData={setEditData} type="number" />
                <InfoRow label="性別" value={prospect.gender} />
                <InfoRow label="介護度" value={prospect.careLevel} />
                <InfoRow label="障害区分" value={prospect.disabilityCategory} />
                <InfoRow label="キーパーソン" value={prospect.keyPerson} editing={editing} field="keyPerson" editData={editData} setEditData={setEditData} />
              </CardContent>
            </Card>

            {/* 入居希望 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="w-4 h-4" />
                  入居希望
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="希望施設" value={prospect.desiredFacility} editing={editing} field="desiredFacility" editData={editData} setEditData={setEditData} />
                <InfoRow label="入居予定日" value={prospect.desiredMoveInDate} editing={editing} field="desiredMoveInDate" editData={editData} setEditData={setEditData} />
                <InfoRow label="見学希望日" value={prospect.tourRequestDate} editing={editing} field="tourRequestDate" editData={editData} setEditData={setEditData} />
                <InfoRow label="面談日時" value={prospect.interviewDateTime} editing={editing} field="interviewDateTime" editData={editData} setEditData={setEditData} />
                <InfoRow label="エント希望" value={prospect.entertainmentWish} />
              </CardContent>
            </Card>

            {/* 費用・予算 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  費用・予算
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="費用" value={prospect.budget} editing={editing} field="budget" editData={editData} setEditData={setEditData} />
                <InfoRow label="費用詳細" value={prospect.budgetDetail} />
                <InfoRow label="月額希望" value={prospect.monthlyBudget} />
                <InfoRow label="借金有無" value={prospect.debtStatus} />
              </CardContent>
            </Card>

            {/* ADL状況 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  ADL状況
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="ADL概要" value={prospect.adlSummary} />
                <InfoRow label="ADL詳細" value={prospect.adlDetail} />
                {prospect.adl && (
                  <>
                    <InfoRow label="立位" value={prospect.adl.standing} />
                    <InfoRow label="入浴" value={prospect.adl.bathing} />
                    <InfoRow label="食事" value={prospect.adl.eating} />
                    <InfoRow label="排泄" value={prospect.adl.toileting} />
                  </>
                )}
              </CardContent>
            </Card>

            {/* 現在状況 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  現在状況
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="現在状況" value={prospect.currentSituation} />
                <InfoRow label="現住所/入院先" value={prospect.currentAddress} />
                <InfoRow label="詳細状況" value={prospect.currentDetail} />
              </CardContent>
            </Card>

            {/* 営業会社 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Phone className="w-4 h-4" />
                  営業会社
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="営業会社名" value={prospect.salesCompanyName} />
                <InfoRow label="営業担当者" value={prospect.salesRepName} />
                <InfoRow label="連絡先" value={prospect.salesRepContact} />
                <InfoRow label="問い合わせ日" value={prospect.inquiryDate} />
              </CardContent>
            </Card>
          </div>

          {/* 備考 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">その他備考</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <textarea
                  value={editData.otherNotes || ''}
                  onChange={(e) => setEditData({ ...editData, otherNotes: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              ) : (
                <p className="text-gray-700 whitespace-pre-wrap">
                  {prospect.otherNotes || '(なし)'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* 空き部屋候補 */}
          {availableRooms.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Home className="w-4 h-4" />
                  空き部屋候補（{prospect.desiredFacility}）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {availableRooms.map((room) => (
                    <div
                      key={room.id}
                      className="p-3 bg-green-50 rounded-lg text-center"
                    >
                      <p className="font-medium">{room.roomNumber}</p>
                      {room.expectedCareLevel && (
                        <p className="text-xs text-gray-500">{room.expectedCareLevel}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 生データ（折りたたみ） */}
          <Card className="mb-6">
            <CardHeader>
              <button
                onClick={() => setShowRawData(!showRawData)}
                className="flex items-center justify-between w-full"
              >
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-4 h-4" />
                  元データ
                </CardTitle>
                {showRawData ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </CardHeader>
            {showRawData && (
              <CardContent>
                {prospect.rawTranscript && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">文字起こし</h4>
                    <pre className="p-4 bg-gray-50 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap max-h-64">
                      {prospect.rawTranscript}
                    </pre>
                  </div>
                )}
                {prospect.rawPayload && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">抽出JSON</h4>
                    <pre className="p-4 bg-gray-50 rounded-lg text-xs overflow-x-auto max-h-64">
                      {JSON.stringify(prospect.rawPayload, null, 2)}
                    </pre>
                  </div>
                )}
                {!prospect.rawTranscript && !prospect.rawPayload && (
                  <p className="text-gray-500 text-sm">元データがありません</p>
                )}
              </CardContent>
            )}
          </Card>

          {/* 変更履歴（折りたたみ） */}
          <Card>
            <CardHeader>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center justify-between w-full"
              >
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="w-4 h-4" />
                  変更履歴
                </CardTitle>
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </CardHeader>
            {showHistory && (
              <CardContent>
                {auditLogs.length > 0 ? (
                  <div className="space-y-3">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 text-sm">
                        <div className="p-1 bg-gray-100 rounded">
                          <Clock className="w-3 h-3 text-gray-500" />
                        </div>
                        <div className="flex-1">
                          <p className="text-gray-700">
                            <span className="font-medium">{log.actorName}</span>
                            {' が '}
                            <span className="font-medium">
                              {log.action === 'create' && '作成'}
                              {log.action === 'update' && '更新'}
                              {log.action === 'status_change' && 'ステータス変更'}
                              {log.action === 'assign' && '担当者変更'}
                              {log.action === 'merge' && '統合'}
                            </span>
                          </p>
                          {log.note && <p className="text-gray-500 text-xs">{log.note}</p>}
                          <p className="text-gray-400 text-xs">
                            {log.createdAt.toLocaleString('ja-JP')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">履歴がありません</p>
                )}
              </CardContent>
            )}
          </Card>
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
  field?: keyof Prospect;
  editData?: Partial<Prospect>;
  setEditData?: (data: Partial<Prospect>) => void;
  type?: 'text' | 'number';
}) {
  if (editing && field && editData && setEditData) {
    return (
      <div className="flex items-center">
        <span className="text-sm text-gray-500 w-28 shrink-0">{label}</span>
        <Input
          type={type}
          value={(editData[field] as string | number) ?? ''}
          onChange={(e) =>
            setEditData({
              ...editData,
              [field]: type === 'number' ? parseInt(e.target.value) || undefined : e.target.value,
            })
          }
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <div className="flex">
      <span className="text-sm text-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-sm text-gray-900">{value || '-'}</span>
    </div>
  );
}
