'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import {
  OS_CATEGORIES,
  OS_FEATURES,
  OS_FEATURE_STATUS_CONFIG,
  getFeaturesByCategory,
  getFeatureCountByStatus,
  getCategorySummary,
  type OSFeatureStatus,
  type OSFeature,
} from '@/types/os-features';
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
  Filter,
  Bot,
  ChevronRight,
  Info,
} from 'lucide-react';

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
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<OSFeatureStatus | 'all'>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(OS_CATEGORIES.map((c) => c.id))
  );

  // 全体サマリー
  const totalCounts = getFeatureCountByStatus();
  const totalFeatures = OS_FEATURES.length;

  // フィルター適用
  const filteredFeatures = statusFilter === 'all'
    ? OS_FEATURES
    : OS_FEATURES.filter((f) => f.status === statusFilter);

  // カテゴリ展開/折りたたみ
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  // 全展開/全折りたたみ
  const expandAll = () => setExpandedCategories(new Set(OS_CATEGORIES.map((c) => c.id)));
  const collapseAll = () => setExpandedCategories(new Set());

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
                <h1 className="text-2xl font-bold text-zinc-900">OSマップ（司令塔）</h1>
                <p className="text-sm text-zinc-500">AA-HUB 全機能可視化</p>
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
                    運用中・開発中・未着手を含め、AA-HUBの全機能がここに集約されています。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 全体サマリー */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Card className="p-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-zinc-800">{totalFeatures}</p>
                <p className="text-xs text-zinc-500">全機能</p>
              </div>
            </Card>
            {(['active', 'developing', 'planned', 'hidden'] as const).map((status) => {
              const config = OS_FEATURE_STATUS_CONFIG[status];
              return (
                <Card
                  key={status}
                  className={`p-3 cursor-pointer transition-all ${
                    statusFilter === status ? `ring-2 ring-offset-1 ${config.borderColor}` : ''
                  } ${config.bgColor}`}
                  onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
                >
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${config.color}`}>
                      {config.emoji} {totalCounts[status]}
                    </p>
                    <p className="text-xs text-zinc-600">{config.label}</p>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* フィルターバー */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-600">
                {statusFilter === 'all'
                  ? `全${filteredFeatures.length}件を表示`
                  : `${OS_FEATURE_STATUS_CONFIG[statusFilter].label}：${filteredFeatures.length}件`}
              </span>
              {statusFilter !== 'all' && (
                <button
                  onClick={() => setStatusFilter('all')}
                  className="text-sm text-indigo-600 hover:underline"
                >
                  クリア
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={expandAll}
                className="text-xs text-zinc-500 hover:text-zinc-700"
              >
                すべて開く
              </button>
              <span className="text-zinc-300">|</span>
              <button
                onClick={collapseAll}
                className="text-xs text-zinc-500 hover:text-zinc-700"
              >
                すべて閉じる
              </button>
            </div>
          </div>

          {/* カテゴリ別機能リスト */}
          <div className="space-y-4">
            {OS_CATEGORIES.map((category) => {
              const CategoryIcon = getCategoryIcon(category.icon);
              const features = getFeaturesByCategory(category.id);
              const filteredCategoryFeatures = statusFilter === 'all'
                ? features
                : features.filter((f) => f.status === statusFilter);
              const summary = getCategorySummary(category.id);
              const isExpanded = expandedCategories.has(category.id);

              // フィルター時に該当機能がない場合はカテゴリを非表示
              if (statusFilter !== 'all' && filteredCategoryFeatures.length === 0) {
                return null;
              }

              return (
                <Card key={category.id} className="overflow-hidden">
                  {/* カテゴリヘッダー */}
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="w-full p-4 flex items-center justify-between bg-zinc-50 hover:bg-zinc-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg border border-zinc-200">
                        <CategoryIcon className="w-5 h-5 text-zinc-600" />
                      </div>
                      <div className="text-left">
                        <h2 className="font-semibold text-zinc-800">{category.name}</h2>
                        <p className="text-xs text-zinc-500">{category.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* ミニサマリー */}
                      <div className="flex gap-1">
                        {summary.active > 0 && (
                          <Badge className="bg-green-100 text-green-700 text-xs">
                            {summary.active}
                          </Badge>
                        )}
                        {summary.developing > 0 && (
                          <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                            {summary.developing}
                          </Badge>
                        )}
                        {summary.planned > 0 && (
                          <Badge className="bg-red-100 text-red-700 text-xs">
                            {summary.planned}
                          </Badge>
                        )}
                      </div>
                      <ChevronRight
                        className={`w-5 h-5 text-zinc-400 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {/* 機能リスト */}
                  {isExpanded && (
                    <CardContent className="p-0">
                      <div className="divide-y divide-zinc-100">
                        {filteredCategoryFeatures.map((feature) => (
                          <FeatureRow key={feature.id} feature={feature} />
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          {/* フッター */}
          <div className="mt-8 text-center text-sm text-zinc-400">
            <p>AA.OS.HUB — 全体を見渡し、一つずつ前へ。</p>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}

// 機能行コンポーネント
function FeatureRow({ feature }: { feature: OSFeature }) {
  const config = OS_FEATURE_STATUS_CONFIG[feature.status];
  const isClickable = feature.status === 'active' || feature.status === 'developing';

  const content = (
    <div
      className={`px-4 py-3 flex items-center justify-between ${
        isClickable ? 'hover:bg-zinc-50 cursor-pointer' : 'opacity-75'
      } transition-colors`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* ステータスインジケーター */}
        <span className="text-lg flex-shrink-0">{config.emoji}</span>

        {/* 機能情報 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-800">{feature.name}</span>
            {feature.assignee === 'AI' && (
              <Badge className="bg-purple-100 text-purple-700 text-xs flex items-center gap-1">
                <Bot className="w-3 h-3" />
                AI
              </Badge>
            )}
          </div>
          <p className="text-sm text-zinc-500 truncate">{feature.description}</p>
        </div>
      </div>

      {/* ステータスバッジとリンク */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <Badge className={`${config.bgColor} ${config.color} text-xs`}>
          {config.label}
        </Badge>
        {isClickable && (
          <ExternalLink className="w-4 h-4 text-zinc-400" />
        )}
      </div>
    </div>
  );

  if (isClickable) {
    return (
      <Link href={feature.path} className="block">
        {content}
      </Link>
    );
  }

  // 未実装の場合はプレースホルダ表示（リンクなし）
  return content;
}
