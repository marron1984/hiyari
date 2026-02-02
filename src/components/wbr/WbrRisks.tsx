'use client';

import Link from 'next/link';
import { Card, CardContent, Badge } from '@/components/ui';
import { Shield, AlertTriangle, Clock, FileQuestion, ExternalLink } from 'lucide-react';
import type { AlertSummaryForWBR, RiskAlertItem } from '@/lib/wbr-generator';
import type { UnclassifiedCounts } from '@/lib/scope/types';

interface WbrRisksProps {
  persistentRisks: RiskAlertItem[];
  newRisks?: RiskAlertItem[];
  alertSummary?: AlertSummaryForWBR;
  unclassifiedCounts?: UnclassifiedCounts;
  /** コンパクト表示（ファーストビュー用） */
  compact?: boolean;
}

/**
 * WBR リスクセクション
 *
 * Implementation Ticket 047: critical open, 期限超過, 未分類を1行で表示
 */
export function WbrRisks({
  persistentRisks,
  newRisks = [],
  alertSummary,
  unclassifiedCounts,
  compact = false,
}: WbrRisksProps) {
  const hasCriticalAlerts = alertSummary && alertSummary.criticalOpen > 0;
  const hasUnclassified = unclassifiedCounts && unclassifiedCounts.total > 0;
  const hasPersistentRisks = persistentRisks.length > 0;
  const hasNewRisks = newRisks.length > 0;

  const hasAnyRisk = hasCriticalAlerts || hasUnclassified || hasPersistentRisks || hasNewRisks;

  if (!hasAnyRisk) {
    return (
      <Card className="mb-4 border border-green-200 bg-green-50 print:bg-white print:border-zinc-300">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-green-700">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-medium">重大なリスクはありません</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return <WbrRisksCompact
      alertSummary={alertSummary}
      unclassifiedCounts={unclassifiedCounts}
      persistentRisks={persistentRisks}
    />;
  }

  return (
    <Card className="mb-4 border border-red-200 print:border-zinc-300 print:break-inside-avoid">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-red-600" />
          <h3 className="text-sm font-bold text-red-800">リスク・アラート</h3>
          {alertSummary && alertSummary.criticalOpen > 0 && (
            <Badge className="bg-red-100 text-red-700 text-xs">
              重大 {alertSummary.criticalOpen}件
            </Badge>
          )}
        </div>

        <div className="space-y-3">
          {/* Critical Alerts */}
          {alertSummary && alertSummary.criticalOpen > 0 && (
            <RiskRow
              icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
              label="重大アラート"
              count={alertSummary.criticalOpen}
              detail={alertSummary.topCriticals.map(c => c.title).join('、')}
              href="/dashboard/alerts"
              severity="critical"
            />
          )}

          {/* Unclassified */}
          {hasUnclassified && (
            <RiskRow
              icon={<FileQuestion className="w-4 h-4 text-amber-600" />}
              label="未分類スコープ"
              count={unclassifiedCounts.total}
              detail={`チケット${unclassifiedCounts.tickets}、修繕${unclassifiedCounts.repairs}、是正${unclassifiedCounts.correctiveActions}`}
              href="/dashboard/admin/unclassified"
              severity="warning"
            />
          )}

          {/* Persistent Risks */}
          {persistentRisks.slice(0, 3).map((risk, i) => (
            <RiskRow
              key={i}
              icon={<Clock className="w-4 h-4 text-red-500" />}
              label={risk.name}
              count={risk.daysIgnored}
              countSuffix="日経過"
              detail={risk.description}
              severity={risk.riskLevel === 'critical' ? 'critical' : 'warning'}
            />
          ))}

          {/* New Risks */}
          {newRisks.slice(0, 2).map((risk, i) => (
            <div
              key={`new-${i}`}
              className="p-2 bg-blue-50 rounded border border-blue-200 print:bg-white"
            >
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-100 text-blue-700 text-[10px]">NEW</Badge>
                <span className="text-xs font-medium text-zinc-700">{risk.name}</span>
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">{risk.description}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * コンパクト版（ファーストビュー用1行表示）
 */
function WbrRisksCompact({
  alertSummary,
  unclassifiedCounts,
  persistentRisks,
}: Pick<WbrRisksProps, 'alertSummary' | 'unclassifiedCounts' | 'persistentRisks'>) {
  const items: { label: string; count: number; href: string; color: string }[] = [];

  if (alertSummary && alertSummary.criticalOpen > 0) {
    items.push({
      label: '重大アラート',
      count: alertSummary.criticalOpen,
      href: '/dashboard/alerts',
      color: 'bg-red-100 text-red-700 border-red-200',
    });
  }

  if (unclassifiedCounts && unclassifiedCounts.total > 0) {
    items.push({
      label: '未分類',
      count: unclassifiedCounts.total,
      href: '/dashboard/admin/unclassified',
      color: 'bg-amber-100 text-amber-700 border-amber-200',
    });
  }

  const criticalPersistent = persistentRisks.filter(r => r.riskLevel === 'critical');
  if (criticalPersistent.length > 0) {
    items.push({
      label: '放置リスク',
      count: criticalPersistent.length,
      href: '/dashboard/alerts',
      color: 'bg-orange-100 text-orange-700 border-orange-200',
    });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {items.map((item, i) => (
        <Link key={i} href={item.href}>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${item.color}`}>
            <AlertTriangle className="w-3 h-3" />
            {item.label}: {item.count}件
            <ExternalLink className="w-3 h-3 opacity-60" />
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * リスク行コンポーネント
 */
function RiskRow({
  icon,
  label,
  count,
  countSuffix = '件',
  detail,
  href,
  severity,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  countSuffix?: string;
  detail: string;
  href?: string;
  severity: 'critical' | 'warning';
}) {
  const bgColor = severity === 'critical' ? 'bg-red-50' : 'bg-amber-50';
  const borderColor = severity === 'critical' ? 'border-red-200' : 'border-amber-200';

  const content = (
    <div className={`p-2 ${bgColor} rounded border ${borderColor} print:bg-white print:border-zinc-300`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium text-zinc-700">{label}</span>
          <Badge className={`text-[10px] ${severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
            {count}{countSuffix}
          </Badge>
        </div>
        {href && (
          <ExternalLink className="w-3 h-3 text-zinc-400 print:hidden" />
        )}
      </div>
      <p className="text-[10px] text-zinc-600 mt-1 line-clamp-1">{detail}</p>
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return content;
}
