'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Badge, Button, Input, Select, Textarea } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getSalesDeals,
  getSalesAccounts,
  createSalesDeal,
  updateDealStatus,
} from '@/lib/sales';
import { getBranches } from '@/lib/firestore';
import {
  SalesDeal,
  SalesDealFormData,
  SalesAccount,
  SalesAccountType,
  SALES_ACCOUNT_TYPES,
  SalesDealStatus,
  SALES_DEAL_STATUSES,
  SALES_DEAL_STATUS_CONFIG,
  CARE_LEVELS,
  CareLevel,
  SALES_ASSIGNEES,
  DEAL_SOURCES,
  DealSource,
} from '@/types/sales';
import { Branch } from '@/types';
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  ChevronRight,
  X,
  User as UserIcon,
  Calendar,
  Building2,
} from 'lucide-react';

export default function SalesDealsPage() {
  return (
    <AuthGuard>
      <SalesDealsContent />
    </AuthGuard>
  );
}

function SalesDealsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') as SalesDealStatus | null;
  const initialAssignee = searchParams.get('assignee');

  const [deals, setDeals] = useState<SalesDeal[]>([]);
  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [customAssignee, setCustomAssignee] = useState('');

  // 営業先入力
  const [accountInput, setAccountInput] = useState('');
  const [accountType, setAccountType] = useState<SalesAccountType>('その他');
  const [showAccountSuggestions, setShowAccountSuggestions] = useState(false);

  // フィルター
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<SalesDealStatus | ''>(initialStatus || '');
  const [filterAssignee, setFilterAssignee] = useState(initialAssignee || '');
  const [filterAccount, setFilterAccount] = useState('');

  // モーダル状態
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<SalesDealFormData>({
    accountId: '',
    status: 'テレアポ',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [dealsData, accountsData, branchesData] = await Promise.all([
        getSalesDeals(),
        getSalesAccounts(),
        getBranches(),
      ]);
      setDeals(dealsData);
      setAccounts(accountsData);
      setBranches(branchesData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setFormData({
      accountId: '',
      status: 'テレアポ',
      assignedToId: '',
      assignedToName: '',
    });
    setCustomAssignee('');
    setAccountInput('');
    setAccountType('その他');
    setShowAccountSuggestions(false);
    setShowModal(true);
  };

  const handleAccountSelect = (account: SalesAccount) => {
    setFormData({ ...formData, accountId: account.id, accountName: account.name });
    setAccountInput(account.name);
    setShowAccountSuggestions(false);
  };

  const handleAccountInputChange = (value: string) => {
    setAccountInput(value);
    setShowAccountSuggestions(value.length > 0);
    // 入力が既存営業先と完全一致しない場合はaccountIdをクリア
    const match = accounts.find((a) => a.name === value);
    if (match) {
      setFormData({ ...formData, accountId: match.id, accountName: match.name });
    } else {
      setFormData({ ...formData, accountId: '', accountName: value });
    }
  };

  const accountSuggestions = accountInput.length > 0
    ? accounts.filter((a) => a.name.toLowerCase().includes(accountInput.toLowerCase()))
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!formData.accountId && !accountInput.trim()) || !user) return;

    setSubmitting(true);
    try {
      const submitData = {
        ...formData,
        accountName: accountInput.trim(),
        accountType: formData.accountId ? undefined : accountType,
      };
      await createSalesDeal(submitData, user.id, user.name);
      setShowModal(false);
      await fetchData();
    } catch (error) {
      console.error('Failed to create deal:', error);
      alert('作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssigneeChange = (value: string) => {
    if (value === 'その他') {
      setFormData({
        ...formData,
        assignedToId: 'その他',
        assignedToName: customAssignee,
      });
    } else {
      setFormData({
        ...formData,
        assignedToId: value,
        assignedToName: value,
      });
      setCustomAssignee('');
    }
  };

  const handleCustomAssigneeChange = (value: string) => {
    setCustomAssignee(value);
    if (formData.assignedToId === 'その他') {
      setFormData({
        ...formData,
        assignedToName: value,
      });
    }
  };

  const handleBranchChange = (branchId: string) => {
    const selectedBranch = branches.find((b) => b.id === branchId);
    setFormData({
      ...formData,
      targetBranchId: branchId,
      targetBranchName: selectedBranch?.name || '',
    });
  };

  // フィルタリング
  const filteredDeals = deals.filter((deal) => {
    const matchesSearch =
      !searchQuery ||
      deal.residentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deal.accountName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !filterStatus || deal.status === filterStatus;
    const matchesAssignee = !filterAssignee || deal.assignedToId === filterAssignee;
    const matchesAccount = !filterAccount || deal.accountId === filterAccount;
    return matchesSearch && matchesStatus && matchesAssignee && matchesAccount;
  });

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center mb-6">
            <Link href="/sales" className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="ml-2 text-xl font-bold text-gray-900">案件一覧</h1>
            <Button onClick={openCreateModal} className="ml-auto" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              新規案件
            </Button>
          </div>

          {/* フィルター */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="入居者名・営業先名で検索"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as SalesDealStatus | '')}
                  options={[
                    { value: '', label: 'すべてのステータス' },
                    ...SALES_DEAL_STATUSES.map((s) => ({ value: s, label: s })),
                    { value: '失注', label: '失注' },
                    { value: '保留', label: '保留' },
                  ]}
                  className="w-40"
                />
                <Select
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                  options={[
                    { value: '', label: 'すべての担当者' },
                    ...SALES_ASSIGNEES.map((name) => ({ value: name, label: name })),
                  ]}
                  className="w-36"
                />
                <Select
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  options={[
                    { value: '', label: 'すべての営業先' },
                    ...accounts.map((a) => ({ value: a.id, label: a.name })),
                  ]}
                  className="w-40"
                />
              </div>
            </CardContent>
          </Card>

          {/* 案件一覧 */}
          {filteredDeals.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Filter className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">案件がありません</p>
                <Button onClick={openCreateModal} className="mt-4">
                  <Plus className="w-4 h-4 mr-1" />
                  案件を作成
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredDeals.map((deal) => {
                const config = SALES_DEAL_STATUS_CONFIG[deal.status];
                return (
                  <Link key={deal.id} href={`/sales/deals/${deal.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-900">
                                {deal.residentName || '入居者未設定'}
                              </h3>
                              <Badge className={`${config.bgColor} ${config.color}`}>
                                {deal.status}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-4 text-sm text-gray-600 mt-2">
                              <span className="flex items-center">
                                <Building2 className="w-4 h-4 mr-1 text-gray-400" />
                                {deal.accountName}
                              </span>
                              {deal.careLevel && (
                                <span>{deal.careLevel}</span>
                              )}
                              {deal.targetBranchName && (
                                <span>→ {deal.targetBranchName}</span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              {deal.assignedToName && (
                                <span className="flex items-center">
                                  <UserIcon className="w-3 h-3 mr-1" />
                                  {deal.assignedToName}
                                </span>
                              )}
                              {deal.expectedMoveInDate && (
                                <span className="flex items-center">
                                  <Calendar className="w-3 h-3 mr-1" />
                                  入居予定: {deal.expectedMoveInDate}
                                </span>
                              )}
                              <span>
                                更新: {(deal.updatedAt || deal.createdAt).toLocaleDateString('ja-JP')}
                              </span>
                            </div>
                          </div>

                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* 新規案件モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-lg">新規案件</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* 営業先（入力+候補表示） */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  営業先 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={accountInput}
                  onChange={(e) => handleAccountInputChange(e.target.value)}
                  onFocus={() => setShowAccountSuggestions(accountInput.length > 0)}
                  onBlur={() => setTimeout(() => setShowAccountSuggestions(false), 200)}
                  placeholder="営業先名を入力（新規の場合はそのまま入力）"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                {showAccountSuggestions && accountSuggestions.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {accountSuggestions.map((a) => (
                      <li
                        key={a.id}
                        onMouseDown={() => handleAccountSelect(a)}
                        className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer flex justify-between"
                      >
                        <span>{a.name}</span>
                        <span className="text-gray-400 text-xs">{a.type}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {accountInput.trim() && !formData.accountId && (
                  <p className="text-xs text-blue-600 mt-1">
                    新しい営業先「{accountInput.trim()}」として登録されます
                  </p>
                )}
                {formData.accountId && (
                  <p className="text-xs text-green-600 mt-1">
                    既存の営業先が選択されています
                  </p>
                )}
              </div>

              {/* 新規営業先の場合のみタイプ選択 */}
              {accountInput.trim() && !formData.accountId && (
                <Select
                  label="営業先タイプ"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as SalesAccountType)}
                  options={SALES_ACCOUNT_TYPES.map((t) => ({ value: t, label: t }))}
                />
              )}

              <Select
                label="ステータス"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as SalesDealStatus })}
                options={SALES_DEAL_STATUSES.map((s) => ({ value: s, label: s }))}
                required
              />

              <Select
                label="流入元"
                value={formData.source || ''}
                onChange={(e) => setFormData({ ...formData, source: e.target.value as DealSource || undefined })}
                options={[
                  { value: '', label: '選択してください' },
                  ...DEAL_SOURCES.map((s) => ({ value: s, label: s })),
                ]}
              />

              <Select
                label="担当者"
                value={formData.assignedToId || ''}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                options={[
                  { value: '', label: '未割当' },
                  ...SALES_ASSIGNEES.map((name) => ({ value: name, label: name })),
                  { value: 'その他', label: 'その他（自由記述）' },
                ]}
              />
              {formData.assignedToId === 'その他' && (
                <Input
                  label="担当者名（自由記述）"
                  value={customAssignee}
                  onChange={(e) => handleCustomAssigneeChange(e.target.value)}
                  placeholder="担当者名を入力"
                  className="mt-3"
                />
              )}

              <div className="border-t pt-4">
                <h3 className="font-medium text-sm text-gray-700 mb-3">入居者情報（任意）</h3>

                <Input
                  label="入居者名"
                  value={formData.residentName || ''}
                  onChange={(e) => setFormData({ ...formData, residentName: e.target.value })}
                  placeholder="山田 太郎"
                />

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Input
                    label="年齢"
                    type="number"
                    value={formData.residentAge || ''}
                    onChange={(e) => setFormData({ ...formData, residentAge: parseInt(e.target.value) || undefined })}
                  />
                  <Select
                    label="性別"
                    value={formData.residentGender || ''}
                    onChange={(e) => setFormData({ ...formData, residentGender: e.target.value as '男性' | '女性' | '不明' })}
                    options={[
                      { value: '', label: '選択' },
                      { value: '男性', label: '男性' },
                      { value: '女性', label: '女性' },
                      { value: '不明', label: '不明' },
                    ]}
                  />
                </div>

                <div className="mt-3">
                  <Select
                    label="介護度"
                    value={formData.careLevel || ''}
                    onChange={(e) => setFormData({ ...formData, careLevel: e.target.value as CareLevel })}
                    options={[
                      { value: '', label: '選択' },
                      ...CARE_LEVELS.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                </div>

                <div className="mt-3">
                  <Textarea
                    label="ADL概要"
                    value={formData.adlSummary || ''}
                    onChange={(e) => setFormData({ ...formData, adlSummary: e.target.value })}
                    placeholder="歩行可、食事自立、排泄一部介助..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium text-sm text-gray-700 mb-3">入居情報（任意）</h3>

                <Select
                  label="入居先施設"
                  value={formData.targetBranchId || ''}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  options={[
                    { value: '', label: '未定' },
                    ...branches.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />

                <div className="mt-3">
                  <Input
                    label="入居予定日"
                    type="date"
                    value={formData.expectedMoveInDate || ''}
                    onChange={(e) => setFormData({ ...formData, expectedMoveInDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-3">
                <Textarea
                  label="メモ"
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  className="flex-1"
                >
                  キャンセル
                </Button>
                <Button type="submit" loading={submitting} className="flex-1">
                  作成
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
