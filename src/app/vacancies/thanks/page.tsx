'use client';

import { Card, Button } from '@/components/ui';
import { CheckCircle, ArrowLeft, Phone, Mail } from 'lucide-react';
import Link from 'next/link';

/**
 * お問い合わせ完了ページ
 *
 * Ticket 072: /vacancies CTA最適化
 */
export default function ThanksPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="mb-6">
          <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            お問い合わせを受け付けました
          </h1>
          <p className="text-gray-600">
            ありがとうございます。
            <br />
            担当者より折り返しご連絡いたします。
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-2">ご連絡について</p>
          <ul className="space-y-2 text-left">
            <li className="flex items-start gap-2">
              <Phone className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
              <span>
                お電話でのご連絡は
                <span className="font-medium">平日 9:00〜18:00</span>
                の間となります
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Mail className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
              <span>
                通常
                <span className="font-medium">1〜2営業日</span>
                以内にご返答いたします
              </span>
            </li>
          </ul>
        </div>

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
