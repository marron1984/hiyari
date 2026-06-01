'use client';

import Link from 'next/link';
import { Card, CardContent, Button } from '@/components/ui';
import { Construction, ArrowLeft, MessageSquare, ExternalLink } from 'lucide-react';

interface PlannedFeaturePlaceholderProps {
  title: string;
  description: string;
  category?: string;
}

const NOTEBOOKLM_URL = 'https://notebooklm.google.com/notebook/6ca2fe2f-2716-4add-8ea2-3faeb5c6750e';

/**
 * 未実装機能のプレースホルダ
 * 「存在したら表示」の思想に基づき、未着手ページも必ず表示する
 */
export function PlannedFeaturePlaceholder({
  title,
  description,
  category,
}: PlannedFeaturePlaceholderProps) {
  const handleOpenNotebookLM = () => {
    window.open(NOTEBOOKLM_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="pb-8">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card className="text-center">
          <CardContent className="p-8">
            {/* アイコン */}
            <div className="w-16 h-16 mx-auto mb-6 bg-amber-100 rounded-full flex items-center justify-center">
              <Construction className="w-8 h-8 text-amber-600" />
            </div>

            {/* タイトル */}
            <h1 className="text-2xl font-bold text-zinc-800 mb-2">{title}</h1>
            {category && (
              <p className="text-sm text-zinc-500 mb-4">{category}</p>
            )}

            {/* 説明 */}
            <p className="text-zinc-600 mb-6">{description}</p>

            {/* ステータスバッジ */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-full text-sm font-medium mb-8">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              未着手（構想・設計段階）
            </div>

            {/* メッセージ */}
            <div className="bg-zinc-50 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-zinc-600">
                この機能は現在開発予定です。ご要望やアイデアがあれば、AI副社長への質問箱からお知らせください。
              </p>
            </div>

            {/* アクション */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/dashboard/os-map">
                <Button variant="outline" className="w-full sm:w-auto">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  OSマップに戻る
                </Button>
              </Link>
              <button
                onClick={handleOpenNotebookLM}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                AI副社長に相談する
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* フッター */}
        <p className="text-center text-sm text-zinc-400 mt-6">
          DHP.OS.HUB — 全体を見渡し、一つずつ前へ。
        </p>
      </div>
    </main>
  );
}
