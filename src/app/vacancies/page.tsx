'use client';

import { useState, useEffect } from 'react';
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

// ===== ユーティリティ =====

const CARE_LEVEL_LABELS: Record<number, string> = {
  1: '要介護1',
  2: '要介護2',
  3: '要介護3',
  4: '要介護4',
  5: '要介護5',
};

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

// ===== メインコンポーネント =====

export default function PublicVacanciesPage() {
  const [units, setUnits] = useState<PublicVacancyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [areaFilter, setAreaFilter] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/public/vacancies');
        const data = await res.json();
        setUnits(data.items || []);
      } catch (error) {
        console.error('Fetch error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // エリア一覧を取得
  const areas = Array.from(new Set(units.map((u) => u.area)));

  // フィルタ適用
  const filteredUnits = areaFilter
    ? units.filter((u) => u.area === areaFilter)
    : units;

  // 空室ありのみ
  const availableUnits = filteredUnits.filter((u) => u.availableCount > 0);

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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
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
            <Link href="/vacancies/inquiry">
              <Button className="w-full flex items-center justify-center gap-2">
                <MessageSquare className="w-5 h-5" />
                お問い合わせ
              </Button>
            </Link>
          </Card>
        </div>

        {/* エリアフィルタ */}
        {areas.length > 1 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-600">エリア:</span>
              <button
                onClick={() => setAreaFilter('')}
                className={`px-3 py-1 rounded-full text-sm ${
                  !areaFilter
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                すべて
              </button>
              {areas.map((area) => (
                <button
                  key={area}
                  onClick={() => setAreaFilter(area)}
                  className={`px-3 py-1 rounded-full text-sm ${
                    areaFilter === area
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {area}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 施設一覧 */}
        {availableUnits.length === 0 ? (
          <Card className="p-8 text-center bg-white">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">現在ご案内可能な空室がありません</p>
            <p className="text-sm text-gray-400 mt-2">
              お問い合わせいただければ、空き次第ご連絡いたします
            </p>
            <Link href="/vacancies/inquiry" className="mt-4 inline-block">
              <Button>お問い合わせ</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {availableUnits.map((unit) => (
              <Card key={unit.id} className="p-6 bg-white hover:shadow-lg transition-shadow">
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
                      {unit.conditionsJson.minCareLevel && unit.conditionsJson.maxCareLevel && (
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

                <Link href={`/vacancies/inquiry?unitId=${unit.id}`}>
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
            <Link href="/vacancies/inquiry" className="flex-1">
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
