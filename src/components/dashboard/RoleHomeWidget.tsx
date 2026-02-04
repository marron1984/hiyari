'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui';
import type { Widget, WidgetType } from '@/lib/roleHome/types';
import {
  AlertTriangle,
  FileQuestion,
  Bot,
  Ticket,
  Wrench,
  ClipboardCheck,
  Award,
  GraduationCap,
  FileText,
  Megaphone,
  Calendar,
  CalendarDays,
  Building2,
  Banknote,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Activity,
} from 'lucide-react';

/**
 * ウィジェットアイコンマッピング
 */
const WIDGET_ICONS: Record<WidgetType, React.ComponentType<{ className?: string }>> = {
  alerts: AlertTriangle,
  unclassified: FileQuestion,
  ai_vp_top3: Bot,
  business_summary: Building2,
  tickets: Ticket,
  repairs: Wrench,
  corrective_actions: ClipboardCheck,
  licenses: Award,
  training: GraduationCap,
  handover: FileText,
  announcements: Megaphone,
  daily_ops: Calendar,
  weekly_ops: CalendarDays,
  ops_report: Activity,      // Task 066: 運用レポート
  os_map: Building2,
  quality_risk: AlertTriangle,
  contracts: FileText,
  receivables: Banknote,
};

/**
 * 重要度に応じた色を取得
 */
function getSeverityColor(severity?: string): {
  bg: string;
  text: string;
  border: string;
  iconBg: string;
} {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-200',
        iconBg: 'bg-red-100',
      };
    case 'warning':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        iconBg: 'bg-amber-100',
      };
    default:
      return {
        bg: 'bg-zinc-50',
        text: 'text-zinc-700',
        border: 'border-zinc-200',
        iconBg: 'bg-zinc-100',
      };
  }
}

interface RoleHomeWidgetProps {
  widget: Widget;
}

/**
 * 汎用ウィジェットコンポーネント
 */
export function RoleHomeWidget({ widget }: RoleHomeWidgetProps) {
  const Icon = WIDGET_ICONS[widget.type] ?? AlertTriangle;
  const colors = getSeverityColor(widget.severity);
  const hasCount = widget.count !== undefined && widget.count > 0;

  // 空の場合はコンパクト表示
  if (widget.isEmpty) {
    return (
      <Card className="border-zinc-200 bg-white">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-100 rounded-lg">
              <Icon className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-500">{widget.title}</p>
              <p className="text-xs text-zinc-400">対応不要</p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const content = (
    <Card className={`${colors.border} ${colors.bg} hover:shadow-sm transition-shadow`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 ${colors.iconBg} rounded-lg`}>
            <Icon className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-900">{widget.title}</p>
              {hasCount && (
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
                  {widget.count}件
                </span>
              )}
            </div>
            <WidgetDetails widget={widget} />
          </div>
          {widget.href && (
            <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-1" />
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (widget.href) {
    return (
      <Link href={widget.href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

/**
 * ウィジェット詳細表示
 */
function WidgetDetails({ widget }: { widget: Widget }) {
  switch (widget.type) {
    case 'alerts': {
      const w = widget as Widget & { criticalOpen: number; warningOpen: number };
      return (
        <div className="mt-1 flex gap-3 text-xs">
          {w.criticalOpen > 0 && (
            <span className="text-red-600">重大: {w.criticalOpen}</span>
          )}
          {w.warningOpen > 0 && (
            <span className="text-amber-600">警告: {w.warningOpen}</span>
          )}
        </div>
      );
    }

    case 'unclassified': {
      const w = widget as Widget & { tickets: number; repairs: number; correctiveActions: number };
      const parts = [];
      if (w.tickets > 0) parts.push(`チケット${w.tickets}`);
      if (w.repairs > 0) parts.push(`修繕${w.repairs}`);
      if (w.correctiveActions > 0) parts.push(`是正措置${w.correctiveActions}`);
      return (
        <p className="mt-1 text-xs text-zinc-500">
          {parts.join('、') || '対応不要'}
        </p>
      );
    }

    case 'tickets': {
      const w = widget as Widget & { myAssignedOpen: number; overdue: number; urgentOpen: number };
      const parts = [];
      if (w.myAssignedOpen > 0) parts.push(`担当${w.myAssignedOpen}`);
      if (w.overdue > 0) parts.push(`期限超過${w.overdue}`);
      if (w.urgentOpen > 0) parts.push(`緊急${w.urgentOpen}`);
      return (
        <p className="mt-1 text-xs text-zinc-500">
          {parts.join(' / ') || '対応不要'}
        </p>
      );
    }

    case 'repairs': {
      const w = widget as Widget & { highRiskOpen: number; overdue: number };
      const parts = [];
      if (w.highRiskOpen > 0) parts.push(`高リスク${w.highRiskOpen}`);
      if (w.overdue > 0) parts.push(`期限超過${w.overdue}`);
      return (
        <p className="mt-1 text-xs text-zinc-500">
          {parts.join(' / ') || 'オープン中'}
        </p>
      );
    }

    case 'corrective_actions': {
      const w = widget as Widget & { criticalOpen: number; overdue: number };
      const parts = [];
      if (w.criticalOpen > 0) parts.push(`重大${w.criticalOpen}`);
      if (w.overdue > 0) parts.push(`期限超過${w.overdue}`);
      return (
        <p className="mt-1 text-xs text-zinc-500">
          {parts.join(' / ') || 'オープン中'}
        </p>
      );
    }

    case 'licenses': {
      const w = widget as Widget & { expired: number; expiringSoon: number };
      const parts = [];
      if (w.expired > 0) parts.push(`期限切れ${w.expired}`);
      if (w.expiringSoon > 0) parts.push(`30日以内${w.expiringSoon}`);
      return (
        <p className="mt-1 text-xs text-zinc-500">
          {parts.join(' / ') || '問題なし'}
        </p>
      );
    }

    case 'daily_ops': {
      const w = widget as Widget & { lastRunAt: string | null; lastRunOk: boolean | null; hasFailedRecently: boolean };
      return (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {w.lastRunOk === true && (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="w-3 h-3" />
              正常
            </span>
          )}
          {w.lastRunOk === false && (
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="w-3 h-3" />
              失敗
            </span>
          )}
          {w.lastRunAt && (
            <span className="text-zinc-400">
              {new Date(w.lastRunAt).toLocaleDateString('ja-JP')}
            </span>
          )}
          {!w.lastRunAt && (
            <span className="text-zinc-400">未実行</span>
          )}
        </div>
      );
    }

    case 'weekly_ops': {
      const w = widget as Widget & { wbrDueDate: string | null };
      return (
        <p className="mt-1 text-xs text-zinc-500">
          {w.wbrDueDate ? `WBR予定: ${w.wbrDueDate}` : 'WBRを確認'}
        </p>
      );
    }

    case 'handover': {
      const w = widget as Widget & { unread: number; urgent: number };
      return (
        <p className="mt-1 text-xs text-zinc-500">
          未読 {w.unread}件{w.urgent > 0 && ` (緊急${w.urgent})`}
        </p>
      );
    }

    case 'announcements': {
      const w = widget as Widget & { unread: number };
      return (
        <p className="mt-1 text-xs text-zinc-500">
          未読 {w.unread}件
        </p>
      );
    }

    case 'receivables': {
      const w = widget as Widget & { totalOverdue: number; overdueAmount: number };
      return (
        <p className="mt-1 text-xs text-zinc-500">
          {w.totalOverdue}件 / {(w.overdueAmount / 10000).toFixed(0)}万円
        </p>
      );
    }

    default:
      return null;
  }
}
