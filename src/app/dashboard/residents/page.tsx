'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { getResidentsWithDocStats, getResidentSummary } from '@/lib/resident';
import { getFacilities } from '@/lib/vacancy';
import {
  ResidentWithDocStats,
  ResidentStatus,
  RESIDENT_STATUS_CONFIG,
  calculateAge,
} from '@/types/resident';
import { Facility } from '@/types/vacancy';
import {
  Users,
  Search,
  Building2,
  Calendar,
  FileText,
  AlertTriangle,
  Cake,
  ArrowRight,
  Plus,
  Filter,
} from 'lucide-react';

export default function ResidentsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [residents, setResidents] = useState<ResidentWithDocStats[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    active: number;
    plannedMoveout: number;
    inactive: number;
    byFacility: Record<string, number>;
  } | null>(null);

  // フィルター
  const [searchQuery, setSearchQuery] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<ResidentStatus | ''>('');
  const [birthMonthFilter, setBirthMonthFilter] = useState('');
  const [docFilter, setDocFilter] = useState<'all' | 'missing'>('all');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [residentsData, facilitiesData, summaryData] = await Promise.all([
        getResidentsWithDocStats(user.tenantId),
        getFacilities(user.tenantId),
        getResidentSummary(user.tenantId),
      ]);
      setResidents(residentsData);
      setFacilities(facilitiesData);
      setSummary(summaryData);
    } catch (err) {
      console.error('Failed to fetch residents:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // フィルタ済みリスト
  const filteredResidents = useMemo(() => {
    let result = [...residents];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.nameKana?.toLowerCase().includes(query) ||
          r.roomNumber?.toLowerCase().includes(query)
      );
    }

    if (facilityFilter) {
      result = result.filter((r) => r.facilityId === facilityFilter);
    }

    if (statusFilter) {
      result = result.filter((r) => r.status === statusFilter);
    }

    if (birthMonthFilter) {
      const month = parseInt(birthMonthFilter);
      result = result.filter((r) => {
        if (!r.birthDate) return false;
        const bd = r.birthDate instanceof Date ? r.birthDate : new Date(r.birthDate);
        return bd.getMonth() + 1 === month;
      });
    }

    if (docFilter === 'missing') {
      result = result.filter((r) => r.docStats.missing > 0);
    }

    return result;
  }, [residents, searchQuery, facilityFilter, statusFilter, birthMonthFilter, docFilter]);

  // 誕生日が近い人数
  const upcomingBirthdayCount = useMemo(() => {
    return residents.filter((r) => r.upcomingBirthday && r.status === '入居中').length;
  }, [residents]);

  // 書類未回収人数
  const missingDocsCount = useMemo(() => {
    return residents.filter((r) => r.docStats.missing > 0 && r.status === '入居中').length;
  }, [residents]);

  if (loading) {
    return <Loading text="読み込み中..." />;
  }

  return (
    <main className="pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users className="w-6 h-6" />
                入居者台帳
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                入居者の基本情報・書類・誕生日を管理
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/key-person">
                <Button variant="outline">
                  <Users className="w-4 h-4 mr-1" />
                  キーパーソン
                </Button>
              </Link>
              <Link href="/dashboard/residents/new">
                <Button>
                  <Plus className="w-4 h-4 mr-1" />
                  新規登録
                </Button>
              </Link>
            </div>
          </div>

          {/* サマリーカード */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card className="p-4">
              <div className="text-sm text-gray-500">入居中</div>
              <div className="text-2xl font-bold text-green-600">
                {summary?.active || 0}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-gray-500">退去予定</div>
              <div className="text-2xl font-bold text-yellow-600">
                {summary?.plannedMoveout || 0}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-gray-500">退去済</div>
              <div className="text-2xl font-bold text-gray-500">
                {summary?.inactive || 0}
              </div>
            </Card>
            <Card className="p-4 bg-pink-50">
              <div className="text-sm text-gray-500 flex items-center gap-1">
                <Cake className="w-4 h-4" />
                誕生日(30日以内)
              </div>
              <div className="text-2xl font-bold text-pink-600">
                {upcomingBirthdayCount}
              </div>
            </Card>
            <Card className="p-4 bg-red-50">
              <div className="text-sm text-gray-500 flex items-center gap-1">
                <FileText className="w-4 h-4" />
                書類未回収
              </div>
              <div className="text-2xl font-bold text-red-600">
                {missingDocsCount}
              </div>
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
                      placeholder="氏名、かな、部屋番号で検索..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select
                  value={facilityFilter}
                  onChange={(e) => setFacilityFilter(e.target.value)}
                  options={[
                    { value: '', label: '全建物' },
                    ...facilities.map((f) => ({ value: f.id, label: f.name })),
                  ]}
                  className="w-36"
                />
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ResidentStatus | '')}
                  options={[
                    { value: '', label: '全ステータス' },
                    { value: '入居中', label: '入居中' },
                    { value: '退去予定', label: '退去予定' },
                    { value: '退去済', label: '退去済' },
                    { value: '一時外出', label: '一時外出' },
                  ]}
                  className="w-32"
                />
                <Select
                  value={birthMonthFilter}
                  onChange={(e) => setBirthMonthFilter(e.target.value)}
                  options={[
                    { value: '', label: '誕生月' },
                    ...Array.from({ length: 12 }, (_, i) => ({
                      value: String(i + 1),
                      label: `${i + 1}月`,
                    })),
                  ]}
                  className="w-24"
                />
                <Select
                  value={docFilter}
                  onChange={(e) => setDocFilter(e.target.value as 'all' | 'missing')}
                  options={[
                    { value: 'all', label: '全書類' },
                    { value: 'missing', label: '未回収あり' },
                  ]}
                  className="w-32"
                />
              </div>
            </CardContent>
          </Card>

          {/* 入居者一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-5 h-5" />
                入居者一覧
                <Badge>{filteredResidents.length}名</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredResidents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>入居者がいません</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredResidents.map((resident) => {
                    const statusConfig = RESIDENT_STATUS_CONFIG[resident.status];
                    const birthDateObj = resident.birthDate
                      ? (resident.birthDate instanceof Date ? resident.birthDate : new Date(resident.birthDate))
                      : null;
                    const age = birthDateObj ? calculateAge(birthDateObj) : null;

                    return (
                      <Link
                        key={resident.id}
                        href={`/dashboard/residents/${resident.id}`}
                        className="block py-4 hover:bg-gray-50 -mx-4 px-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                              <Users className="w-5 h-5 text-gray-500" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{resident.name}</span>
                                {resident.nameKana && (
                                  <span className="text-xs text-gray-400">
                                    ({resident.nameKana})
                                  </span>
                                )}
                                {resident.upcomingBirthday && (
                                  <Badge className="bg-pink-50 text-pink-600 text-xs">
                                    <Cake className="w-3 h-3 mr-1" />
                                    {resident.daysUntilBirthday === 0
                                      ? '今日!'
                                      : `${resident.daysUntilBirthday}日後`}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm text-gray-500">
                                {age !== null && <span>{age}歳</span>}
                                {birthDateObj && (
                                  <span>
                                    {birthDateObj.toLocaleDateString('ja-JP', {
                                      month: 'short',
                                      day: 'numeric',
                                    })}生
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {resident.facilityName || '未設定'}
                                  {resident.roomNumber && ` / ${resident.roomNumber}`}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {/* 書類ステータス */}
                            {resident.docStats.missing > 0 && (
                              <Badge className="bg-red-50 text-red-600">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                未回収{resident.docStats.missing}
                              </Badge>
                            )}
                            {resident.docStats.expired > 0 && (
                              <Badge className="bg-yellow-50 text-yellow-600">
                                期限切{resident.docStats.expired}
                              </Badge>
                            )}
                            {/* ステータス */}
                            <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
                              {statusConfig.label}
                            </Badge>
                            <ArrowRight className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
  );
}
