'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, Badge } from '@/components/ui';
import {
  OS_CATEGORIES,
  OS_FEATURES,
  OS_FEATURE_STATUS_CONFIG,
  getFeaturesByCategory,
  getFeatureCountByStatus,
  calculateCompositeScore,
  getFeaturesSortedByPriority,
  type OSFeatureStatus,
  type OSFeature,
} from '@/config/osFeatures';
import {
  Map,
  Activity,
  FileText,
  Users,
  Bell,
  ClipboardCheck,
  ListTodo,
  GraduationCap,
  ShieldAlert,
  Heart,
  Wallet,
  ExternalLink,
  Bot,
  Info,
  ArrowUpDown,
  TrendingUp,
} from 'lucide-react';

// 並び替えモード
type SortMode = 'category' | 'priority';

// カテゴリアイコンマッピング
const CATEGORY_ICONS: Record<string, typeof Activity> = {
  Activity,
  FileText,
  Users,
  Bell,
  ClipboardCheck,
  ListTodo,
  GraduationCap,
  ShieldAlert,
  Heart,
  Wallet,
};

// カテゴリIDからアイコンを取得
function getCategoryIcon(iconName: string) {
  return CATEGORY_ICONS[iconName] || Activity;
}

export default function OSMapPage() {
  const [statusFilter, setStatusFilter] = useState<OSFeatureStatus | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('category');

  // 全体サマリー
  const totalCounts = getFeatureCountByStatus();
  const totalFeatures = OS_FEATURES.length;

  // フィルター適用
  const getFilteredFeatures = (categoryId: string) => {
    const features = getFeaturesByCategory(categoryId);
    if (statusFilter === 'all') return features;
    return features.filter((f) => f.status === statusFilter);
  };

  // 優先度順で並び替えた全機能リスト
  const allFeaturesSortedByPriority = useMemo(() => {
    let features = statusFilter === 'all'
      ? OS_FEATURES
      : OS_FEATURES.filter((f) => f.status === statusFilter);
    return getFeaturesSortedByPriority(features);
  }, [statusFilter]);

  return (
    <AuthGuard>
      <main className="pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
                <Map className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-zinc-900">OSマップ</h1>
                <p className="text-sm text-zinc-500">DHPハブ 全機能一覧（{totalFeatures}機能）</p>
              </div>
            </div>
          </div>

          {/* 説明カード */}
          <Card className="mb-6 bg-indigo-50 border-indigo-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-indigo-800">
                  <p className="font-medium mb-1">全体像を一望する</p>
                  <p className="text-indigo-700">
                    「完成したら表示」ではなく「存在したら表示」。
                    運用中・開発中・未着手を含め、DHPハブの全機能がここに集約されています。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ステータス凡例 & フィルター */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-zinc-600">
                  <span className="font-medium">ステータス凡例:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['all', 'active', 'developing', 'planned', 'hidden'] as const).map((status) => {
                    const isAll = status === 'all';
                    const config = isAll ? null : OS_FEATURE_STATUS_CONFIG[status];
                    const count = isAll ? totalFeatures : totalCounts[status];
                    const isSelected = statusFilter === status;

                    return (
                      <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          isSelected
                            ? isAll
                              ? 'bg-zinc-800 text-white'
                              : `${config?.bgColor} ${config?.color} ring-2 ring-offset-1 ${config?.borderColor}`
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        }`}
                      >
                        {isAll ? (
                          <>全て</>
                        ) : (
                          <>
                            <span>{config?.emoji}</span>
                            {config?.label}
                          </>
                        )}
                        <Badge className="bg-white/80 text-zinc-700 text-xs ml-1">
                          {count}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 並び替えトグル */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-600">並び替え:</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSortMode('category')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  sortMode === 'category'
                    ? 'bg-zinc-800 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                カテゴリ別
              </button>
              <button
                onClick={() => setSortMode('priority')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  sortMode === 'priority'
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                経営優先度順
              </button>
            </div>
          </div>

          {/* 機能リスト（カテゴリ別 or 優先度順） */}
          {sortMode === 'category' ? (
            // カテゴリ別表示
            <div className="space-y-8">
              {OS_CATEGORIES.map((category) => {
                const CategoryIcon = getCategoryIcon(category.icon);
                const features = getFilteredFeatures(category.id);

                // フィルター時に該当機能がない場合はカテゴリを非表示
                if (features.length === 0) return null;

                return (
                  <section key={category.id}>
                    {/* カテゴリヘッダー */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-zinc-100 rounded-lg">
                        <CategoryIcon className="w-5 h-5 text-zinc-600" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-zinc-800">{category.name}</h2>
                        <p className="text-sm text-zinc-500">{category.description}</p>
                      </div>
                      <Badge className="ml-auto bg-zinc-100 text-zinc-600">
                        {features.length}機能
                      </Badge>
                    </div>

                    {/* 機能カードグリッド */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {features.map((feature) => (
                        <FeatureCard key={feature.id} feature={feature} showScore={false} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            // 優先度順表示
            <div>
              <div className="mb-4 p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg border border-orange-200">
                <div className="flex items-center gap-2 text-orange-800 text-sm">
                  <TrendingUp className="w-4 h-4" />
                  <span className="font-medium">経営優先度スコア</span>
                  <span className="text-orange-600">= 経営優先度 + 投資対効果 + 放置リスク（各1-5、最大15）</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allFeaturesSortedByPriority.map((feature, index) => (
                  <FeatureCard key={feature.id} feature={feature} showScore={true} rank={index + 1} />
                ))}
              </div>
            </div>
          )}

          {/* フッター */}
          <div className="mt-12 text-center text-sm text-zinc-400">
            <p>DHP.OS.HUB — 全体を見渡し、一つずつ前へ。</p>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}

/**
 * スコアバー表示コンポーネント
 */
function ScoreBar({ value, max = 5, label }: { value: number; max?: number; label: string }) {
  const percentage = (value / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-500 w-16">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-medium text-zinc-600 w-4 text-right">{value}</span>
    </div>
  );
}

/**
 * 機能カードコンポーネント
 */
function FeatureCard({
  feature,
  showScore = false,
  rank,
}: {
  feature: OSFeature;
  showScore?: boolean;
  rank?: number;
}) {
  const config = OS_FEATURE_STATUS_CONFIG[feature.status];
  const isClickable = feature.status === 'active' || feature.status === 'developing';
  const compositeScore = calculateCompositeScore(feature);

  const cardContent = (
    <Card className={`h-full transition-all ${isClickable ? 'hover:shadow-md hover:border-zinc-300 cursor-pointer' : 'opacity-80'} ${rank && rank <= 3 ? 'ring-2 ring-orange-300' : ''}`}>
      <CardContent className="p-4">
        {/* ランキングバッジ（優先度順時のみ） */}
        {rank && (
          <div className="flex items-center justify-between mb-2">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
              rank === 1 ? 'bg-yellow-100 text-yellow-700' :
              rank === 2 ? 'bg-zinc-200 text-zinc-600' :
              rank === 3 ? 'bg-orange-100 text-orange-700' :
              'bg-zinc-100 text-zinc-500'
            }`}>
              #{rank}
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-orange-100 to-red-100 rounded text-xs font-bold text-orange-700">
              <TrendingUp className="w-3 h-3" />
              {compositeScore}/15
            </div>
          </div>
        )}

        {/* ステータスバッジ */}
        <div className="flex items-center justify-between mb-3">
          <Badge className={`${config.bgColor} ${config.color} text-xs`}>
            <span className="mr-1">{config.emoji}</span>
            {config.label}
          </Badge>
          {feature.owner === 'AI' && (
            <Badge className="bg-purple-100 text-purple-700 text-xs flex items-center gap-1">
              <Bot className="w-3 h-3" />
              AI
            </Badge>
          )}
        </div>

        {/* 機能名 */}
        <h3 className="font-bold text-zinc-800 mb-2">{feature.name}</h3>

        {/* 説明 */}
        <p className="text-sm text-zinc-500 mb-3 line-clamp-2">{feature.description}</p>

        {/* スコア表示（showScore=true時） */}
        {showScore && (feature.priority || feature.roi || feature.risk) && (
          <div className="space-y-1.5 mb-3 p-2 bg-zinc-50 rounded-lg">
            <ScoreBar value={feature.priority ?? 0} label="優先度" />
            <ScoreBar value={feature.roi ?? 0} label="ROI" />
            <ScoreBar value={feature.risk ?? 0} label="リスク" />
          </div>
        )}

        {/* 開くボタン */}
        <div className="flex items-center justify-end">
          <span className={`text-sm font-medium flex items-center gap-1 ${isClickable ? 'text-blue-600' : 'text-zinc-400'}`}>
            開く
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );

  // 全てのパスにリンク（active/developing以外はプレースホルダページへ遷移）
  return (
    <Link href={feature.path} className="block">
      {cardContent}
    </Link>
  );
}
