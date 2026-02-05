'use client';

import { useState, useEffect } from 'react';
import { Card, Button } from '@/components/ui';
import { CheckCircle, ArrowLeft, Phone, Mail, Copy, Check } from 'lucide-react';
import Link from 'next/link';

/**
 * お問い合わせ完了ページ
 *
 * Ticket 072: /vacancies CTA最適化
 * Ticket 078: 空室問い合わせ 自動返信（テンプレ）
 */

interface AutoReplyData {
  title: string;
  body: string;
  receiptNumber: string;
  expectedResponseTime: string;
  additionalInfo: string[];
  contactMethod: 'email' | 'phone' | 'both';
  name: string;
  buildingName?: string;
}

export default function ThanksPage() {
  const [autoReply, setAutoReply] = useState<AutoReplyData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // sessionStorageから自動返信データを取得
    try {
      const stored = sessionStorage.getItem('vacancyAutoReply');
      if (stored) {
        setAutoReply(JSON.parse(stored));
        // 読み取り後にクリア（リロード時にデフォルト表示にするため）
        sessionStorage.removeItem('vacancyAutoReply');
      }
    } catch {
      // sessionStorage unavailable or parse error
    }
  }, []);

  const handleCopyReceipt = async () => {
    if (!autoReply?.receiptNumber) return;
    try {
      await navigator.clipboard.writeText(autoReply.receiptNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  // パーソナライズされた表示
  if (autoReply) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {autoReply.title}
            </h1>
            <p className="text-gray-600">
              {autoReply.name}様、お問い合わせありがとうございます。
              {autoReply.buildingName && (
                <>
                  <br />
                  <span className="text-sm text-gray-500">
                    （{autoReply.buildingName}へのお問い合わせ）
                  </span>
                </>
              )}
            </p>
          </div>

          {/* 受付番号 */}
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 mb-2">受付番号</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-mono font-bold text-blue-700">
                {autoReply.receiptNumber}
              </span>
              <button
                onClick={handleCopyReceipt}
                className="p-1.5 rounded-md hover:bg-blue-100 transition-colors"
                title="コピー"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : (
                  <Copy className="w-5 h-5 text-blue-600" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              お問い合わせ時はこの番号をお伝えください
            </p>
          </div>

          {/* 連絡予定 */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-600">
            <p className="font-medium text-gray-700 mb-3">
              担当者より{autoReply.expectedResponseTime}にご連絡いたします
            </p>
            <ul className="space-y-2 text-left">
              {autoReply.contactMethod === 'phone' && (
                <li className="flex items-start gap-2">
                  <Phone className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                  <span>
                    お電話でのご連絡は
                    <span className="font-medium">平日 9:00〜18:00</span>
                    となります
                  </span>
                </li>
              )}
              {autoReply.contactMethod === 'email' && (
                <li className="flex items-start gap-2">
                  <Mail className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                  <span>
                    ご登録のメールアドレスへご連絡いたします
                  </span>
                </li>
              )}
              {autoReply.contactMethod === 'both' && (
                <>
                  <li className="flex items-start gap-2">
                    <Mail className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                    <span>
                      メールまたはお電話でご連絡いたします
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Phone className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                    <span>
                      お電話は
                      <span className="font-medium">平日 9:00〜18:00</span>
                      となります
                    </span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* 追加情報 */}
          {autoReply.additionalInfo.length > 0 && (
            <div className="text-xs text-gray-500 mb-6 space-y-1">
              {autoReply.additionalInfo.map((info, i) => (
                <p key={i}>※ {info}</p>
              ))}
            </div>
          )}

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

  // デフォルト表示（sessionStorageなしの場合）
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
