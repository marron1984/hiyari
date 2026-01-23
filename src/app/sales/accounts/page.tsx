'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Badge, Button, Input, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getSalesAccounts,
  createSalesAccount,
  updateSalesAccount,
  deleteSalesAccount,
} from '@/lib/sales';
import { getUsers } from '@/lib/firestore';
import {
  SalesAccount,
  SalesAccountFormData,
  SalesAccountType,
  SALES_ACCOUNT_TYPES,
} from '@/types/sales';
import { User } from '@/types';
import {
  ArrowLeft,
  Building2,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  User as UserIcon,
  Edit,
  Trash2,
  X,
  Briefcase,
} from 'lucide-react';

export default function SalesAccountsPage() {
  return (
    <AuthGuard>
      <SalesAccountsContent />
    </AuthGuard>
  );
}

function SalesAccountsContent() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<SalesAccountType | ''>('');

  // モーダル状態
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SalesAccount | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<SalesAccountFormData>({
    name: '',
    type: 'MSW',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [accountsData, usersData] = await Promise.all([
        getSalesAccounts(),
        getUsers(),
      ]);
      setAccounts(accountsData);
      setUsers(usersData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingAccount(null);
    setFormData({
      name: '',
      type: 'MSW',
      phone: '',
      email: '',
      address: '',
      contactPerson: '',
      contactPhone: '',
      contactEmail: '',
      assignedToId: user?.id,
      assignedToName: user?.name,
      notes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (account: SalesAccount) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      type: account.type,
      phone: account.phone || '',
      email: account.email || '',
      address: account.address || '',
      contactPerson: account.contactPerson || '',
      contactPhone: account.contactPhone || '',
      contactEmail: account.contactEmail || '',
      assignedToId: account.assignedToId || '',
      assignedToName: account.assignedToName || '',
      notes: account.notes || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !user) return;

    setSubmitting(true);
    try {
      if (editingAccount) {
        await updateSalesAccount(editingAccount.id, formData);
      } else {
        await createSalesAccount(formData, user.id, user.name);
      }
      setShowModal(false);
      await fetchData();
    } catch (error) {
      console.error('Failed to save account:', error);
      alert('保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (account: SalesAccount) => {
    if (!confirm(`「${account.name}」を削除しますか？`)) return;

    try {
      await deleteSalesAccount(account.id);
      await fetchData();
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert(error instanceof Error ? error.message : '削除に失敗しました');
    }
  };

  const handleAssigneeChange = (userId: string) => {
    const selectedUser = users.find((u) => u.id === userId);
    setFormData({
      ...formData,
      assignedToId: userId,
      assignedToName: selectedUser?.name || '',
    });
  };

  // フィルタリング
  const filteredAccounts = accounts.filter((account) => {
    const matchesSearch =
      !searchQuery ||
      account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.contactPerson?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !filterType || account.type === filterType;
    return matchesSearch && matchesType;
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
            <h1 className="ml-2 text-xl font-bold text-gray-900">営業先一覧</h1>
            <Button onClick={openCreateModal} className="ml-auto" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              新規登録
            </Button>
          </div>

          {/* フィルター */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="営業先名・担当者名で検索"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as SalesAccountType | '')}
                  options={[
                    { value: '', label: 'すべてのタイプ' },
                    ...SALES_ACCOUNT_TYPES.map((t) => ({ value: t, label: t })),
                  ]}
                  className="w-40"
                />
              </div>
            </CardContent>
          </Card>

          {/* 営業先一覧 */}
          {filteredAccounts.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">営業先が登録されていません</p>
                <Button onClick={openCreateModal} className="mt-4">
                  <Plus className="w-4 h-4 mr-1" />
                  営業先を登録
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredAccounts.map((account) => (
                <Card key={account.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">{account.name}</h3>
                          <Badge variant="info">{account.type}</Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mt-2">
                          {account.contactPerson && (
                            <div className="flex items-center">
                              <UserIcon className="w-4 h-4 mr-1 text-gray-400" />
                              {account.contactPerson}
                            </div>
                          )}
                          {account.phone && (
                            <div className="flex items-center">
                              <Phone className="w-4 h-4 mr-1 text-gray-400" />
                              {account.phone}
                            </div>
                          )}
                          {account.email && (
                            <div className="flex items-center">
                              <Mail className="w-4 h-4 mr-1 text-gray-400" />
                              {account.email}
                            </div>
                          )}
                          {account.address && (
                            <div className="flex items-center col-span-2">
                              <MapPin className="w-4 h-4 mr-1 text-gray-400" />
                              {account.address}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                          <span>案件: {account.totalDeals || 0}件</span>
                          <span>進行中: {account.activeDeals || 0}件</span>
                          <span>成約: {account.completedDeals || 0}件</span>
                          {account.assignedToName && (
                            <span className="flex items-center">
                              <Briefcase className="w-3 h-3 mr-1" />
                              {account.assignedToName}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(account)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(account)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 登録/編集モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-lg">
                {editingAccount ? '営業先編集' : '営業先登録'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <Input
                label="営業先名"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="例: 〇〇病院"
              />

              <Select
                label="タイプ"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as SalesAccountType })}
                options={SALES_ACCOUNT_TYPES.map((t) => ({ value: t, label: t }))}
                required
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="電話番号"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="03-1234-5678"
                />
                <Input
                  label="メール"
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="example@hospital.jp"
                />
              </div>

              <Input
                label="住所"
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="東京都〇〇区..."
              />

              <div className="border-t pt-4">
                <h3 className="font-medium text-sm text-gray-700 mb-3">先方担当者情報</h3>
                <Input
                  label="担当者名"
                  value={formData.contactPerson || ''}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  placeholder="田中 太郎"
                />
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Input
                    label="担当者電話"
                    value={formData.contactPhone || ''}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  />
                  <Input
                    label="担当者メール"
                    type="email"
                    value={formData.contactEmail || ''}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <Select
                  label="自社担当者"
                  value={formData.assignedToId || ''}
                  onChange={(e) => handleAssigneeChange(e.target.value)}
                  options={[
                    { value: '', label: '未割当' },
                    ...users.map((u) => ({ value: u.id, label: u.name })),
                  ]}
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
                  {editingAccount ? '更新' : '登録'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
