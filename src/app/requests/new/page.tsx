'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select, Textarea } from '@/components/ui';
import { createRequest } from '@/lib/request-engine';
import type { RequestType, TaxType, UrgencyLevel } from '@/types/request-engine';
import {
  REQUEST_TYPE_LABELS,
  TAX_TYPE_LABELS,
  URGENCY_LEVEL_LABELS,
  calculateTax,
} from '@/types/request-engine';
import {
  ArrowLeft,
  FileText,
  Receipt,
  Banknote,
  CreditCard,
  AlertCircle,
  Loader2,
  Send,
} from 'lucide-react';

export default function NewRequestPage() {
  return (
    <AuthGuard>
      <NewRequestContent />
    </AuthGuard>
  );
}

function NewRequestContent() {
  const { user } = useAuth();
  const router = useRouter();

  // フォーム状態
  const [requestType, setRequestType] = useState<RequestType>('ringi');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [taxType, setTaxType] = useState<TaxType>('inclusive_10');
  const [urgency, setUrgency] = useState<UrgencyLevel>('mid');
  const [isEmergency, setIsEmergency] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { taxAmount, totalAmount } = calculateTax(amount, taxType);

  // カテゴリ選択肢
  const categoryOptions: Record<RequestType, string[]> = {
    ringi: ['設備投資', '人件費', '外注費', '広告宣伝費', '消耗品', 'その他'],
    expense: ['交通費', '宿泊費', '会議費', '接待交際費', '通信費', '消耗品', 'その他'],
    payroll: ['手当追加', '手当修正', '控除追加', '控除修正', '給与修正', 'その他'],
    vendor_payment: ['設備工事', '修繕', '業者委託', '物品購入', 'その他'],
  };

  const getTypeIcon = (type: RequestType) => {
    switch (type) {
      case 'ringi':
        return <FileText className="w-6 h-6" />;
      case 'expense':
        return <Receipt className="w-6 h-6" />;
      case 'payroll':
        return <Banknote className="w-6 h-6" />;
      case 'vendor_payment':
        return <CreditCard className="w-6 h-6" />;
    }
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!user) return;

    if (!title.trim()) {
      setError('件名を入力してください');
      return;
    }
    if (!category) {
      setError('カテゴリを選択してください');
      return;
    }
    if (amount <= 0) {
      setError('金額を入力してください');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const requestId = await createRequest(
        {
          requestType,
          title,
          description,
          category,
          amount,
          taxType,
          urgency,
          isEmergency,
          paymentDate: paymentDate || undefined,
        },
        user.id,
        user.name,
        user.branchId,
        '本部'  // TODO: ユーザーの部門を取得
      );

      if (!asDraft) {
        // 申請を提出
        const { submitRequest } = await import('@/lib/request-engine');
        await submitRequest(requestId, user.id, user.name);
      }

      router.push(`/requests/${requestId}`);
    } catch (err) {
      console.error('Failed to create request:', err);
      setError('申請の作成に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold">新規申請</h1>
          </div>

          {/* 申請種別選択 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>申請種別</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setRequestType(type);
                      setCategory('');
                    }}
                    className={`p-4 rounded-lg border-2 transition-colors ${
                      requestType === type
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className={`p-2 rounded-lg ${
                          requestType === type ? 'bg-blue-600 text-white' : 'bg-gray-100'
                        }`}
                      >
                        {getTypeIcon(type)}
                      </div>
                      <span className="font-medium">{REQUEST_TYPE_LABELS[type]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 申請内容 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>申請内容</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">件名 *</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例: 〇〇施設 エアコン修繕費用"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">カテゴリ *</label>
                  <Select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    options={[
                      { value: '', label: '選択してください' },
                      ...categoryOptions[requestType].map((c) => ({ value: c, label: c })),
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">詳細説明</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="申請の理由、背景、詳細を記載してください"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">緊急度</label>
                    <Select
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}
                      options={Object.entries(URGENCY_LEVEL_LABELS).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">支払希望日</label>
                    <Input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isEmergency"
                    checked={isEmergency}
                    onChange={(e) => setIsEmergency(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="isEmergency" className="text-sm">
                    緊急案件（通常の承認フローをスキップ可能）
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 金額 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>金額</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">金額 *</label>
                    <Input
                      type="number"
                      value={amount || ''}
                      onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">税区分</label>
                    <Select
                      value={taxType}
                      onChange={(e) => setTaxType(e.target.value as TaxType)}
                      options={Object.entries(TAX_TYPE_LABELS).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                    />
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span>本体金額</span>
                    <span>{(amount - taxAmount).toLocaleString()}円</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span>消費税</span>
                    <span>{taxAmount.toLocaleString()}円</span>
                  </div>
                  <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                    <span>合計金額</span>
                    <span className="text-lg">{totalAmount.toLocaleString()}円</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ボタン */}
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => handleSubmit(true)}
              disabled={saving}
            >
              下書き保存
            </Button>
            <Button onClick={() => handleSubmit(false)} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  処理中...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  申請する
                </>
              )}
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}
