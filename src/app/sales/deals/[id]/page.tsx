'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Badge, Button, Input, Select, Textarea } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getSalesDeal,
  getSalesAccount,
  updateSalesDeal,
  updateDealStatus,
  deleteSalesDeal,
} from '@/lib/sales';
import { getBranches } from '@/lib/firestore';
import {
  SalesDeal,
  SalesAccount,
  SalesDealStatus,
  SALES_DEAL_STATUSES,
  SALES_DEAL_STATUS_CONFIG,
  SALES_DEAL_STATUS_ORDER,
  CARE_LEVELS,
  CareLevel,
  SALES_ASSIGNEES,
  DEAL_SOURCES,
  DealSource,
} from '@/types/sales';
import { Branch } from '@/types';
import {
  ArrowLeft,
  Building2,
  User as UserIcon,
  Calendar,
  Phone,
  Edit,
  Trash2,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertTriangle,
  X,
  Save,
  PhoneCall,
  Plus,
  History,
} from 'lucide-react';

export default function SalesDealDetailPage() {
  return (
    <AuthGuard>
      <SalesDealDetailContent />
    </AuthGuard>
  );
}

function SalesDealDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const dealId = params.id as string;

  const [deal, setDeal] = useState<SalesDeal | null>(null);
  const [account, setAccount] = useState<SalesAccount | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 編集モード
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<SalesDeal>>({});
  const [saving, setSaving] = useState(false);

  // ステータス変更モーダル
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<SalesDealStatus | ''>('');
  const [statusNote, setStatusNote] = useState('');

  // フォローアップモーダル
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpNote, setFollowUpNote] = useState('');
  const [followUpResult, setFollowUpResult] = useState<'継続' | '成約' | '保留' | '失注'>('継続');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');

  useEffect(() => {
    fetchData();
  }, [dealId]);

  const fetchData = async () => {
    try {
      const [dealData, branchesData] = await Promise.all([
        getSalesDeal(dealId),
        getBranches(),
      ]);

      if (!dealData) {
        setError('案件が見つかりません');
        return;
      }

      setDeal(dealData);
      setBranches(branchesData);

      // 営業先情報を取得
      const accountData = await getSalesAccount(dealData.accountId);
      setAccount(accountData);

      // 編集用データを初期化
      setEditData(dealData);
    } catch (err) {
      console.error('Failed to fetch deal:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!deal || !user) return;

    setSaving(true);
    try {
      await updateSalesDeal(deal.id, {
        residentName: editData.residentName,
        residentAge: editData.residentAge,
        residentGender: editData.residentGender,
        careLevel: editData.careLevel,
        adlSummary: editData.adlSummary,
        targetBranchId: editData.targetBranchId,
        targetBranchName: editData.targetBranchName,
        expectedMoveInDate: editData.expectedMoveInDate,
        actualMoveInDate: editData.actualMoveInDate,
        invoiceDate: editData.invoiceDate,
        invoiceAmount: editData.invoiceAmount,
        notes: editData.notes,
      });
      await fetchData();
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save:', err);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async () => {
    if (!deal || !user || !newStatus) return;

    setSaving(true);
    try {
      await updateDealStatus(deal.id, newStatus, user.id, user.name, statusNote);
      await fetchData();
      setShowStatusModal(false);
      setNewStatus('');
      setStatusNote('');
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('ステータス更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deal || !confirm('この案件を削除しますか？')) return;

    try {
      await deleteSalesDeal(deal.id);
      router.push('/sales/deals');
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('削除に失敗しました');
    }
  };

  const handleBranchChange = (branchId: string) => {
    const selectedBranch = branches.find((b) => b.id === branchId);
    setEditData({
      ...editData,
      targetBranchId: branchId,
      targetBranchName: selectedBranch?.name || '',
    });
  };

  const handleFollowUp = async () => {
    if (!deal || !user) return;

    setSaving(true);
    try {
      const currentCount = deal.followUpCount || 0;
      const newCount = currentCount + 1;
      const today = new Date().toISOString().split('T')[0];

      const newHistory = [
        ...(deal.followUpHistory || []),
        {
          count: newCount,
          date: today,
          note: followUpNote || undefined,
          result: followUpResult,
        },
      ];

      await updateSalesDeal(deal.id, {
        followUpCount: newCount,
        lastFollowUpDate: today,
        nextFollowUpDate: nextFollowUpDate || undefined,
        followUpHistory: newHistory,
      });

      await fetchData();
      setShowFollowUpModal(false);
      setFollowUpNote('');
      setFollowUpResult('継続');
      setNextFollowUpDate('');
    } catch (err) {
      console.error('Failed to record follow-up:', err);
      alert('フォローアップの記録に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const getFollowUpLabel = (count: number) => {
    if (count === 0) return '未着手';
    if (count === 1) return '初回';
    return `${count}回目`;
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  if (error || !deal) {
    return (
      <>
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">{error || '案件が見つかりません'}</p>
              <Button onClick={() => router.push('/sales/deals')}>
                案件一覧に戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const config = SALES_DEAL_STATUS_CONFIG[deal.status];
  const currentOrder = SALES_DEAL_STATUS_ORDER[deal.status];

  return (
    <>
      <Header />
      <main className="pb-8">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center mb-6">
            <Link href="/sales/deals" className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="ml-2 text-xl font-bold text-gray-900">案件詳細</h1>
            <div className="ml-auto flex gap-2">
              {!isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit className="w-4 h-4 mr-1" />
                    編集
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    className="text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                    キャンセル
                  </Button>
                  <Button size="sm" onClick={handleSave} loading={saving}>
                    <Save className="w-4 h-4 mr-1" />
                    保存
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* ステータス・パイプライン */}
          <Card className="mb-4">
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Badge className={`${config.bgColor} ${config.color} text-base px-3 py-1`}>
                    {deal.status}
                  </Badge>
                </div>
                <Button size="sm" onClick={() => setShowStatusModal(true)}>
                  ステータス変更
                </Button>
              </div>

              {/* パイプライン進捗 */}
              <div className="flex items-center gap-1 overflow-x-auto pb-2">
                {SALES_DEAL_STATUSES.map((status, index) => {
                  const statusOrder = SALES_DEAL_STATUS_ORDER[status];
                  const isCompleted = currentOrder > 0 && statusOrder <= currentOrder;
                  const isCurrent = status === deal.status;
                  const statusConfig = SALES_DEAL_STATUS_CONFIG[status];

                  return (
                    <div key={status} className="flex items-center">
                      <div
                        className={`flex flex-col items-center ${
                          isCurrent ? 'scale-110' : ''
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                            isCompleted
                              ? 'bg-green-500 text-white'
                              : isCurrent
                                ? `${statusConfig.bgColor} ${statusConfig.color}`
                                : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {isCompleted && !isCurrent ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            index + 1
                          )}
                        </div>
                        <span
                          className={`text-xs mt-1 whitespace-nowrap ${
                            isCurrent ? 'font-bold' : 'text-gray-500'
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                      {index < SALES_DEAL_STATUSES.length - 1 && (
                        <div
                          className={`w-4 h-0.5 mx-1 ${
                            isCompleted ? 'bg-green-500' : 'bg-gray-200'
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 営業先情報 */}
          <Card className="mb-4">
            <CardContent>
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center">
                <Building2 className="w-4 h-4 mr-2 text-gray-500" />
                営業先
              </h2>
              {account && (
                <div className="text-sm">
                  <p className="font-medium">{account.name}</p>
                  <p className="text-gray-500">{account.type}</p>
                  {account.contactPerson && (
                    <p className="text-gray-600 mt-1">担当: {account.contactPerson}</p>
                  )}
                  {account.phone && (
                    <p className="text-gray-600 flex items-center mt-1">
                      <Phone className="w-3 h-3 mr-1" />
                      {account.phone}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 入居者情報 */}
          <Card className="mb-4">
            <CardContent>
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center">
                <UserIcon className="w-4 h-4 mr-2 text-gray-500" />
                入居者情報
              </h2>

              {isEditing ? (
                <div className="space-y-3">
                  <Input
                    label="入居者名"
                    value={editData.residentName || ''}
                    onChange={(e) => setEditData({ ...editData, residentName: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="年齢"
                      type="number"
                      value={editData.residentAge || ''}
                      onChange={(e) =>
                        setEditData({ ...editData, residentAge: parseInt(e.target.value) || undefined })
                      }
                    />
                    <Select
                      label="性別"
                      value={editData.residentGender || ''}
                      onChange={(e) =>
                        setEditData({
                          ...editData,
                          residentGender: e.target.value as '男性' | '女性' | '不明',
                        })
                      }
                      options={[
                        { value: '', label: '選択' },
                        { value: '男性', label: '男性' },
                        { value: '女性', label: '女性' },
                        { value: '不明', label: '不明' },
                      ]}
                    />
                  </div>
                  <Select
                    label="介護度"
                    value={editData.careLevel || ''}
                    onChange={(e) => setEditData({ ...editData, careLevel: e.target.value as CareLevel })}
                    options={[
                      { value: '', label: '選択' },
                      ...CARE_LEVELS.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                  <Textarea
                    label="ADL概要"
                    value={editData.adlSummary || ''}
                    onChange={(e) => setEditData({ ...editData, adlSummary: e.target.value })}
                    rows={2}
                  />
                </div>
              ) : (
                <div className="text-sm space-y-2">
                  <p>
                    <span className="text-gray-500">名前:</span>{' '}
                    <span className="font-medium">{deal.residentName || '未設定'}</span>
                  </p>
                  {deal.residentAge && (
                    <p>
                      <span className="text-gray-500">年齢:</span> {deal.residentAge}歳
                      {deal.residentGender && ` (${deal.residentGender})`}
                    </p>
                  )}
                  {deal.careLevel && (
                    <p>
                      <span className="text-gray-500">介護度:</span> {deal.careLevel}
                    </p>
                  )}
                  {deal.adlSummary && (
                    <p>
                      <span className="text-gray-500">ADL:</span> {deal.adlSummary}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 入居情報 */}
          <Card className="mb-4">
            <CardContent>
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                入居情報
              </h2>

              {isEditing ? (
                <div className="space-y-3">
                  <Select
                    label="入居先施設"
                    value={editData.targetBranchId || ''}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    options={[
                      { value: '', label: '未定' },
                      ...branches.map((b) => ({ value: b.id, label: b.name })),
                    ]}
                  />
                  <Input
                    label="入居予定日"
                    type="date"
                    value={editData.expectedMoveInDate || ''}
                    onChange={(e) => setEditData({ ...editData, expectedMoveInDate: e.target.value })}
                  />
                  <Input
                    label="実際の入居日"
                    type="date"
                    value={editData.actualMoveInDate || ''}
                    onChange={(e) => setEditData({ ...editData, actualMoveInDate: e.target.value })}
                  />
                  <Input
                    label="請求書到着日"
                    type="date"
                    value={editData.invoiceDate || ''}
                    onChange={(e) => setEditData({ ...editData, invoiceDate: e.target.value })}
                  />
                  <Input
                    label="請求金額"
                    type="number"
                    value={editData.invoiceAmount || ''}
                    onChange={(e) =>
                      setEditData({ ...editData, invoiceAmount: parseInt(e.target.value) || undefined })
                    }
                  />
                </div>
              ) : (
                <div className="text-sm space-y-2">
                  <p>
                    <span className="text-gray-500">入居先:</span>{' '}
                    {deal.targetBranchName || '未定'}
                  </p>
                  <p>
                    <span className="text-gray-500">入居予定日:</span>{' '}
                    {deal.expectedMoveInDate || '未定'}
                  </p>
                  {deal.actualMoveInDate && (
                    <p>
                      <span className="text-gray-500">実際の入居日:</span> {deal.actualMoveInDate}
                    </p>
                  )}
                  {deal.invoiceDate && (
                    <p>
                      <span className="text-gray-500">請求書到着日:</span> {deal.invoiceDate}
                    </p>
                  )}
                  {deal.invoiceAmount && (
                    <p>
                      <span className="text-gray-500">請求金額:</span>{' '}
                      {deal.invoiceAmount.toLocaleString()}円
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* フォローアップ管理 */}
          <Card className="mb-4 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center">
                  <PhoneCall className="w-4 h-4 mr-2 text-blue-600" />
                  フォローアップ管理
                </h2>
                <Button size="sm" onClick={() => setShowFollowUpModal(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  記録する
                </Button>
              </div>

              {/* 現在のステータス */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <p className="text-xs text-gray-500 mb-1">アプローチ回数</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {deal.followUpCount || 0}回
                  </p>
                  <p className="text-xs text-gray-600">
                    {getFollowUpLabel(deal.followUpCount || 0)}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <p className="text-xs text-gray-500 mb-1">最終アプローチ</p>
                  <p className="text-sm font-medium text-gray-900">
                    {deal.lastFollowUpDate || '未実施'}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <p className="text-xs text-gray-500 mb-1">次回予定</p>
                  <p className={`text-sm font-medium ${
                    deal.nextFollowUpDate && new Date(deal.nextFollowUpDate) <= new Date()
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {deal.nextFollowUpDate || '未設定'}
                  </p>
                </div>
              </div>

              {/* 流入元 */}
              {deal.source && (
                <div className="bg-white rounded-lg p-3 mb-4 shadow-sm">
                  <p className="text-xs text-gray-500 mb-1">流入元</p>
                  <Badge className={deal.source === 'テレアポ' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}>
                    {deal.source}
                  </Badge>
                </div>
              )}

              {/* フォローアップ履歴 */}
              {deal.followUpHistory && deal.followUpHistory.length > 0 && (
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs text-gray-500 mb-2 flex items-center">
                    <History className="w-3 h-3 mr-1" />
                    アプローチ履歴
                  </p>
                  <div className="space-y-2">
                    {deal.followUpHistory
                      .slice()
                      .reverse()
                      .map((entry, index) => (
                        <div key={index} className="flex items-start gap-2 text-sm border-l-2 border-blue-300 pl-2">
                          <Badge className={`text-xs ${
                            entry.result === '成約' ? 'bg-green-100 text-green-700' :
                            entry.result === '失注' ? 'bg-red-100 text-red-700' :
                            entry.result === '保留' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {entry.count}回目
                          </Badge>
                          <div className="flex-1">
                            <span className="text-gray-500 text-xs">{entry.date}</span>
                            {entry.result && (
                              <span className="ml-2 text-xs text-gray-600">({entry.result})</span>
                            )}
                            {entry.note && (
                              <p className="text-gray-600 text-xs mt-0.5">{entry.note}</p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* メモ */}
          <Card className="mb-4">
            <CardContent>
              <h2 className="font-semibold text-gray-900 mb-3">メモ</h2>
              {isEditing ? (
                <Textarea
                  value={editData.notes || ''}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  rows={3}
                />
              ) : (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {deal.notes || 'メモなし'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* ステータス履歴 */}
          <Card>
            <CardContent>
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center">
                <Clock className="w-4 h-4 mr-2 text-gray-500" />
                ステータス履歴
              </h2>
              <div className="space-y-3">
                {deal.statusHistory
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <div key={index} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            className={`${SALES_DEAL_STATUS_CONFIG[entry.status].bgColor} ${SALES_DEAL_STATUS_CONFIG[entry.status].color}`}
                          >
                            {entry.status}
                          </Badge>
                          <span className="text-gray-500 text-xs">
                            {entry.changedAt.toLocaleString('ja-JP')}
                          </span>
                        </div>
                        <p className="text-gray-600 text-xs mt-1">
                          {entry.changedByName}
                          {entry.note && ` - ${entry.note}`}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* フォローアップ記録モーダル */}
      {showFollowUpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-lg flex items-center">
                <PhoneCall className="w-5 h-5 mr-2 text-blue-600" />
                フォローアップ記録
              </h2>
              <button
                onClick={() => setShowFollowUpModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">現在のアプローチ回数</p>
                <p className="text-2xl font-bold text-blue-600">
                  {deal.followUpCount || 0}回
                </p>
                <p className="text-sm text-gray-500">
                  → 次は<span className="font-bold text-blue-700">{(deal.followUpCount || 0) + 1}回目</span>として記録
                </p>
              </div>

              <Select
                label="結果"
                value={followUpResult}
                onChange={(e) => setFollowUpResult(e.target.value as '継続' | '成約' | '保留' | '失注')}
                options={[
                  { value: '継続', label: '継続（次回フォローアップ予定）' },
                  { value: '成約', label: '成約' },
                  { value: '保留', label: '保留' },
                  { value: '失注', label: '失注' },
                ]}
              />

              {followUpResult === '継続' && (
                <Input
                  label="次回フォローアップ予定日"
                  type="date"
                  value={nextFollowUpDate}
                  onChange={(e) => setNextFollowUpDate(e.target.value)}
                />
              )}

              <Textarea
                label="メモ（任意）"
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
                placeholder="アプローチの内容や先方の反応など"
                rows={3}
              />

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowFollowUpModal(false)}
                  className="flex-1"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleFollowUp}
                  loading={saving}
                  className="flex-1"
                >
                  記録する
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ステータス変更モーダル */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-lg">ステータス変更</h2>
              <button
                onClick={() => setShowStatusModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <Select
                label="新しいステータス"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as SalesDealStatus)}
                options={[
                  { value: '', label: '選択してください' },
                  ...SALES_DEAL_STATUSES.map((s) => ({ value: s, label: s })),
                  { value: '失注', label: '失注' },
                  { value: '保留', label: '保留' },
                ]}
              />

              <Textarea
                label="備考（任意）"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="ステータス変更の理由など"
                rows={2}
              />

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowStatusModal(false)}
                  className="flex-1"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleStatusChange}
                  loading={saving}
                  disabled={!newStatus}
                  className="flex-1"
                >
                  変更
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
