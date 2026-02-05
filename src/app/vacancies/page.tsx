'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, Badge, Button } from '@/components/ui';
import {
  Building2,
  MapPin,
  Users,
  Calendar,
  DollarSign,
  Heart,
  Phone,
  Mail,
  MessageSquare,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  X,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

// ===== 型定義 =====

interface CareConditions {
  minCareLevel?: number | null;
  maxCareLevel?: number | null;
  acceptsDementia?: boolean;
  acceptsMedicalCare?: boolean;
  acceptsTerminalCare?: boolean;
  note?: string;
}

interface PriceRange {
  monthlyMin?: number | null;
  monthlyMax?: number | null;
  depositMin?: number | null;
  depositMax?: number | null;
  note?: string;
}

interface PublicVacancyUnit {
  id: string;
  businessUnitId: string;
  buildingName: string;
  area: string;
  roomType: string;
  capacity: number;
  availableCount: number;
  availableFrom: string | null;
  conditionsJson: CareConditions;
  priceRangeJson: PriceRange;
}

interface ApiMeta {
  areas: string[];
  roomTypes: string[];
  totalBeforeFilter: number;
}

type SortOption = 'availability' | 'date' | 'price' | 'name';

// ===== ユーティリティ =====

const CARE_LEVEL_LABELS: Record<number, string> = {
  1: '要介護1',
  2: '要介護2',
  3: '要介護3',
  4: '要介護4',
  5: '要介護5',
};

const SORT_LABELS: Record<SortOption, string> = {
  availability: '空室数順',
  date: '入居可能日順',
  price: '価格が安い順',
  name: '施設名順',
};

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  const key = 'vacancy_session_id';
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = `vs_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}

async function trackEvent(
  eventType: 'view' | 'click_inquiry' | 'filter_change',
  businessUnitId?: string | null,
  vacancyUnitId?: string | null,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const sessionId = getOrCreateSessionId();
    await fetch('/api/vacancy-analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        businessUnitId: businessUnitId || null,
        vacancyUnitId: vacancyUnitId || null,
        sessionId,
        ...extra,
      }),
    });
  } catch {
    // 失敗しても無視
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '即入居可';
  const date = new Date(dateStr);
  const now = new Date();
  if (date <= now) return '即入居可';
  return `${date.getMonth() + 1}月${date.getDate()}日〜`;
}

function formatPrice(min: number | null | undefined, max: number | null | undefined): string {
  if (min == null && max == null) return 'お問い合わせください';
  if (min != null && max != null) {
    if (min === max) return `${min}万円/月`;
    return `${min}〜${max}万円/月`;
  }
  if (min != null) return `${min}万円〜/月`;
  if (max != null) return `〜${max}万円/月`;
  return 'お問い合わせください';
}

// ===== フィルタバーコンポーネント =====

interface FilterBarProps {
  areas: string[];
  roomTypes: string[];
  selectedArea: string;
  selectedRoomType: string;
  selectedSort: SortOption;
  onAreaChange: (area: string) => void;
  onRoomTypeChange: (roomType: string) => void;
  onSortChange: (sort: SortOption) => void;
  onReset: () => void;
  hasFilters: boolean;
}

function FilterBar({
  areas,
  roomTypes,
  selectedArea,
  selectedRoomType,
  selectedSort,
  onAreaChange,
  onRoomTypeChange,
  onSortChange,
  onReset,
  hasFilters,
}: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
      {/* モバイル用トグル */}
      <div className="flex items-center justify-between md:hidden mb-3">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-gray-700 font-medium"
        >
          <SlidersHorizontal className="w-5 h-5" />
          フィルタ・並び替え
          {hasFilters && (
            <Badge className="bg-blue-100 text-blue-700 text-xs">適用中</Badge>
          )}
        </button>
        {hasFilters && (
          <button
            onClick={onReset}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            リセット
          </button>
        )}
      </div>

      {/* フィルタコントロール */}
      <div className={`${showFilters ? 'block' : 'hidden'} md:block`}>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* エリア選択 */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">エリア</label>
            <select
              value={selectedArea}
              onChange={(e) => onAreaChange(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">すべてのエリア</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          {/* 部屋タイプ選択 */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">部屋タイプ</label>
            <select
              value={selectedRoomType}
              onChange={(e) => onRoomTypeChange(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">すべてのタイプ</option>
              {roomTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* 並び替え */}
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">並び替え</label>
            <select
              value={selectedSort}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          {/* リセットボタン（デスクトップ） */}
          {hasFilters && (
            <div className="hidden md:block">
              <label className="block text-xs text-transparent mb-1">.</label>
              <button
                onClick={onReset}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg flex items-center gap-1"
              >
                <RefreshCw className="w-4 h-4" />
                リセット
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== メインコンテンツ =====

function VacanciesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [units, setUnits] = useState<PublicVacancyUnit[]>([]);
  const [meta, setMeta] = useState<ApiMeta>({ areas: [], roomTypes: [], totalBeforeFilter: 0 });
  const [loading, setLoading] = useState(true);
  const [viewTracked, setViewTracked] = useState(false);

  // URLからフィルタ状態を取得
  const area = searchParams.get('area') || '';
  const roomType = searchParams.get('roomType') || '';
  const sort = (searchParams.get('sort') as SortOption) || 'availability';

  const hasFilters = !!(area || roomType);

  // URLを更新する関数
  const updateUrl = useCallback(
    (params: Record<string, string>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, value]) => {
        if (value) {
          newParams.set(key, value);
        } else {
          newParams.delete(key);
        }
      });
      const newUrl = newParams.toString() ? `?${newParams.toString()}` : '/vacancies';
      router.push(newUrl, { scroll: false });
    },
    [searchParams, router]
  );

  // データ取得
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (area) params.set('area', area);
        if (roomType) params.set('roomType', roomType);
        params.set('sort', sort);

        const res = await fetch(`/api/public/vacancies?${params.toString()}`);
        const data = await res.json();
        setUnits(data.items || []);
        setMeta(data.meta || { areas: [], roomTypes: [], totalBeforeFilter: 0 });
      } catch (error) {
        console.error('Fetch error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [area, roomType, sort]);

  // ページ表示トラッキング
  useEffect(() => {
    if (!loading && !viewTracked) {
      trackEvent('view');
      setViewTracked(true);
    }
  }, [loading, viewTracked]);

  // フィルタ変更ハンドラ
  const handleAreaChange = (newArea: string) => {
    updateUrl({ area: newArea });
    trackEvent('filter_change', null, null, { filterType: 'area', value: newArea });
  };

  const handleRoomTypeChange = (newRoomType: string) => {
    updateUrl({ roomType: newRoomType });
    trackEvent('filter_change', null, null, { filterType: 'roomType', value: newRoomType });
  };

  const handleSortChange = (newSort: SortOption) => {
    updateUrl({ sort: newSort });
    trackEvent('filter_change', null, null, { filterType: 'sort', value: newSort });
  };

  const handleReset = () => {
    router.push('/vacancies', { scroll: false });
  };

  const handleInquiryClick = useCallback(
    (businessUnitId?: string, vacancyUnitId?: string) => {
      trackEvent('click_inquiry', businessUnitId, vacancyUnitId);
    },
    []
  );

  // 空室ありのみ
  const availableUnits = units.filter((u) => u.availableCount > 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-blue-500 animate-pulse" />
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-7 h-7 text-blue-600" />
            空室情報
          </h1>
          <p className="text-gray-600 mt-1">
            入居可能な施設・お部屋をご案内しています
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* サマリー */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4 text-center bg-white">
            <div className="text-3xl font-bold text-blue-600">
              {availableUnits.reduce((sum, u) => sum + u.availableCount, 0)}
            </div>
            <div className="text-sm text-gray-600">空室数</div>
          </Card>
          <Card className="p-4 text-center bg-white">
            <div className="text-3xl font-bold text-green-600">
              {availableUnits.length}
            </div>
            <div className="text-sm text-gray-600">ご案内可能施設</div>
          </Card>
          <Card className="p-4 text-center bg-white md:col-span-1 col-span-2">
            <Link href="/vacancies/inquiry" onClick={() => handleInquiryClick()}>
              <Button className="w-full flex items-center justify-center gap-2">
                <MessageSquare className="w-5 h-5" />
                お問い合わせ
              </Button>
            </Link>
          </Card>
        </div>

        {/* Ticket 080: フィルタバー */}
        <FilterBar
          areas={meta.areas}
          roomTypes={meta.roomTypes}
          selectedArea={area}
          selectedRoomType={roomType}
          selectedSort={sort}
          onAreaChange={handleAreaChange}
          onRoomTypeChange={handleRoomTypeChange}
          onSortChange={handleSortChange}
          onReset={handleReset}
          hasFilters={hasFilters}
        />

        {/* 検索結果件数 */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            {hasFilters ? (
              <>
                <span className="font-medium">{availableUnits.length}件</span>
                の施設が見つかりました
                {meta.totalBeforeFilter > 0 && (
                  <span className="text-gray-400 ml-1">
                    （全{meta.totalBeforeFilter}件中）
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="font-medium">{availableUnits.length}件</span>
                の施設をご案内中
              </>
            )}
          </p>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <ArrowUpDown className="w-3 h-3" />
            {SORT_LABELS[sort]}
          </div>
        </div>

        {/* 施設一覧 */}
        {availableUnits.length === 0 ? (
          <Card className="p-8 text-center bg-white">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">
              {hasFilters
                ? '条件に合う空室がありません'
                : '現在ご案内可能な空室がありません'}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              条件が合わない場合もご相談ください。空き次第ご連絡いたします。
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-4 justify-center">
              {hasFilters && (
                <Button variant="secondary" onClick={handleReset}>
                  条件をリセット
                </Button>
              )}
              <Link href="/vacancies/inquiry" onClick={() => handleInquiryClick()}>
                <Button>お問い合わせ</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {availableUnits.map((unit) => (
              <Card
                key={unit.id}
                className="p-6 bg-white hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {unit.buildingName}
                    </h2>
                    <div className="flex items-center gap-1 text-gray-500 text-sm mt-1">
                      <MapPin className="w-4 h-4" />
                      {unit.area}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {unit.availableCount}
                    </div>
                    <div className="text-xs text-gray-500">空室</div>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Calendar className="w-4 h-4 text-green-500" />
                      {formatDate(unit.availableFrom)}
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <Users className="w-4 h-4 text-blue-500" />
                      {unit.roomType}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-sm">
                    <DollarSign className="w-4 h-4 text-yellow-500" />
                    <span className="font-medium">
                      {formatPrice(
                        unit.priceRangeJson?.monthlyMin,
                        unit.priceRangeJson?.monthlyMax
                      )}
                    </span>
                  </div>

                  {unit.conditionsJson && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Heart className="w-4 h-4 text-pink-500" />
                      {unit.conditionsJson.minCareLevel &&
                        unit.conditionsJson.maxCareLevel && (
                          <Badge className="bg-gray-100 text-gray-700 text-xs">
                            {CARE_LEVEL_LABELS[unit.conditionsJson.minCareLevel]}〜
                            {CARE_LEVEL_LABELS[unit.conditionsJson.maxCareLevel]}
                          </Badge>
                        )}
                      {unit.conditionsJson.acceptsDementia && (
                        <Badge className="bg-purple-100 text-purple-700 text-xs">
                          認知症可
                        </Badge>
                      )}
                      {unit.conditionsJson.acceptsMedicalCare && (
                        <Badge className="bg-blue-100 text-blue-700 text-xs">
                          医療対応
                        </Badge>
                      )}
                      {unit.conditionsJson.acceptsTerminalCare && (
                        <Badge className="bg-pink-100 text-pink-700 text-xs">
                          看取り対応
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <Link
                  href={`/vacancies/inquiry?businessUnitId=${unit.businessUnitId}&vacancyUnitId=${unit.id}`}
                  onClick={() => handleInquiryClick(unit.businessUnitId, unit.id)}
                >
                  <Button className="w-full flex items-center justify-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    この施設について問い合わせる
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        )}

        {/* お問い合わせ案内 */}
        <Card className="mt-8 p-6 bg-blue-50 border-blue-200">
          <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Phone className="w-5 h-5 text-blue-600" />
            お問い合わせ
          </h3>
          <p className="text-gray-700 mb-4">
            空室状況やご入居条件について、お気軽にお問い合わせください。
            専門スタッフがご対応いたします。
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/vacancies/inquiry"
              className="flex-1"
              onClick={() => handleInquiryClick()}
            >
              <Button className="w-full flex items-center justify-center gap-2">
                <Mail className="w-4 h-4" />
                オンラインで問い合わせ
              </Button>
            </Link>
          </div>
        </Card>
      </main>

      {/* フッター */}
      <footer className="bg-gray-100 mt-12 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>掲載情報は随時更新していますが、最新状況はお問い合わせください。</p>
        </div>
      </footer>
    </div>
  );
}

// ===== ローディングフォールバック =====

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Building2 className="w-12 h-12 mx-auto mb-3 text-blue-500 animate-pulse" />
        <p className="text-gray-500">読み込み中...</p>
      </div>
    </div>
  );
}

// ===== メインコンポーネント =====

export default function PublicVacanciesPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <VacanciesContent />
    </Suspense>
  );
}
