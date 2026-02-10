'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
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
import { canManageProspects } from '@/lib/auth';
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
  Lock,
  Unlock,
  FilePlus,
} from 'lucide-react';
import { getUsers } from '@/lib/firestore';
import { ProspectDocuments } from '@/components/ProspectDocuments';
import type { ProspectDocument } from '@/types/prospect';

export default function ProspectDetailPage() {
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

  // 部屋選択モーダル
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ProspectStatus | null>(null);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // 書類生成
  const [generatingDocs, setGeneratingDocs] = useState(false);
  const [docsGenerated, setDocsGenerated] = useState(false);

  const canManage = canManageProspects(user?.role, user?.email, user?.modulePermissions);

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

    // 「申込中」への変更時は部屋選択モーダルを表示
    if (newStatus === '申込中') {
      setPendingStatus(newStatus);
      setLoadingRooms(true);
      try {
        const response = await fetch('/api/rooms/available');
        const data = await response.json();
        if (data.success) {
          setAllRooms(data.rooms);
        }
      } catch (err) {
        console.error('Failed to fetch rooms:', err);
      } finally {
        setLoadingRooms(false);
      }
      setShowRoomModal(true);
      return;
    }

    // 「見送り」「クローズ」への変更時は自動的にロック解除
    if ((newStatus === '見送り' || newStatus === 'クローズ') && prospect.selectedRoomId) {
      try {
        await fetch(`/api/prospects/${prospect.id}/lock-room`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
          }),
        });
      } catch (err) {
        console.error('Failed to unlock room:', err);
      }
    }

    setSaving(true);
    setError(null);
    try {
      await updateProspectStatus(
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

  // 部屋選択後の処理
  const handleRoomSelect = async (roomId: string) => {
    if (!prospect || !user || !pendingStatus) return;

    setSaving(true);
    setError(null);
    try {
      // 部屋をロック
      const lockResponse = await fetch(`/api/prospects/${prospect.id}/lock-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          userId: user.id,
          userName: user.name,
          userRole: user.role,
        }),
      });
      const lockData = await lockResponse.json();

      if (!lockData.success) {
        setError(lockData.error || '部屋のロックに失敗しました');
        return;
      }

      // ステータスを更新
      await updateProspectStatus(
        prospect.id,
        pendingStatus,
        undefined,
        user.id,
        user.name,
        user.role
      );

      setSuccess(`ステータスを「${pendingStatus}」に更新し、${lockData.data.roomName}をロックしました`);
      setShowRoomModal(false);
      setPendingStatus(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 部屋選択をスキップ
  const handleSkipRoomSelect = async () => {
    if (!prospect || !user || !pendingStatus) return;

    setSaving(true);
    setError(null);
    try {
      await updateProspectStatus(
        prospect.id,
        pendingStatus,
        undefined,
        user.id,
        user.name,
        user.role
      );
      setSuccess(`ステータスを「${pendingStatus}」に更新しました（部屋未選択）`);
      setShowRoomModal(false);
      setPendingStatus(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // ロック解除
  const handleUnlockRoom = async () => {
    if (!prospect || !user || !prospect.selectedRoomId) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/prospects/${prospect.id}/lock-room`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          userName: user.name,
          userRole: user.role,
        }),
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'ロック解除に失敗しました');
        return;
      }

      setSuccess('ロックを解除しました');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ロック解除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 入居者必須書類の自動生成
  const handleGenerateDocuments = async () => {
    if (!prospect || !user) return;

    setGeneratingDocs(true);
    setError(null);
    try {
      const response = await fetch('/api/documents/generate-required', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: user.tenantId,
          ownerType: 'RESIDENT',
          ownerId: prospect.id,
          ownerName: prospect.customerName || prospect.id,
          actorId: user.id,
          actorName: user.name,
        }),
      });
      const data = await response.json();

      if (!data.success) {
        setError(data.error || '書類生成に失敗しました');
        return;
      }

      if (data.existing > 0) {
        setSuccess(`既に${data.existing}件の書類が存在します`);
      } else {
        setSuccess(`${data.created}件の必須書類を生成しました`);
      }
      setDocsGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '書類生成に失敗しました');
    } finally {
      setGeneratingDocs(false);
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
    return <Loading text="読み込み中..." />;
  }

  if (!prospect) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 text-center">
        <p className="text-gray-500">入居希望者が見つかりません</p>
      </div>
    );
  }

  const statusConfig = PROSPECT_STATUS_CONFIG[prospect.status];
  const daysElapsed = calculateDaysElapsed(prospect.receivedAt);

  return (
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

              {/* ロック済み部屋の表示 */}
              {prospect.selectedRoomId && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-blue-600" />
                      <span className="text-sm text-blue-800">
                        <span className="font-medium">{prospect.selectedRoomName}</span> をロック中
                      </span>
                      {prospect.appliedAt && (
                        <span className="text-xs text-blue-600">
                          （{new Date(prospect.appliedAt).toLocaleDateString('ja-JP')}〜）
                        </span>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleUnlockRoom}
                        disabled={saving}
                      >
                        <Unlock className="w-4 h-4 mr-1" />
                        解除
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* 入居決定時の書類生成 */}
              {prospect.status === '入居決定' && canManage && !docsGenerated && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FilePlus className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-800">
                        入居者の必須書類を生成できます
                      </span>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleGenerateDocuments}
                      disabled={generatingDocs}
                    >
                      {generatingDocs ? (
                        <>処理中...</>
                      ) : (
                        <>
                          <FilePlus className="w-4 h-4 mr-1" />
                          書類生成
                        </>
                      )}
                    </Button>
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

          {/* 書類管理 */}
          <div className="mb-6">
            <ProspectDocuments
              prospectId={prospect.id}
              documents={(prospect.documents || []) as ProspectDocument[]}
              onRefresh={fetchData}
            />
          </div>

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

        {/* 部屋選択モーダル */}
        {showRoomModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Home className="w-5 h-5" />
                  部屋を選択
                </h3>
                <button
                  onClick={() => {
                    setShowRoomModal(false);
                    setPendingStatus(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto max-h-[60vh]">
                {loadingRooms ? (
                  <div className="text-center py-8 text-gray-500">読み込み中...</div>
                ) : allRooms.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">空室がありません</div>
                ) : (
                  <>
                    <p className="text-sm text-gray-600 mb-4">
                      申込に伴い、ロックする部屋を選択してください。
                    </p>
                    {/* 建物ごとにグループ化 */}
                    {Object.entries(
                      allRooms.reduce((acc, room) => {
                        if (!acc[room.buildingName]) acc[room.buildingName] = [];
                        acc[room.buildingName].push(room);
                        return acc;
                      }, {} as Record<string, Room[]>)
                    ).map(([buildingName, rooms]) => (
                      <div key={buildingName} className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">{buildingName}</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {rooms.map((room) => (
                            <button
                              key={room.id}
                              onClick={() => handleRoomSelect(room.id)}
                              disabled={saving || room.status === '予約'}
                              className={`p-3 rounded-lg text-left transition ${
                                room.status === '予約'
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-green-50 hover:bg-green-100 text-green-800'
                              }`}
                            >
                              <p className="font-medium">{room.roomNumber}</p>
                              <p className="text-xs">
                                {room.status === '予約' ? (
                                  <span className="flex items-center gap-1">
                                    <Lock className="w-3 h-3" />
                                    ロック済
                                  </span>
                                ) : (
                                  '空室'
                                )}
                              </p>
                              {room.expectedCareLevel && (
                                <p className="text-xs opacity-75">{room.expectedCareLevel}</p>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="p-4 border-t flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={handleSkipRoomSelect}
                  disabled={saving}
                >
                  部屋を選択せずに進む
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowRoomModal(false);
                    setPendingStatus(null);
                  }}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
      )}
    </main>
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
