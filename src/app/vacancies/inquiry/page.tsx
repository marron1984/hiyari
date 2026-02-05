'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, Button } from '@/components/ui';
import {
  Building2,
  Send,
  ArrowLeft,
  User,
  Phone,
  Mail,
  Calendar,
  Heart,
  MessageSquare,
  MapPin,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';

// ===== 型定義 =====

interface CareConditions {
  minCareLevel?: number | null;
  maxCareLevel?: number | null;
  acceptsDementia?: boolean;
  acceptsMedicalCare?: boolean;
  acceptsTerminalCare?: boolean;
}

interface PriceRange {
  monthlyMin?: number | null;
  monthlyMax?: number | null;
}

interface PublicVacancyUnit {
  id: string;
  businessUnitId: string;
  buildingName: string;
  area: string;
  roomType: string;
  availableCount: number;
  conditionsJson: CareConditions;
  priceRangeJson: PriceRange;
}

// ===== ユーティリティ =====

// Ticket 072: コンバージョン計測用セッションID
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

// Ticket 072: submit イベント記録
async function trackSubmit(
  businessUnitId?: string | null,
  vacancyUnitId?: string | null
): Promise<void> {
  try {
    const sessionId = getOrCreateSessionId();
    await fetch('/api/vacancy-analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'submit',
        businessUnitId: businessUnitId || null,
        vacancyUnitId: vacancyUnitId || null,
        sessionId,
      }),
    });
  } catch {
    // 失敗しても無視
  }
}

function formatPrice(min: number | null | undefined, max: number | null | undefined): string {
  if (min == null && max == null) return 'お問い合わせ';
  if (min != null && max != null) {
    if (min === max) return `${min}万円/月`;
    return `${min}〜${max}万円/月`;
  }
  if (min != null) return `${min}万円〜/月`;
  if (max != null) return `〜${max}万円/月`;
  return 'お問い合わせ';
}

// ===== フォームコンポーネント =====

function InquiryFormContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Ticket 072: 新しいURL設計に対応
  const businessUnitId = searchParams.get('businessUnitId');
  const vacancyUnitId = searchParams.get('vacancyUnitId') || searchParams.get('unitId'); // 後方互換

  const [unit, setUnit] = useState<PublicVacancyUnit | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // フォーム状態 - Ticket 072: 最小限に
  const [contactName, setContactName] = useState(''); // 任意
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [desiredMoveIn, setDesiredMoveIn] = useState('');
  const [conditions, setConditions] = useState(''); // 希望条件（選択）
  const [message, setMessage] = useState('');

  // 施設情報取得
  useEffect(() => {
    if (vacancyUnitId) {
      fetch('/api/public/vacancies')
        .then((res) => res.json())
        .then((data) => {
          const found = data.items?.find((u: PublicVacancyUnit) => u.id === vacancyUnitId);
          setUnit(found || null);
        })
        .catch(console.error);
    }
  }, [vacancyUnitId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/vacancies/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vacancyUnitId: vacancyUnitId || undefined,
          businessUnitId: unit?.businessUnitId || businessUnitId || undefined,
          contactName: contactName || undefined,
          contactPhone: contactPhone || undefined,
          contactEmail: contactEmail || undefined,
          desiredMoveIn: desiredMoveIn || undefined,
          conditions: conditions || undefined,
          message: message || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '送信に失敗しました');
      }

      // Ticket 072: submit イベント記録
      await trackSubmit(unit?.businessUnitId || businessUnitId, vacancyUnitId);

      // Ticket 072: 完了ページへリダイレクト
      router.push('/vacancies/thanks');
    } catch (err) {
      setError(err instanceof Error ? err.message : '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // 連絡先が入力されているか
  const hasContact = contactPhone.trim() || contactEmail.trim();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <Link
            href="/vacancies"
            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            空室一覧に戻る
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-7 h-7 text-blue-600" />
            お問い合わせ
          </h1>
          <p className="text-gray-600 mt-1">
            最短30秒で送信完了
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* 施設情報（選択済みの場合） - Ticket 072: 詳細表示 */}
        {unit && (
          <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <Building2 className="w-10 h-10 text-blue-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-lg">{unit.buildingName}</div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 mt-1">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {unit.area}
                  </span>
                  <span>{unit.roomType}</span>
                  <span className="text-blue-600 font-medium">
                    空室 {unit.availableCount}室
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm mt-1">
                  <DollarSign className="w-4 h-4 text-yellow-600" />
                  <span>{formatPrice(unit.priceRangeJson?.monthlyMin, unit.priceRangeJson?.monthlyMax)}</span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* フォーム - Ticket 072: 最小限に */}
        <Card className="p-6 bg-white">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* 連絡先（必須） */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                連絡先 <span className="text-red-500">*</span>
                <span className="text-xs text-gray-500 ml-2">
                  （電話またはメールどちらか必須）
                </span>
              </label>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="電話番号"
                    className="w-full border rounded-lg pl-10 pr-4 py-2.5"
                  />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="メールアドレス"
                    className="w-full border rounded-lg pl-10 pr-4 py-2.5"
                  />
                </div>
              </div>
            </div>

            {/* 希望入居時期 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                入居希望時期
              </label>
              <div className="flex flex-wrap gap-2">
                {['すぐに', '1ヶ月以内', '3ヶ月以内', '半年以内', '未定'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDesiredMoveIn(option)}
                    className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                      desiredMoveIn === option
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* 希望条件 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Heart className="w-4 h-4 inline mr-1" />
                ご希望・ご状況（複数選択可）
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  '認知症がある',
                  '医療ケアが必要',
                  '看取り対応希望',
                  '見学したい',
                  '資料がほしい',
                ].map((option) => {
                  const isSelected = conditions.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setConditions(conditions.replace(option, '').replace(/、+/g, '、').replace(/^、|、$/g, ''));
                        } else {
                          setConditions(conditions ? `${conditions}、${option}` : option);
                        }
                      }}
                      className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* メッセージ（任意） */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                ご質問・ご要望
                <span className="text-xs text-gray-500 ml-2">（任意）</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="気になることがあればお書きください"
                className="w-full border rounded-lg px-4 py-2 h-24 resize-none"
              />
            </div>

            {/* お名前（任意） */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                お名前
                <span className="text-xs text-gray-500 ml-2">（任意）</span>
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full border rounded-lg px-4 py-2.5"
              />
            </div>

            {/* 送信ボタン */}
            <Button
              type="submit"
              disabled={submitting || !hasContact}
              className="w-full flex items-center justify-center gap-2 py-3 text-base"
            >
              {submitting ? (
                '送信中...'
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  送信する
                </>
              )}
            </Button>

            {!hasContact && (
              <p className="text-center text-sm text-amber-600">
                電話番号またはメールアドレスを入力してください
              </p>
            )}
          </form>
        </Card>

        {/* 注意事項 */}
        <div className="mt-6 text-xs text-gray-500 text-center">
          <p>担当者より1〜2営業日以内にご連絡いたします</p>
        </div>
      </main>
    </div>
  );
}

// ===== Suspenseでラップしたメインコンポーネント =====

export default function InquiryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Building2 className="w-12 h-12 text-blue-500 animate-pulse" />
        </div>
      }
    >
      <InquiryFormContent />
    </Suspense>
  );
}
