'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getIncident, getBranch } from '@/lib/firestore';
import { formatDateJP } from '@/lib/utils';
import { getSortedScoreBreakdown } from '@/lib/scoring';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { Incident, Branch, SEVERITY_LABELS, Severity } from '@/types';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Building,
  User,
  AlertTriangle,
  Star,
  Tag,
  CheckCircle,
  Shield,
  FileText,
  Image as ImageIcon,
  Pencil,
} from 'lucide-react';

export default function IncidentDetailPage() {
  return (
    <AuthGuard>
      <IncidentDetailContent />
    </AuthGuard>
  );
}

function IncidentDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const incidentId = params.id as string;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const incidentData = await getIncident(incidentId);
        if (!incidentData) {
          setError('投稿が見つかりません');
          return;
        }

        // 自分の投稿か、管理者でなければアクセス不可
        if (incidentData.userId !== user?.id && !isAdmin) {
          setError('この投稿を閲覧する権限がありません');
          return;
        }

        setIncident(incidentData);

        const branchData = await getBranch(incidentData.branchId);
        setBranch(branchData);
      } catch (err) {
        console.error('Failed to fetch incident:', err);
        setError('データの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [incidentId, user, isAdmin]);

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  if (error || !incident) {
    return (
      <>
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">{error || '投稿が見つかりません'}</p>
              <Button onClick={() => router.push('/dashboard')}>
                ダッシュボードに戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const sortedBreakdown = getSortedScoreBreakdown(incident.scoreBreakdown);
  const severityColor =
    incident.severity >= 4 ? 'text-red-600 bg-red-50' : 'text-blue-600 bg-blue-50';

  return (
    <>
      <Header />
      <main className="pb-8">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="ml-2 text-xl font-bold text-gray-900">投稿詳細</h1>
          </div>

          {/* 不正フラグ警告 */}
          {incident.fraudFlag && (
            <Card className="mb-4 border-red-200 bg-red-50">
              <CardContent className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">不正の可能性あり</p>
                  <p className="text-sm text-red-600">{incident.fraudReason}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* スコアカード */}
          <Card className="mb-6">
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Star className="w-6 h-6 text-yellow-500 mr-2" />
                  <span className="text-sm text-gray-600">獲得ポイント</span>
                </div>
                <span className="text-3xl font-bold text-blue-600">
                  {incident.scoreTotal}
                  <span className="text-lg text-gray-500 ml-1">pt</span>
                </span>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">ポイント内訳</p>
                <div className="space-y-2">
                  {sortedBreakdown.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        {item.label}
                      </span>
                      <span className="font-medium text-green-600">+{item.points}</span>
                    </div>
                  ))}
                  {incident.fraudFlag && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center text-red-600">
                        <AlertTriangle className="w-4 h-4 text-red-500 mr-2" />
                        不正フラグ（ランキング除外）
                      </span>
                      <span className="font-medium text-red-600">-</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 基本情報 */}
          <Card className="mb-4">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge
                  variant={incident.severity >= 4 ? 'danger' : 'default'}
                  className={severityColor}
                >
                  重大度 {incident.severity}
                </Badge>
                <Badge variant="info">{incident.category}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center text-gray-600">
                  <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                  {formatDateJP(incident.date)}
                </div>
                <div className="flex items-center text-gray-600">
                  <Clock className="w-4 h-4 mr-2 flex-shrink-0" />
                  {incident.timeSlot}
                </div>
                <div className="flex items-center text-gray-600">
                  <Building className="w-4 h-4 mr-2 flex-shrink-0" />
                  {branch?.name || '-'}
                </div>
                <div className="flex items-center text-gray-600">
                  <User className="w-4 h-4 mr-2 flex-shrink-0" />
                  {incident.jobType}
                </div>
                {incident.location && (
                  <div className="flex items-center text-gray-600 col-span-2">
                    <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                    {incident.location}
                  </div>
                )}
              </div>

              {incident.tags && incident.tags.length > 0 && (
                <div className="flex items-center flex-wrap gap-2 pt-2">
                  <Tag className="w-4 h-4 text-gray-400" />
                  {incident.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 本文 */}
          <Card className="mb-4">
            <CardContent>
              <div className="flex items-center mb-2">
                <FileText className="w-4 h-4 text-gray-500 mr-2" />
                <h2 className="font-semibold text-gray-900">本文</h2>
                <span className="ml-auto text-xs text-gray-500">
                  {incident.bodyLength}文字
                </span>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap">{incident.body}</p>
            </CardContent>
          </Card>

          {/* 回避行動 */}
          {incident.action && (
            <Card className="mb-4">
              <CardContent>
                <div className="flex items-center mb-2">
                  <Shield className="w-4 h-4 text-green-500 mr-2" />
                  <h2 className="font-semibold text-gray-900">回避行動</h2>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">{incident.action}</p>
              </CardContent>
            </Card>
          )}

          {/* 再発防止提案 */}
          {incident.prevention && (
            <Card className="mb-4">
              <CardContent>
                <div className="flex items-center mb-2">
                  <CheckCircle className="w-4 h-4 text-blue-500 mr-2" />
                  <h2 className="font-semibold text-gray-900">再発防止提案</h2>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">{incident.prevention}</p>
              </CardContent>
            </Card>
          )}

          {/* 画像 */}
          {incident.imageUrls && incident.imageUrls.length > 0 && (
            <Card className="mb-4">
              <CardContent>
                <div className="flex items-center mb-3">
                  <ImageIcon className="w-4 h-4 text-gray-500 mr-2" />
                  <h2 className="font-semibold text-gray-900">添付画像</h2>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {incident.imageUrls.map((url, index) => (
                    <a
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-square rounded-lg overflow-hidden"
                    >
                      <img
                        src={url}
                        alt={`添付画像 ${index + 1}`}
                        className="w-full h-full object-cover hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 投稿者情報（管理者のみ） */}
          {isAdmin && (
            <Card className="mb-4 bg-gray-50">
              <CardContent>
                <p className="text-xs text-gray-500 mb-1">投稿者（管理者のみ表示）</p>
                <p className="text-sm text-gray-700">{incident.userName || incident.userId}</p>
                <p className="text-xs text-gray-500 mt-2">
                  投稿日時: {incident.createdAt.toLocaleString('ja-JP')}
                </p>
              </CardContent>
            </Card>
          )}

          {/* 操作ボタン */}
          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard')}
              className="flex-1"
            >
              ダッシュボードへ
            </Button>
            {incident.userId === user?.id && (
              <Button
                variant="outline"
                onClick={() => router.push(`/incident/${incidentId}/edit`)}
                className="flex-1"
              >
                <Pencil className="w-4 h-4 mr-1" />
                編集
              </Button>
            )}
            <Button
              onClick={() => router.push('/submit')}
              className="flex-1"
            >
              新規投稿
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}
