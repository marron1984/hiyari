'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Select } from '@/components/ui';
import {
  DOCUMENT_TEMPLATES,
  getTemplatesByOwnerType,
  getTemplatesByCategory,
} from '@/data/document-templates';
import {
  DocumentOwnerType,
  DocumentCategory,
  DOCUMENT_CATEGORY_CONFIG,
  DOCUMENT_OWNER_TYPE_CONFIG,
} from '@/types/document';
import {
  FileText,
  Search,
  ArrowLeft,
  Check,
  X,
  Calendar,
  Pen,
  Users,
  Building2,
  Briefcase,
  Home,
} from 'lucide-react';

export default function DocumentTemplatesPage() {
  return (
    <AuthGuard>
      <TemplatesContent />
    </AuthGuard>
  );
}

function TemplatesContent() {
  const [searchQuery, setSearchQuery] = useState('');
  const [ownerTypeFilter, setOwnerTypeFilter] = useState<DocumentOwnerType | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | ''>('');
  const [requiredFilter, setRequiredFilter] = useState<'all' | 'required' | 'optional'>('all');

  // フィルタ済みテンプレート
  const filteredTemplates = useMemo(() => {
    let templates = [...DOCUMENT_TEMPLATES];

    // 所有者タイプフィルタ
    if (ownerTypeFilter) {
      templates = getTemplatesByOwnerType(ownerTypeFilter);
    }

    // カテゴリフィルタ
    if (categoryFilter) {
      templates = templates.filter(t => t.category === categoryFilter);
    }

    // 必須フィルタ
    if (requiredFilter === 'required') {
      templates = templates.filter(t => t.required);
    } else if (requiredFilter === 'optional') {
      templates = templates.filter(t => !t.required);
    }

    // 検索
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      templates = templates.filter(
        t => t.name.toLowerCase().includes(query) || t.key.toLowerCase().includes(query)
      );
    }

    return templates;
  }, [searchQuery, ownerTypeFilter, categoryFilter, requiredFilter]);

  // 統計
  const stats = useMemo(() => {
    const total = DOCUMENT_TEMPLATES.length;
    const required = DOCUMENT_TEMPLATES.filter(t => t.required).length;
    const withValidity = DOCUMENT_TEMPLATES.filter(t => t.validityDays).length;
    const signed = DOCUMENT_TEMPLATES.filter(t => t.signedRequired).length;
    return { total, required, withValidity, signed };
  }, []);

  const getOwnerIcon = (ownerType: DocumentOwnerType) => {
    switch (ownerType) {
      case 'RESIDENT':
        return <Users className="w-4 h-4" />;
      case 'EMPLOYEE':
        return <Briefcase className="w-4 h-4" />;
      case 'PARTNER':
        return <Building2 className="w-4 h-4" />;
      case 'ORG':
        return <Home className="w-4 h-4" />;
    }
  };

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Link href="/dashboard/docs" className="text-gray-500 hover:text-gray-700">
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <FileText className="w-6 h-6" />
                  書類テンプレート管理
                </h1>
              </div>
              <p className="text-sm text-gray-500">
                書類種別（doc_type）の定義・必須設定・有効期限の管理
              </p>
            </div>
          </div>

          {/* 統計カード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="text-sm text-gray-500">全テンプレート</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </Card>
            <Card className="p-4 bg-red-50">
              <div className="text-sm text-gray-500">必須書類</div>
              <div className="text-2xl font-bold text-red-600">{stats.required}</div>
            </Card>
            <Card className="p-4 bg-yellow-50">
              <div className="text-sm text-gray-500">有効期限あり</div>
              <div className="text-2xl font-bold text-yellow-600">{stats.withValidity}</div>
            </Card>
            <Card className="p-4 bg-blue-50">
              <div className="text-sm text-gray-500">署名必須</div>
              <div className="text-2xl font-bold text-blue-600">{stats.signed}</div>
            </Card>
          </div>

          {/* フィルター */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="テンプレート名、キーで検索..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select
                  value={ownerTypeFilter}
                  onChange={(e) => setOwnerTypeFilter(e.target.value as DocumentOwnerType | '')}
                  options={[
                    { value: '', label: '全対象' },
                    { value: 'RESIDENT', label: '入居者' },
                    { value: 'EMPLOYEE', label: '従業員' },
                    { value: 'PARTNER', label: '取引先' },
                    { value: 'ORG', label: '事業所共通' },
                  ]}
                  className="w-36"
                />
                <Select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as DocumentCategory | '')}
                  options={[
                    { value: '', label: '全カテゴリ' },
                    { value: 'NYUKYO', label: '入居' },
                    { value: 'OPS', label: '運用' },
                    { value: 'CARE', label: '介護' },
                    { value: 'HR', label: '労務' },
                    { value: 'AUDIT', label: '監査' },
                    { value: 'CONTRACT', label: '契約' },
                    { value: 'FINANCE', label: '金銭' },
                  ]}
                  className="w-36"
                />
                <Select
                  value={requiredFilter}
                  onChange={(e) => setRequiredFilter(e.target.value as 'all' | 'required' | 'optional')}
                  options={[
                    { value: 'all', label: '全書類' },
                    { value: 'required', label: '必須のみ' },
                    { value: 'optional', label: '任意のみ' },
                  ]}
                  className="w-32"
                />
              </div>
            </CardContent>
          </Card>

          {/* テンプレート一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-5 h-5" />
                テンプレート一覧
                <Badge>{filteredTemplates.length}件</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>該当するテンプレートがありません</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-3 px-4 font-medium">書類名</th>
                        <th className="text-left py-3 px-4 font-medium">キー</th>
                        <th className="text-center py-3 px-4 font-medium">対象</th>
                        <th className="text-center py-3 px-4 font-medium">カテゴリ</th>
                        <th className="text-center py-3 px-4 font-medium">必須</th>
                        <th className="text-center py-3 px-4 font-medium">有効期限</th>
                        <th className="text-center py-3 px-4 font-medium">署名</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTemplates.map((template) => {
                        const categoryConfig = DOCUMENT_CATEGORY_CONFIG[template.category];
                        const ownerConfig = DOCUMENT_OWNER_TYPE_CONFIG[template.ownerType];

                        return (
                          <tr key={template.key} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <span className="font-medium">{template.name}</span>
                            </td>
                            <td className="py-3 px-4">
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                {template.key}
                              </code>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {getOwnerIcon(template.ownerType)}
                                <span className="text-xs">{ownerConfig.label}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Badge className={`${categoryConfig.color} bg-gray-100`}>
                                {categoryConfig.label}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {template.required ? (
                                <Check className="w-5 h-5 text-red-500 mx-auto" />
                              ) : (
                                <X className="w-5 h-5 text-gray-300 mx-auto" />
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {template.validityDays ? (
                                <div className="flex items-center justify-center gap-1 text-yellow-600">
                                  <Calendar className="w-4 h-4" />
                                  <span className="text-xs">{template.validityDays}日</span>
                                </div>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {template.signedRequired ? (
                                <Pen className="w-4 h-4 text-blue-500 mx-auto" />
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 凡例 */}
          <div className="mt-4 text-sm text-gray-500 flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-red-500" />
              <span>必須書類</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-yellow-600" />
              <span>有効期限あり</span>
            </div>
            <div className="flex items-center gap-2">
              <Pen className="w-4 h-4 text-blue-500" />
              <span>署名必須</span>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
