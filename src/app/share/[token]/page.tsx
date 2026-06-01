'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import type { ExternalSnapshot } from '@/lib/shares/types';
import {
  type ExternalTemplateId,
  type ExternalSectionId,
  getExternalShareTemplate,
} from '@/config/externalShareTemplates';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Clock,
  FileText,
  Target,
  Activity,
  Lock,
  ClipboardCheck,
  Bell,
  MessageSquare,
} from 'lucide-react';

export default function ExternalSharePage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ExternalSnapshot | null>(null);
  const [shareName, setShareName] = useState<string>('');

  useEffect(() => {
    const fetchShare = async () => {
      try {
        const response = await fetch(`/api/shares/access?token=${token}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          setError(data.error || 'このリンクは無効または期限切れです');
          return;
        }

        setSnapshot(data.share.snapshot);
        setShareName(data.share.name);
      } catch {
        setError('データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchShare();
    }
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-zinc-600">データを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Card className="max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <Lock className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-zinc-800 mb-2">
              アクセスできません
            </h1>
            <p className="text-zinc-600">
              {error || 'このリンクは無効または期限切れです'}
            </p>
            <p className="text-sm text-zinc-500 mt-4">
              共有リンクの発行元にお問い合わせください
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const template = getExternalShareTemplate(snapshot.templateId);
  const { executiveSummary, kpiHighlights, governance, roadmap, wbrProof, alertsSummary, notes } = snapshot;

  // テンプレートのアイコンと色
  const getTemplateStyle = (templateId: ExternalTemplateId) => {
    switch (templateId) {
      case 'bank':
        return {
          icon: <Building2 className="w-6 h-6 text-white" />,
          gradient: 'from-blue-600 to-indigo-700',
          title: '経営レポート（銀行向け）',
        };
      case 'investor':
        return {
          icon: <TrendingUp className="w-6 h-6 text-white" />,
          gradient: 'from-emerald-600 to-teal-700',
          title: '経営レポート（投資家向け）',
        };
      case 'audit':
        return {
          icon: <ClipboardCheck className="w-6 h-6 text-white" />,
          gradient: 'from-purple-600 to-violet-700',
          title: '経営レポート（監査向け）',
        };
    }
  };

  const templateStyle = getTemplateStyle(snapshot.templateId);

  // セクションをテンプレートの順序でレンダリング
  const renderSection = (sectionId: ExternalSectionId) => {
    const config = template.sectionConfig[sectionId];

    switch (sectionId) {
      case 'overview':
        return (
          <Card key={sectionId} className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                {config?.title ?? 'Executive Summary'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 mb-6">
                <p className="text-zinc-700 leading-relaxed">
                  {executiveSummary.overview}
                </p>
              </div>

              <div className="mb-6">
                <h4 className="text-sm font-semibold text-zinc-600 mb-3">
                  経営管理基盤 進捗状況
                </h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-3xl font-bold text-green-600">
                      {executiveSummary.progress.activeCount}
                    </p>
                    <p className="text-xs text-green-700">運用中</p>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded-lg text-center">
                    <p className="text-3xl font-bold text-yellow-600">
                      {executiveSummary.progress.developingCount}
                    </p>
                    <p className="text-xs text-yellow-700">開発中</p>
                  </div>
                  <div className="p-4 bg-zinc-50 rounded-lg text-center">
                    <p className="text-3xl font-bold text-zinc-600">
                      {executiveSummary.progress.plannedCount}
                    </p>
                    <p className="text-xs text-zinc-500">計画中</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg text-center">
                    <p className="text-3xl font-bold text-blue-600">
                      {executiveSummary.progress.progressPercent}%
                    </p>
                    <p className="text-xs text-blue-700">進捗率</p>
                  </div>
                </div>
              </div>

              {executiveSummary.riskSummary.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-zinc-600 mb-3">
                    リスク管理状況
                  </h4>
                  <div className="space-y-2">
                    {executiveSummary.riskSummary.map((risk, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          risk.level === 'high'
                            ? 'bg-red-50 border border-red-100'
                            : risk.level === 'medium'
                              ? 'bg-amber-50 border border-amber-100'
                              : 'bg-green-50 border border-green-100'
                        }`}
                      >
                        <span className="font-medium">{risk.category}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-zinc-600">{risk.description}</span>
                          <Badge
                            className={`text-xs ${
                              risk.level === 'high'
                                ? 'bg-red-100 text-red-700'
                                : risk.level === 'medium'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {risk.level === 'high' ? '対応中' : risk.level === 'medium' ? '監視中' : '安定'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );

      case 'topPriorities':
        return (
          <Card key={sectionId} className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5 text-orange-600" />
                {config?.title ?? '今月の重点施策'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {executiveSummary.topPriorities.map((item) => (
                  <div
                    key={item.rank}
                    className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg"
                  >
                    <div
                      className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${
                        item.rank === 1
                          ? 'bg-yellow-400 text-yellow-900'
                          : item.rank === 2
                            ? 'bg-zinc-300 text-zinc-700'
                            : 'bg-orange-300 text-orange-800'
                      }`}
                    >
                      {item.rank}
                    </div>
                    <div>
                      <span className="font-medium">{item.name}</span>
                      <span className="text-sm text-zinc-500 ml-2">— {item.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );

      case 'kpiHighlights':
        return (
          <Card key={sectionId} className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-600" />
                  {config?.title ?? 'KPIハイライト'}
                </CardTitle>
                <Badge className="bg-zinc-100 text-zinc-600 text-xs">
                  {kpiHighlights.period}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {kpiHighlights.kpis.map((kpi, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-lg border ${
                      kpi.status === 'critical'
                        ? 'bg-red-50 border-red-200'
                        : kpi.status === 'warning'
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-white border-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-zinc-600">{kpi.name}</span>
                      {kpi.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-500" />}
                      {kpi.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
                      {kpi.trend === 'stable' && <Minus className="w-4 h-4 text-zinc-400" />}
                    </div>
                    <p className="text-2xl font-bold text-zinc-800">{kpi.currentValue}</p>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-zinc-50 rounded-lg">
                <h4 className="text-sm font-semibold text-zinc-600 mb-3">
                  異常検知・アラート対応状況
                </h4>
                <div className="flex gap-6">
                  <div>
                    <span className="text-sm text-zinc-500">検知件数</span>
                    <p className="text-xl font-bold text-zinc-800">
                      {kpiHighlights.anomalyStats.totalDetected}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-zinc-500">対応済み</span>
                    <p className="text-xl font-bold text-green-600">
                      {kpiHighlights.anomalyStats.resolvedCount}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-zinc-500">対応中</span>
                    <p className="text-xl font-bold text-amber-600">
                      {kpiHighlights.anomalyStats.openCount}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 'governance':
        return (
          <Card key={sectionId} className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-600" />
                {config?.title ?? 'ガバナンス＆運用証跡'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-zinc-600 mb-3">
                  週次経営レビュー（WBR）実施記録
                </h4>
                <div className="space-y-2">
                  {governance.wbrRecords.slice(0, config?.maxItems ?? 4).map((wbr, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <div>
                          <span className="font-medium">{wbr.weekLabel}</span>
                          {wbr.summary && (
                            <p className="text-sm text-zinc-600 mt-1">{wbr.summary}</p>
                          )}
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-700 text-xs">実施済み</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-zinc-50 rounded-lg">
                <h4 className="text-sm font-semibold text-zinc-600 mb-3">
                  アラート運用状況
                </h4>
                <div className="flex gap-6">
                  <div>
                    <span className="text-sm text-zinc-500">対応中</span>
                    <p className="text-xl font-bold text-amber-600">{governance.alertStats.open}</p>
                  </div>
                  <div>
                    <span className="text-sm text-zinc-500">確認済み</span>
                    <p className="text-xl font-bold text-blue-600">{governance.alertStats.acknowledged}</p>
                  </div>
                  <div>
                    <span className="text-sm text-zinc-500">解決済み</span>
                    <p className="text-xl font-bold text-green-600">{governance.alertStats.resolved}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 'roadmap':
        return (
          <Card key={sectionId} className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5 text-orange-600" />
                {config?.title ?? 'ロードマップ'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    今月
                  </h4>
                  <div className="space-y-2">
                    {roadmap.thisMonth.slice(0, config?.maxItems ?? 5).map((item, i) => (
                      <div key={i} className="p-2 bg-red-50 rounded border border-red-100 text-sm">
                        {item.name}
                      </div>
                    ))}
                    {roadmap.thisMonth.length === 0 && (
                      <p className="text-sm text-zinc-500">予定なし</p>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-orange-700 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    来月
                  </h4>
                  <div className="space-y-2">
                    {roadmap.nextMonth.slice(0, config?.maxItems ?? 5).map((item, i) => (
                      <div key={i} className="p-2 bg-orange-50 rounded border border-orange-100 text-sm">
                        {item.name}
                      </div>
                    ))}
                    {roadmap.nextMonth.length === 0 && (
                      <p className="text-sm text-zinc-500">予定なし</p>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    今四半期
                  </h4>
                  <div className="space-y-2">
                    {roadmap.thisQuarter.slice(0, config?.maxItems ?? 5).map((item, i) => (
                      <div key={i} className="p-2 bg-blue-50 rounded border border-blue-100 text-sm">
                        {item.name}
                      </div>
                    ))}
                    {roadmap.thisQuarter.length === 0 && (
                      <p className="text-sm text-zinc-500">予定なし</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 'wbrProof':
        if (!wbrProof) return null;
        return (
          <Card key={sectionId} className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-violet-600" />
                {config?.title ?? '週次レビュー実施証跡'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-4 bg-violet-50 rounded-lg border border-violet-100">
                <div className="flex gap-8">
                  <div>
                    <span className="text-sm text-violet-600">実施回数</span>
                    <p className="text-2xl font-bold text-violet-700">{wbrProof.totalExecuted}回</p>
                  </div>
                  <div>
                    <span className="text-sm text-violet-600">実施率</span>
                    <p className="text-2xl font-bold text-violet-700">{wbrProof.executionRate}%</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200">
                      <th className="text-left p-2 font-medium text-zinc-600">週</th>
                      <th className="text-center p-2 font-medium text-zinc-600">参加者</th>
                      <th className="text-center p-2 font-medium text-zinc-600">決定事項</th>
                      <th className="text-center p-2 font-medium text-zinc-600">課題</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wbrProof.records.slice(0, config?.maxItems ?? 8).map((record, i) => (
                      <tr key={i} className="border-b border-zinc-100">
                        <td className="p-2">{record.weekLabel}</td>
                        <td className="text-center p-2">{record.attendeeCount ?? '-'}名</td>
                        <td className="text-center p-2">{record.decisionsCount}件</td>
                        <td className="text-center p-2">{record.issuesCount}件</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );

      case 'alertsSummary':
        if (!alertsSummary) return null;
        return (
          <Card key={sectionId} className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-600" />
                {config?.title ?? 'アラート対応状況'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-zinc-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-zinc-700">{alertsSummary.totalRaised}</p>
                  <p className="text-xs text-zinc-500">発生件数</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">{alertsSummary.resolved}</p>
                  <p className="text-xs text-green-700">解決済み</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-amber-600">{alertsSummary.pending}</p>
                  <p className="text-xs text-amber-700">対応中</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-600">{alertsSummary.avgResolutionDays}日</p>
                  <p className="text-xs text-blue-700">平均対応日数</p>
                </div>
              </div>

              {alertsSummary.categories.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-zinc-600 mb-3">カテゴリ別内訳</h4>
                  <div className="flex flex-wrap gap-2">
                    {alertsSummary.categories.map((cat, i) => (
                      <Badge key={i} className="bg-zinc-100 text-zinc-700">
                        {cat.category}: {cat.count}件
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );

      case 'notes':
        if (!notes) return null;
        return (
          <Card key={sectionId} className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-zinc-600" />
                {config?.title ?? '補足事項'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200">
                <p className="text-zinc-700 whitespace-pre-wrap">{notes}</p>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100">
      {/* ヘッダー */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 bg-gradient-to-br ${templateStyle.gradient} rounded-lg`}>
                {templateStyle.icon}
              </div>
              <div>
                <h1 className="text-lg font-bold text-zinc-800">
                  DHPハブ {templateStyle.title}
                </h1>
                <p className="text-sm text-zinc-500">{shareName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-zinc-100 text-zinc-600 text-xs">
                {template.label}
              </Badge>
              <Badge className="bg-blue-100 text-blue-700 text-xs">
                <Lock className="w-3 h-3 mr-1" />
                読み取り専用
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* スナップショット日時 */}
        <div className="mb-6 flex items-center gap-2 text-sm text-zinc-500">
          <Clock className="w-4 h-4" />
          <span>
            スナップショット取得日時:{' '}
            {new Date(snapshot.generatedAt).toLocaleString('ja-JP')}
          </span>
        </div>

        {/* テンプレートの順序でセクションをレンダリング */}
        {template.sections.map((sectionId) => renderSection(sectionId))}

        {/* フッター */}
        <footer className="text-center text-sm text-zinc-500 py-8 border-t border-zinc-200">
          <p>このレポートは DHPハブ により自動生成されました</p>
          <p className="mt-1">
            スナップショット取得日時:{' '}
            {new Date(snapshot.generatedAt).toLocaleString('ja-JP')}
          </p>
          <p className="mt-4 text-xs text-zinc-400">
            本レポートは共有リンク発行時点の情報を凍結したものです。
            最新情報は共有元にお問い合わせください。
          </p>
        </footer>
      </main>
    </div>
  );
}
