'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  Plus,
  Edit,
  Trash2,
  BookOpen,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Wand2,
} from 'lucide-react';
import type { AccountingTemplate, JournalEntryDetail } from '@/types/accounting-template';
import { COMMON_ACCOUNT_ITEMS } from '@/types/accounting-template';

export default function AccountingTemplatesPage() {
  return (
    <AuthGuard requireAdmin>
      <AccountingTemplatesContent />
    </AuthGuard>
  );
}

function AccountingTemplatesContent() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<AccountingTemplate[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AccountingTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // フォーム状態
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    priority: 10,
    isActive: true,
    // マッチング条件
    amountMin: '',
    amountMax: '',
    purposeKeywords: '',
    payeeKeywords: '',
    // 摘要テンプレート
    descriptionTemplate: '{date} {payeeName}への支払い',
    // 借方勘定科目
    debitAccountId: 314, // 雑費
    // 貸方勘定科目
    creditAccountId: 202, // 未払金
  });

  // テンプレート一覧取得
  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/admin/accounting-templates');
      const data = await response.json();
      if (data.success) {
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error('テンプレート取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // フォームリセット
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      priority: 10,
      isActive: true,
      amountMin: '',
      amountMax: '',
      purposeKeywords: '',
      payeeKeywords: '',
      descriptionTemplate: '{date} {payeeName}への支払い',
      debitAccountId: 314,
      creditAccountId: 202,
    });
    setEditingTemplate(null);
  };

  // 編集開始
  const startEdit = (template: AccountingTemplate) => {
    setEditingTemplate(template);
    const debitEntry = template.entries.find(e => e.entryType === 'debit');
    const creditEntry = template.entries.find(e => e.entryType === 'credit');

    setFormData({
      name: template.name,
      description: template.description || '',
      priority: template.priority,
      isActive: template.isActive,
      amountMin: template.matchCondition.amountMin?.toString() || '',
      amountMax: template.matchCondition.amountMax?.toString() || '',
      purposeKeywords: template.matchCondition.purposeKeywords?.join(', ') || '',
      payeeKeywords: template.matchCondition.payeeKeywords?.join(', ') || '',
      descriptionTemplate: template.descriptionTemplate.template,
      debitAccountId: debitEntry?.accountItem.accountItemId || 314,
      creditAccountId: creditEntry?.accountItem.accountItemId || 202,
    });
    setShowForm(true);
  };

  // 保存
  const handleSave = async () => {
    if (!formData.name) {
      alert('テンプレート名は必須です');
      return;
    }

    setSaving(true);

    try {
      const debitAccount = COMMON_ACCOUNT_ITEMS.find(a => a.accountItemId === formData.debitAccountId);
      const creditAccount = COMMON_ACCOUNT_ITEMS.find(a => a.accountItemId === formData.creditAccountId);

      const entries: JournalEntryDetail[] = [
        {
          entryType: 'debit',
          accountItem: debitAccount || { accountItemId: formData.debitAccountId, accountItemName: '不明', taxCode: 5 },
        },
        {
          entryType: 'credit',
          accountItem: creditAccount || { accountItemId: formData.creditAccountId, accountItemName: '不明' },
        },
      ];

      const matchCondition = {
        amountMin: formData.amountMin ? parseInt(formData.amountMin) : undefined,
        amountMax: formData.amountMax ? parseInt(formData.amountMax) : undefined,
        purposeKeywords: formData.purposeKeywords
          ? formData.purposeKeywords.split(',').map(s => s.trim()).filter(s => s)
          : undefined,
        payeeKeywords: formData.payeeKeywords
          ? formData.payeeKeywords.split(',').map(s => s.trim()).filter(s => s)
          : undefined,
      };

      const payload = {
        name: formData.name,
        description: formData.description || undefined,
        priority: formData.priority,
        isActive: formData.isActive,
        matchCondition,
        entries,
        descriptionTemplate: { template: formData.descriptionTemplate },
      };

      let response;
      if (editingTemplate) {
        response = await fetch(`/api/admin/accounting-templates/${editingTemplate.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetch('/api/admin/accounting-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await response.json();
      if (data.success) {
        await fetchTemplates();
        setShowForm(false);
        resetForm();
      } else {
        alert(data.error || '保存に失敗しました');
      }
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!confirm('このテンプレートを削除しますか？')) return;

    try {
      const response = await fetch(`/api/admin/accounting-templates/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        await fetchTemplates();
      } else {
        alert(data.error || '削除に失敗しました');
      }
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  // デフォルトテンプレート作成
  const handleSeedDefaults = async () => {
    if (!confirm('デフォルトの仕訳テンプレートを作成しますか？\n既存のテンプレートがある場合はスキップされます。')) return;

    setSeeding(true);
    try {
      const response = await fetch('/api/admin/accounting-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed' }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchTemplates();
        alert('デフォルトテンプレートを作成しました');
      } else {
        alert(data.error || '作成に失敗しました');
      }
    } catch (error) {
      console.error('シードエラー:', error);
      alert('作成に失敗しました');
    } finally {
      setSeeding(false);
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

  return (
    <>
      <Header />
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-900 flex items-center">
              <BookOpen className="w-6 h-6 text-blue-600 mr-2" />
              仕訳テンプレート管理
            </h1>
            <div className="flex gap-2">
              {templates.length === 0 && (
                <Button variant="outline" onClick={handleSeedDefaults} loading={seeding}>
                  <Wand2 className="w-4 h-4 mr-1" />
                  デフォルト作成
                </Button>
              )}
              <Button onClick={() => { resetForm(); setShowForm(true); }}>
                <Plus className="w-4 h-4 mr-1" />
                新規作成
              </Button>
            </div>
          </div>

          {/* 説明 */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            <p>仕訳テンプレートは、支払い依頼承認時にfreeeへ自動で仕訳を作成するためのルールです。</p>
            <p className="mt-1">条件（金額・キーワード等）に一致するテンプレートが適用され、勘定科目が自動選択されます。</p>
          </div>

          {/* フォーム */}
          {showForm && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>{editingTemplate ? 'テンプレート編集' : '新規テンプレート'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 基本情報 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      テンプレート名 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="例: 一般経費（消耗品費）"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
                    <Input
                      type="number"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-gray-500 mt-1">高いほど優先（0〜100）</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="例: 10万円未満の消耗品・備品購入"
                  />
                </div>

                {/* マッチング条件 */}
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">マッチング条件</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">金額下限（円）</label>
                      <Input
                        type="number"
                        value={formData.amountMin}
                        onChange={(e) => setFormData({ ...formData, amountMin: e.target.value })}
                        placeholder="なし"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">金額上限（円）</label>
                      <Input
                        type="number"
                        value={formData.amountMax}
                        onChange={(e) => setFormData({ ...formData, amountMax: e.target.value })}
                        placeholder="なし"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      目的キーワード（カンマ区切り）
                    </label>
                    <Input
                      value={formData.purposeKeywords}
                      onChange={(e) => setFormData({ ...formData, purposeKeywords: e.target.value })}
                      placeholder="例: 消耗品, 備品, 文房具"
                    />
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      取引先キーワード（カンマ区切り）
                    </label>
                    <Input
                      value={formData.payeeKeywords}
                      onChange={(e) => setFormData({ ...formData, payeeKeywords: e.target.value })}
                      placeholder="例: Amazon, 楽天"
                    />
                  </div>
                </div>

                {/* 勘定科目 */}
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">勘定科目</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">借方科目</label>
                      <select
                        value={formData.debitAccountId}
                        onChange={(e) => setFormData({ ...formData, debitAccountId: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                      >
                        {COMMON_ACCOUNT_ITEMS.map((item) => (
                          <option key={item.accountItemId} value={item.accountItemId}>
                            {item.accountItemName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">貸方科目</label>
                      <select
                        value={formData.creditAccountId}
                        onChange={(e) => setFormData({ ...formData, creditAccountId: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                      >
                        {COMMON_ACCOUNT_ITEMS.map((item) => (
                          <option key={item.accountItemId} value={item.accountItemId}>
                            {item.accountItemName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 摘要テンプレート */}
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">摘要テンプレート</h4>
                  <Input
                    value={formData.descriptionTemplate}
                    onChange={(e) => setFormData({ ...formData, descriptionTemplate: e.target.value })}
                    placeholder="{date} {payeeName}への支払い"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    利用可能変数: {'{date}'}, {'{payeeName}'}, {'{amount}'}, {'{purpose}'}, {'{invoiceNumber}'}
                  </p>
                </div>

                {/* 有効/無効 */}
                <div className="border-t pt-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">有効</span>
                  </label>
                </div>

                {/* ボタン */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                    キャンセル
                  </Button>
                  <Button onClick={handleSave} loading={saving}>
                    {editingTemplate ? '更新' : '作成'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* テンプレート一覧 */}
          {templates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">テンプレートがありません</p>
                <p className="text-sm text-gray-400 mt-1">「デフォルト作成」で基本テンプレートを追加できます</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <Card key={template.id}>
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedId(expandedId === template.id ? null : template.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        {template.isActive ? (
                          <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                        ) : (
                          <XCircle className="w-5 h-5 text-gray-400 mr-2" />
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{template.name}</p>
                          {template.description && (
                            <p className="text-sm text-gray-500">{template.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          優先度: {template.priority}
                        </span>
                        {expandedId === template.id ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {expandedId === template.id && (
                    <div className="px-4 pb-4 border-t">
                      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">マッチング条件</p>
                          <div className="mt-1 space-y-1">
                            {template.matchCondition.amountMin !== undefined && (
                              <p>金額下限: {template.matchCondition.amountMin.toLocaleString()}円</p>
                            )}
                            {template.matchCondition.amountMax !== undefined && (
                              <p>金額上限: {template.matchCondition.amountMax.toLocaleString()}円</p>
                            )}
                            {(template.matchCondition.purposeKeywords?.length ?? 0) > 0 && (
                              <p>目的KW: {template.matchCondition.purposeKeywords?.join(', ')}</p>
                            )}
                            {(template.matchCondition.payeeKeywords?.length ?? 0) > 0 && (
                              <p>取引先KW: {template.matchCondition.payeeKeywords?.join(', ')}</p>
                            )}
                            {!template.matchCondition.amountMin &&
                              !template.matchCondition.amountMax &&
                              !(template.matchCondition.purposeKeywords?.length) &&
                              !(template.matchCondition.payeeKeywords?.length) && (
                                <p className="text-gray-400">条件なし（全てにマッチ）</p>
                              )}
                          </div>
                        </div>
                        <div>
                          <p className="text-gray-500">勘定科目</p>
                          <div className="mt-1 space-y-1">
                            {template.entries.map((entry, i) => (
                              <p key={i}>
                                {entry.entryType === 'debit' ? '借方' : '貸方'}:{' '}
                                {entry.accountItem.accountItemName}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4">
                        <p className="text-sm text-gray-500">摘要テンプレート</p>
                        <p className="text-sm font-mono bg-gray-50 p-2 rounded mt-1">
                          {template.descriptionTemplate.template}
                        </p>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => startEdit(template)}>
                          <Edit className="w-4 h-4 mr-1" />
                          編集
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(template.id)}
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          削除
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* 戻るリンク */}
          <div className="mt-6">
            <a
              href="/admin/settings"
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              システム設定に戻る
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
