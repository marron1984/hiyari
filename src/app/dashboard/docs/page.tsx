'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getDocuments,
  getDocumentSummary,
  getMissingDocumentsByOwner,
} from '@/lib/document';
import {
  Document,
  DocumentSummary,
  DocumentOwnerType,
  DocumentStatus,
  DOCUMENT_STATUS_CONFIG,
  DOCUMENT_OWNER_TYPE_CONFIG,
  DOCUMENT_CATEGORY_CONFIG,
} from '@/types/document';
import {
  FileText,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Filter,
  FolderOpen,
  Users,
  Building2,
  Briefcase,
  ArrowRight,
} from 'lucide-react';

export default function DocumentsPage() {
  return (
    <AuthGuard>
      <DocumentsContent />
    </AuthGuard>
  );
}

function DocumentsContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [missingByOwner, setMissingByOwner] = useState<{
    ownerId: string;
    ownerName: string;
    ownerType: DocumentOwnerType;
    count: number;
  }[]>([]);

  // フィルター
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>('');
  const [ownerTypeFilter, setOwnerTypeFilter] = useState<DocumentOwnerType | ''>('');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [docs, sum, missing] = await Promise.all([
        getDocuments(user.tenantId, {
          search: searchQuery || undefined,
          status: statusFilter || undefined,
          ownerType: ownerTypeFilter || undefined,
        }),
        getDocumentSummary(user.tenantId),
        getMissingDocumentsByOwner(user.tenantId),
      ]);
      setDocuments(docs);
      setSummary(sum);
      setMissingByOwner(missing);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoading(false);
    }
  }, [user, searchQuery, statusFilter, ownerTypeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      <main className="pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FileText className="w-6 h-6" />
                書類管理
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                入居者・従業員・取引先・事業所の書類を一元管理
              </p>
            </div>
            <Link href="/dashboard/docs/templates">
              <Button variant="secondary">
                <FolderOpen className="w-4 h-4 mr-1" />
                テンプレ管理
              </Button>
            </Link>
          </div>

          {/* サマリーカード */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">全書類</p>
                    <p className="text-2xl font-bold text-gray-700">{summary.total}</p>
                  </div>
                  <FileText className="w-8 h-8 text-gray-300" />
                </div>
              </Card>
              <Card className={`p-4 ${summary.missing > 0 ? 'bg-red-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">未回収</p>
                    <p className={`text-2xl font-bold ${summary.missing > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {summary.missing}
                    </p>
                  </div>
                  <XCircle className={`w-8 h-8 ${summary.missing > 0 ? 'text-red-300' : 'text-gray-300'}`} />
                </div>
              </Card>
              <Card className={`p-4 ${summary.expired > 0 ? 'bg-orange-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">期限切れ</p>
                    <p className={`text-2xl font-bold ${summary.expired > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                      {summary.expired}
                    </p>
                  </div>
                  <AlertTriangle className={`w-8 h-8 ${summary.expired > 0 ? 'text-orange-300' : 'text-gray-300'}`} />
                </div>
              </Card>
              <Card className={`p-4 ${summary.dueSoon > 0 ? 'bg-yellow-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">30日以内</p>
                    <p className={`text-2xl font-bold ${summary.dueSoon > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                      {summary.dueSoon}
                    </p>
                  </div>
                  <Clock className={`w-8 h-8 ${summary.dueSoon > 0 ? 'text-yellow-300' : 'text-gray-300'}`} />
                </div>
              </Card>
              <Card className="p-4 bg-green-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">回収済</p>
                    <p className="text-2xl font-bold text-green-600">{summary.submitted}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-300" />
                </div>
              </Card>
            </div>
          )}

          {/* 未回収ランキング */}
          {missingByOwner.length > 0 && (
            <Card className="mb-6 bg-red-50 border-red-200">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-800">
                  <AlertTriangle className="w-5 h-5" />
                  未回収が多い対象
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {missingByOwner.slice(0, 5).map((item) => (
                    <div
                      key={item.ownerId}
                      className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-red-200"
                    >
                      {item.ownerType === 'RESIDENT' && <Users className="w-4 h-4 text-gray-500" />}
                      {item.ownerType === 'EMPLOYEE' && <Briefcase className="w-4 h-4 text-gray-500" />}
                      {item.ownerType === 'PARTNER' && <Building2 className="w-4 h-4 text-gray-500" />}
                      <span className="text-sm font-medium">{item.ownerName}</span>
                      <Badge className="bg-red-100 text-red-700">{item.count}件</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 検索・フィルター */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="書類名、対象者名で検索..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | '')}
                  options={[
                    { value: '', label: '全ステータス' },
                    { value: 'MISSING', label: '未回収' },
                    { value: 'EXPIRED', label: '期限切れ' },
                    { value: 'SUBMITTED', label: '回収済' },
                    { value: 'RENEWAL_PENDING', label: '更新待ち' },
                  ]}
                  className="w-40"
                />
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
                  className="w-40"
                />
              </div>
            </CardContent>
          </Card>

          {/* 書類一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-5 h-5" />
                書類一覧
                <Badge>{documents.length}件</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>書類がありません</p>
                  <p className="text-sm mt-2">入居者や従業員が登録されると、必須書類が自動生成されます</p>
                </div>
              ) : (
                <div className="divide-y">
                  {documents.map((doc) => {
                    const statusConfig = DOCUMENT_STATUS_CONFIG[doc.status];
                    const ownerConfig = DOCUMENT_OWNER_TYPE_CONFIG[doc.ownerType];

                    return (
                      <div
                        key={doc.id}
                        className="py-4 flex items-center justify-between hover:bg-gray-50 -mx-4 px-4"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${statusConfig.bgColor}`}>
                            <FileText className={`w-5 h-5 ${statusConfig.color}`} />
                          </div>
                          <div>
                            <p className="font-medium">{doc.docTypeName || doc.docType}</p>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <span>{ownerConfig.label}: {doc.ownerName || doc.ownerId}</span>
                              {doc.dueDate && (
                                <>
                                  <span>•</span>
                                  <span>期限: {doc.dueDate.toLocaleDateString('ja-JP')}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
                            {statusConfig.label}
                          </Badge>
                          {doc.version > 1 && (
                            <Badge>v{doc.version}</Badge>
                          )}
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
