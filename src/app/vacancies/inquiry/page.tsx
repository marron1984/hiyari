'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, Button } from '@/components/ui';
import {
  Building2,
  Send,
  CheckCircle,
  ArrowLeft,
  User,
  Phone,
  Mail,
  Calendar,
  Heart,
  MessageSquare,
} from 'lucide-react';
import Link from 'next/link';

// ===== 型定義 =====

interface PublicVacancyUnit {
  id: string;
  buildingName: string;
  area: string;
  roomType: string;
  availableCount: number;
}

// ===== フォームコンポーネント =====

function InquiryFormContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const unitId = searchParams.get('unitId');

  const [unit, setUnit] = useState<PublicVacancyUnit | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // フォーム状態
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [desiredMoveIn, setDesiredMoveIn] = useState('');
  const [careLevel, setCareLevel] = useState<string>('');
  const [hasSpecialNeeds, setHasSpecialNeeds] = useState(false);
  const [specialNeedsDetail, setSpecialNeedsDetail] = useState('');
  const [message, setMessage] = useState('');

  // 施設情報取得
  useEffect(() => {
    if (unitId) {
      fetch('/api/public/vacancies')
        .then((res) => res.json())
        .then((data) => {
          const found = data.items?.find((u: PublicVacancyUnit) => u.id === unitId);
          setUnit(found || null);
        })
        .catch(console.error);
    }
  }, [unitId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/vacancies/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vacancyUnitId: unitId || undefined,
          contactName,
          contactPhone: contactPhone || undefined,
          contactEmail: contactEmail || undefined,
          desiredMoveIn: desiredMoveIn || undefined,
          careLevel: careLevel ? parseInt(careLevel, 10) : undefined,
          hasSpecialNeeds,
          specialNeedsDetail: hasSpecialNeeds ? specialNeedsDetail : undefined,
          message: message || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '送信に失敗しました');
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // 送信完了画面
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h1 className="text-2xl font-bold mb-2">お問い合わせを受け付けました</h1>
          <p className="text-gray-600 mb-6">
            担当者より折り返しご連絡いたします。
            しばらくお待ちください。
          </p>
          <Link href="/vacancies">
            <Button variant="secondary" className="flex items-center gap-2 mx-auto">
              <ArrowLeft className="w-4 h-4" />
              空室一覧に戻る
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

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
            空室・入居についてのお問い合わせフォーム
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* 施設情報（選択済みの場合） */}
        {unit && (
          <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-blue-600" />
              <div>
                <div className="font-bold">{unit.buildingName}</div>
                <div className="text-sm text-gray-600">
                  {unit.area} / {unit.roomType} / 空室 {unit.availableCount}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* フォーム */}
        <Card className="p-6 bg-white">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}

            {/* お名前 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <User className="w-4 h-4 inline mr-1" />
                お名前 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full border rounded-lg px-4 py-2"
                required
              />
            </div>

            {/* 連絡先 */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Phone className="w-4 h-4 inline mr-1" />
                  電話番号
                </label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="090-1234-5678"
                  className="w-full border rounded-lg px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Mail className="w-4 h-4 inline mr-1" />
                  メールアドレス
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full border rounded-lg px-4 py-2"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 -mt-2">
              ※ 電話番号またはメールアドレスのいずれかは必須です
            </p>

            {/* 入居希望時期 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                入居希望時期
              </label>
              <select
                value={desiredMoveIn}
                onChange={(e) => setDesiredMoveIn(e.target.value)}
                className="w-full border rounded-lg px-4 py-2"
              >
                <option value="">選択してください</option>
                <option value="すぐに">すぐに入居したい</option>
                <option value="1ヶ月以内">1ヶ月以内</option>
                <option value="3ヶ月以内">3ヶ月以内</option>
                <option value="半年以内">半年以内</option>
                <option value="未定">まだ決まっていない</option>
              </select>
            </div>

            {/* 介護度 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Heart className="w-4 h-4 inline mr-1" />
                現在の介護度
              </label>
              <select
                value={careLevel}
                onChange={(e) => setCareLevel(e.target.value)}
                className="w-full border rounded-lg px-4 py-2"
              >
                <option value="">選択してください</option>
                <option value="0">自立・要支援</option>
                <option value="1">要介護1</option>
                <option value="2">要介護2</option>
                <option value="3">要介護3</option>
                <option value="4">要介護4</option>
                <option value="5">要介護5</option>
              </select>
            </div>

            {/* 特別な対応 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={hasSpecialNeeds}
                  onChange={(e) => setHasSpecialNeeds(e.target.checked)}
                  className="rounded border-gray-300"
                />
                特別な対応が必要（医療ケア・認知症など）
              </label>
              {hasSpecialNeeds && (
                <textarea
                  value={specialNeedsDetail}
                  onChange={(e) => setSpecialNeedsDetail(e.target.value)}
                  placeholder="必要な対応の詳細をお書きください（例：胃ろう、インスリン注射など）"
                  className="w-full border rounded-lg px-4 py-2 mt-2 h-24 resize-none"
                />
              )}
            </div>

            {/* メッセージ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                ご質問・ご要望
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="その他ご質問やご要望がありましたらお書きください"
                className="w-full border rounded-lg px-4 py-2 h-32 resize-none"
              />
            </div>

            {/* 送信ボタン */}
            <Button
              type="submit"
              disabled={submitting || !contactName || (!contactPhone && !contactEmail)}
              className="w-full flex items-center justify-center gap-2 py-3"
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
          </form>
        </Card>

        {/* 注意事項 */}
        <div className="mt-6 text-sm text-gray-500 space-y-2">
          <p>
            ※ お問い合わせいただいた内容は、担当者が確認の上、
            電話またはメールにてご連絡いたします。
          </p>
          <p>
            ※ 通常、1〜2営業日以内にご連絡いたします。
            お急ぎの場合はお電話でお問い合わせください。
          </p>
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
