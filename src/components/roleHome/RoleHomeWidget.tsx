'use client';

import Link from 'next/link';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import {
  AlertTriangle,
  FileQuestion,
  Bot,
  Building2,
  Ticket,
  Wrench,
  ClipboardCheck,
  Award,
  GraduationCap,
  MessageSquare,
  Megaphone,
  Clock,
  Calendar,
  Wallet,
  ExternalLink,
  Play,
  CheckCircle,
  XCircle,
  FileSignature,
  Layers,
  ShieldAlert,
  BarChart3,
  Home,
  Users,
  Briefcase,
} from 'lucide-react';
import type {
  Widget,
  WidgetType,
  AlertsWidget,
  UnclassifiedWidget,
  AIVPTop3Widget,
  TicketsWidget,
  RepairsWidget,
  CorrectiveActionsWidget,
  LicensesWidget,
  TrainingWidget,
  HandoverWidget,
  AnnouncementsWidget,
  DailyOpsWidget,
  WeeklyOpsWidget,
  ReceivablesWidget,
  BusinessSummaryWidget,
  ContractsWidget,
  OsMapWidget,
  QualityRiskWidget,
  MbrWidget,
  VacancyInquiryKpisWidget,
  SalesTasksWidget,
} from '@/lib/roleHome/types';
import type { AppRole } from '@/config/appRoles';

interface RoleHomeWidgetProps {
  widget: Widget;
  role: AppRole;
  onRunDailyOps?: () => void;
  onRunWeeklyOps?: () => void;
}

/**
 * 役職別ホーム用ウィジェットカード
 *
 * Implementation Ticket 046-final: 各ウィジェットタイプに応じた表示
 */
export function RoleHomeWidget({
  widget,
  role,
  onRunDailyOps,
  onRunWeeklyOps,
}: RoleHomeWidgetProps) {
  // ウィジェットが空の場合は簡易表示
  if (widget.isEmpty) {
    return <EmptyWidget widget={widget} />;
  }

  // ウィジェットタイプに応じたレンダリング
  switch (widget.type) {
    case 'alerts':
      return <AlertsWidgetCard widget={widget as AlertsWidget} />;
    case 'unclassified':
      return <UnclassifiedWidgetCard widget={widget as UnclassifiedWidget} />;
    case 'ai_vp_top3':
      return <AIVPTop3WidgetCard widget={widget as AIVPTop3Widget} />;
    case 'tickets':
      return <TicketsWidgetCard widget={widget as TicketsWidget} />;
    case 'repairs':
      return <RepairsWidgetCard widget={widget as RepairsWidget} />;
    case 'corrective_actions':
      return <CorrectiveActionsWidgetCard widget={widget as CorrectiveActionsWidget} />;
    case 'licenses':
      return <LicensesWidgetCard widget={widget as LicensesWidget} role={role} />;
    case 'training':
      return <TrainingWidgetCard widget={widget as TrainingWidget} role={role} />;
    case 'handover':
      return <HandoverWidgetCard widget={widget as HandoverWidget} />;
    case 'announcements':
      return <AnnouncementsWidgetCard widget={widget as AnnouncementsWidget} />;
    case 'daily_ops':
      return <DailyOpsWidgetCard widget={widget as DailyOpsWidget} role={role} onRun={onRunDailyOps} />;
    case 'weekly_ops':
      return <WeeklyOpsWidgetCard widget={widget as WeeklyOpsWidget} role={role} onRun={onRunWeeklyOps} />;
    case 'receivables':
      return <ReceivablesWidgetCard widget={widget as ReceivablesWidget} />;
    case 'business_summary':
      return <BusinessSummaryWidgetCard widget={widget as BusinessSummaryWidget} />;
    // Task 053: 新規ウィジェット
    case 'contracts':
      return <ContractsWidgetCard widget={widget as ContractsWidget} />;
    case 'os_map':
      return <OsMapWidgetCard widget={widget as OsMapWidget} />;
    case 'quality_risk':
      return <QualityRiskWidgetCard widget={widget as QualityRiskWidget} />;
    // Ticket 127: MBRウィジェット
    case 'mbr':
      return <MbrWidgetCard widget={widget as MbrWidget} />;
    // Ticket 082: 空室問い合わせKPI
    case 'vacancy_inquiry_kpis':
      return <VacancyInquiryKpisWidgetCard widget={widget as VacancyInquiryKpisWidget} />;
    // Ticket 122: 営業タスク
    case 'sales_tasks':
      return <SalesTasksWidgetCard widget={widget as SalesTasksWidget} role={role} />;
    default:
      return <DefaultWidgetCard widget={widget} />;
  }
}

// ベースカードコンポーネント
function WidgetCard({
  icon,
  title,
  href,
  severity,
  children,
  className = '',
}: {
  icon: React.ReactNode;
  title: string;
  href?: string;
  severity?: 'critical' | 'warning' | 'info';
  children: React.ReactNode;
  className?: string;
}) {
  const borderColor =
    severity === 'critical'
      ? 'border-red-200'
      : severity === 'warning'
        ? 'border-amber-200'
        : 'border-zinc-200';

  const content = (
    <Card className={`h-full ${borderColor} ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-semibold text-zinc-800">{title}</h3>
          </div>
          {href && (
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}

// 空ウィジェット
function EmptyWidget({ widget }: { widget: Widget }) {
  const Icon = getWidgetIcon(widget.type);
  return (
    <WidgetCard
      icon={<Icon className="w-4 h-4 text-zinc-400" />}
      title={widget.title}
      href={widget.href}
    >
      <p className="text-xs text-zinc-400">データなし</p>
    </WidgetCard>
  );
}

// アラートウィジェット
function AlertsWidgetCard({ widget }: { widget: AlertsWidget }) {
  return (
    <WidgetCard
      icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="space-y-2">
        {widget.criticalOpen > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-600">重大</span>
            <Badge className="bg-red-100 text-red-700 text-xs">
              {widget.criticalOpen}件
            </Badge>
          </div>
        )}
        {widget.warningOpen > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-600">注意</span>
            <Badge className="bg-amber-100 text-amber-700 text-xs">
              {widget.warningOpen}件
            </Badge>
          </div>
        )}
        <div className="text-right">
          <span className="text-lg font-bold text-zinc-800">{widget.totalOpen}</span>
          <span className="text-xs text-zinc-500 ml-1">件オープン</span>
        </div>
      </div>
    </WidgetCard>
  );
}

// 未分類ウィジェット
function UnclassifiedWidgetCard({ widget }: { widget: UnclassifiedWidget }) {
  return (
    <WidgetCard
      icon={<FileQuestion className="w-4 h-4 text-amber-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-sm font-bold text-zinc-700">{widget.tickets}</div>
          <div className="text-[10px] text-zinc-500">チケット</div>
        </div>
        <div>
          <div className="text-sm font-bold text-zinc-700">{widget.repairs}</div>
          <div className="text-[10px] text-zinc-500">修繕</div>
        </div>
        <div>
          <div className="text-sm font-bold text-zinc-700">{widget.correctiveActions}</div>
          <div className="text-[10px] text-zinc-500">是正</div>
        </div>
      </div>
      <div className="mt-2 text-right">
        <span className="text-lg font-bold text-amber-600">{widget.total}</span>
        <span className="text-xs text-zinc-500 ml-1">件未分類</span>
      </div>
    </WidgetCard>
  );
}

// AI副社長Top3ウィジェット
function AIVPTop3WidgetCard({ widget }: { widget: AIVPTop3Widget }) {
  return (
    <WidgetCard
      icon={<Bot className="w-4 h-4 text-purple-500" />}
      title={widget.title}
      href={widget.href}
    >
      <div className="space-y-2">
        {widget.businessUnits.slice(0, 3).map((bu, i) => (
          <div
            key={bu.id}
            className={`p-2 rounded text-xs ${
              bu.severity === 'critical'
                ? 'bg-red-50'
                : bu.severity === 'warning'
                  ? 'bg-amber-50'
                  : 'bg-zinc-50'
            }`}
          >
            <div className="font-medium text-zinc-700">{bu.name}</div>
            <div className="text-zinc-500 truncate">{bu.topIssue}</div>
          </div>
        ))}
        {widget.businessUnits.length === 0 && (
          <p className="text-xs text-zinc-400">事業別データなし</p>
        )}
      </div>
    </WidgetCard>
  );
}

// チケットウィジェット
function TicketsWidgetCard({ widget }: { widget: TicketsWidget }) {
  return (
    <WidgetCard
      icon={<Ticket className="w-4 h-4 text-blue-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 bg-blue-50 rounded text-center">
          <div className="text-lg font-bold text-blue-600">{widget.myAssignedOpen}</div>
          <div className="text-[10px] text-blue-700">担当</div>
        </div>
        <div className="p-2 bg-violet-50 rounded text-center">
          <div className="text-lg font-bold text-violet-600">{widget.myRequestedOpen}</div>
          <div className="text-[10px] text-violet-700">依頼</div>
        </div>
      </div>
      {(widget.overdue > 0 || widget.urgentOpen > 0) && (
        <div className="mt-2 flex gap-2">
          {widget.overdue > 0 && (
            <Badge className="bg-red-100 text-red-700 text-[10px]">
              期限超過 {widget.overdue}
            </Badge>
          )}
          {widget.urgentOpen > 0 && (
            <Badge className="bg-amber-100 text-amber-700 text-[10px]">
              緊急 {widget.urgentOpen}
            </Badge>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

// 修繕ウィジェット
function RepairsWidgetCard({ widget }: { widget: RepairsWidget }) {
  return (
    <WidgetCard
      icon={<Wrench className="w-4 h-4 text-orange-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="text-center">
        <div className="text-2xl font-bold text-orange-600">{widget.open}</div>
        <div className="text-xs text-zinc-500">件オープン</div>
      </div>
      {(widget.highRiskOpen > 0 || widget.overdue > 0) && (
        <div className="mt-2 flex justify-center gap-2">
          {widget.highRiskOpen > 0 && (
            <Badge className="bg-red-100 text-red-700 text-[10px]">
              高リスク {widget.highRiskOpen}
            </Badge>
          )}
          {widget.overdue > 0 && (
            <Badge className="bg-amber-100 text-amber-700 text-[10px]">
              期限超過 {widget.overdue}
            </Badge>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

// 是正措置ウィジェット
function CorrectiveActionsWidgetCard({ widget }: { widget: CorrectiveActionsWidget }) {
  return (
    <WidgetCard
      icon={<ClipboardCheck className="w-4 h-4 text-red-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="text-center">
        <div className="text-2xl font-bold text-red-600">{widget.open}</div>
        <div className="text-xs text-zinc-500">件オープン</div>
      </div>
      {(widget.criticalOpen > 0 || widget.overdue > 0) && (
        <div className="mt-2 flex justify-center gap-2">
          {widget.criticalOpen > 0 && (
            <Badge className="bg-red-100 text-red-700 text-[10px]">
              重大 {widget.criticalOpen}
            </Badge>
          )}
          {widget.overdue > 0 && (
            <Badge className="bg-amber-100 text-amber-700 text-[10px]">
              期限超過 {widget.overdue}
            </Badge>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

// 資格ウィジェット
function LicensesWidgetCard({ widget, role }: { widget: LicensesWidget; role: AppRole }) {
  const showMyOnly = role === 'staff';

  return (
    <WidgetCard
      icon={<Award className="w-4 h-4 text-emerald-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      {showMyOnly && widget.myExpiringSoon !== undefined ? (
        <div className="text-center">
          <div className="text-2xl font-bold text-emerald-600">{widget.myExpiringSoon}</div>
          <div className="text-xs text-zinc-500">件 期限間近</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-red-50 rounded text-center">
            <div className="text-lg font-bold text-red-600">{widget.expired}</div>
            <div className="text-[10px] text-red-700">期限切れ</div>
          </div>
          <div className="p-2 bg-amber-50 rounded text-center">
            <div className="text-lg font-bold text-amber-600">{widget.expiringSoon}</div>
            <div className="text-[10px] text-amber-700">30日以内</div>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

// 研修ウィジェット
function TrainingWidgetCard({ widget, role }: { widget: TrainingWidget; role: AppRole }) {
  const showMyOnly = role === 'staff';

  return (
    <WidgetCard
      icon={<GraduationCap className="w-4 h-4 text-indigo-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="text-center">
        <div className="text-2xl font-bold text-indigo-600">
          {showMyOnly ? (widget.myNotCompleted ?? 0) : widget.notCompleted}
        </div>
        <div className="text-xs text-zinc-500">件 未受講</div>
      </div>
    </WidgetCard>
  );
}

// 申し送りウィジェット
function HandoverWidgetCard({ widget }: { widget: HandoverWidget }) {
  return (
    <WidgetCard
      icon={<MessageSquare className="w-4 h-4 text-sky-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="text-center">
        <div className="text-2xl font-bold text-sky-600">{widget.unread}</div>
        <div className="text-xs text-zinc-500">件 未読</div>
      </div>
      {widget.urgent > 0 && (
        <div className="mt-2 text-center">
          <Badge className="bg-red-100 text-red-700 text-[10px]">
            緊急 {widget.urgent}件
          </Badge>
        </div>
      )}
    </WidgetCard>
  );
}

// 周知ウィジェット
function AnnouncementsWidgetCard({ widget }: { widget: AnnouncementsWidget }) {
  return (
    <WidgetCard
      icon={<Megaphone className="w-4 h-4 text-pink-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="text-center">
        <div className="text-2xl font-bold text-pink-600">{widget.unread}</div>
        <div className="text-xs text-zinc-500">件 未読</div>
      </div>
    </WidgetCard>
  );
}

// 日次オペウィジェット（Ticket 067: 失敗ステップ名表示）
function DailyOpsWidgetCard({
  widget,
  role,
  onRun,
}: {
  widget: DailyOpsWidget;
  role: AppRole;
  onRun?: () => void;
}) {
  const isAdmin = role === 'admin';
  const StatusIcon = widget.lastRunOk === true
    ? CheckCircle
    : widget.lastRunOk === false
      ? XCircle
      : Clock;
  const statusColor = widget.lastRunOk === true
    ? 'text-green-500'
    : widget.lastRunOk === false
      ? 'text-red-500'
      : 'text-zinc-400';

  return (
    <WidgetCard
      icon={<Clock className="w-4 h-4 text-violet-500" />}
      title={widget.title}
      href={isAdmin ? undefined : widget.href}
      severity={widget.hasFailedRecently ? 'critical' : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-5 h-5 ${statusColor}`} />
          <div>
            <div className="text-xs text-zinc-600">
              {widget.lastRunAt
                ? new Date(widget.lastRunAt).toLocaleString('ja-JP', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '未実行'}
            </div>
            <div className="text-[10px] text-zinc-400">
              合計 {widget.totalRuns} 回実行
            </div>
          </div>
        </div>
        {isAdmin && onRun && (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              onRun();
            }}
            className="gap-1"
          >
            <Play className="w-3 h-3" />
            実行
          </Button>
        )}
      </div>
      {/* Ticket 067: 失敗ステップ名表示 */}
      {widget.failedSteps && widget.failedSteps.length > 0 && (
        <div className="mt-2 p-2 bg-red-50 rounded">
          <div className="text-[10px] text-red-600 font-medium">失敗ステップ:</div>
          <div className="text-[10px] text-red-500">
            {widget.failedSteps.join(', ')}
          </div>
        </div>
      )}
      {/* Ticket 130: MBR改善タスク期限超過 */}
      {widget.mbrOverdueCount != null && widget.mbrOverdueCount > 0 && (
        <div className="mt-2 p-2 bg-amber-50 rounded">
          <div className="text-[10px] text-amber-700 font-medium">
            MBR改善タスク期限超過: {widget.mbrOverdueCount}件
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

// 週次オペウィジェット（Ticket 067: 失敗ステップ名表示）
function WeeklyOpsWidgetCard({
  widget,
  role,
  onRun,
}: {
  widget: WeeklyOpsWidget;
  role: AppRole;
  onRun?: () => void;
}) {
  const isAdmin = role === 'admin';
  const StatusIcon = widget.lastRunOk === true
    ? CheckCircle
    : widget.lastRunOk === false
      ? XCircle
      : Clock;
  const statusColor = widget.lastRunOk === true
    ? 'text-green-500'
    : widget.lastRunOk === false
      ? 'text-red-500'
      : 'text-zinc-400';

  return (
    <WidgetCard
      icon={<Calendar className="w-4 h-4 text-teal-500" />}
      title={widget.title}
      href={isAdmin ? undefined : widget.href}
      severity={widget.hasFailedRecently ? 'critical' : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-4 h-4 ${statusColor}`} />
          <div>
            <div className="text-xs text-zinc-600">
              WBR期限: {widget.wbrDueDate ?? '未設定'}
            </div>
            <div className="text-[10px] text-zinc-400">
              {widget.lastRunAt
                ? `最終実行: ${new Date(widget.lastRunAt).toLocaleDateString('ja-JP')}`
                : '未実行'}
            </div>
          </div>
        </div>
        {isAdmin && onRun && (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              onRun();
            }}
            className="gap-1"
          >
            <Play className="w-3 h-3" />
            WBR生成
          </Button>
        )}
      </div>
      {/* Ticket 067: 失敗ステップ名表示 */}
      {widget.failedSteps && widget.failedSteps.length > 0 && (
        <div className="mt-2 p-2 bg-red-50 rounded">
          <div className="text-[10px] text-red-600 font-medium">失敗ステップ:</div>
          <div className="text-[10px] text-red-500">
            {widget.failedSteps.join(', ')}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

// 未収金ウィジェット
function ReceivablesWidgetCard({ widget }: { widget: ReceivablesWidget }) {
  const formatAmount = (amount: number) => {
    if (amount >= 10000) {
      return `${Math.round(amount / 10000)}万円`;
    }
    return `${amount.toLocaleString()}円`;
  };

  return (
    <WidgetCard
      icon={<Wallet className="w-4 h-4 text-rose-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="text-center">
        <div className="text-xl font-bold text-rose-600">
          {formatAmount(widget.overdueAmount)}
        </div>
        <div className="text-xs text-zinc-500">
          {widget.totalOverdue}件 期限超過
        </div>
      </div>
      {widget.criticalCount > 0 && (
        <div className="mt-2 text-center">
          <Badge className="bg-red-100 text-red-700 text-[10px]">
            重大 {widget.criticalCount}件
          </Badge>
        </div>
      )}
    </WidgetCard>
  );
}

// 事業サマリーウィジェット
function BusinessSummaryWidgetCard({ widget }: { widget: BusinessSummaryWidget }) {
  return (
    <WidgetCard
      icon={<Building2 className="w-4 h-4 text-cyan-500" />}
      title={widget.title}
      href={widget.href}
    >
      <div className="space-y-1">
        {widget.businessUnits.slice(0, 4).map((bu) => (
          <div
            key={bu.id}
            className="flex items-center justify-between p-1.5 bg-zinc-50 rounded text-xs"
          >
            <span className="text-zinc-700">{bu.name}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                bu.status === 'critical'
                  ? 'bg-red-500'
                  : bu.status === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-green-500'
              }`}
            />
          </div>
        ))}
        {widget.businessUnits.length === 0 && (
          <p className="text-xs text-zinc-400">事業データなし</p>
        )}
      </div>
    </WidgetCard>
  );
}

// Task 053: 契約ウィジェット
function ContractsWidgetCard({ widget }: { widget: ContractsWidget }) {
  return (
    <WidgetCard
      icon={<FileSignature className="w-4 h-4 text-indigo-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 bg-amber-50 rounded">
          <div className="text-lg font-bold text-amber-600">{widget.expiringSoon}</div>
          <div className="text-[10px] text-amber-700">期限間近</div>
        </div>
        <div className="p-2 bg-red-50 rounded">
          <div className="text-lg font-bold text-red-600">{widget.decisionOverdue}</div>
          <div className="text-[10px] text-red-700">判断期限超</div>
        </div>
        <div className="p-2 bg-rose-50 rounded">
          <div className="text-lg font-bold text-rose-600">{widget.highRiskExpiring}</div>
          <div className="text-[10px] text-rose-700">高リスク</div>
        </div>
      </div>
    </WidgetCard>
  );
}

// Task 053: OSマップウィジェット
function OsMapWidgetCard({ widget }: { widget: OsMapWidget }) {
  return (
    <WidgetCard
      icon={<Layers className="w-4 h-4 text-violet-500" />}
      title={widget.title}
      href={widget.href}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-600">進捗率</span>
          <span className="text-sm font-bold text-violet-600">{widget.progressPercent}%</span>
        </div>
        <div className="w-full bg-zinc-200 rounded-full h-2">
          <div
            className="bg-violet-500 h-2 rounded-full transition-all"
            style={{ width: `${Math.min(widget.progressPercent, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>稼働中 {widget.activeFeatures}</span>
          <span>全体 {widget.totalFeatures}</span>
        </div>
      </div>
    </WidgetCard>
  );
}

// Task 053: 品質/リスクウィジェット
function QualityRiskWidgetCard({ widget }: { widget: QualityRiskWidget }) {
  return (
    <WidgetCard
      icon={<ShieldAlert className="w-4 h-4 text-orange-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 bg-red-50 rounded">
          <div className="text-lg font-bold text-red-600">{widget.highRiskCount}</div>
          <div className="text-[10px] text-red-700">高リスク</div>
        </div>
        <div className="p-2 bg-amber-50 rounded">
          <div className="text-lg font-bold text-amber-600">{widget.incidentCount}</div>
          <div className="text-[10px] text-amber-700">インシデント</div>
        </div>
        <div className="p-2 bg-orange-50 rounded">
          <div className="text-lg font-bold text-orange-600">{widget.overdueActions}</div>
          <div className="text-[10px] text-orange-700">対応遅延</div>
        </div>
      </div>
    </WidgetCard>
  );
}

// Ticket 127: MBRウィジェット
function MbrWidgetCard({ widget }: { widget: MbrWidget }) {
  return (
    <WidgetCard
      icon={<BarChart3 className="w-4 h-4 text-indigo-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      {widget.available ? (
        <div className="space-y-2">
          <div className="text-center">
            <div className="text-xl font-bold text-indigo-600">{widget.latestMonth}</div>
            <div className="text-[10px] text-zinc-500">最新MBR</div>
          </div>
          <div className="text-center">
            <Badge className="bg-green-100 text-green-700 text-[10px]">
              生成済み
            </Badge>
          </div>
          {widget.generatedAt && (
            <div className="text-center text-[10px] text-zinc-400">
              {new Date(widget.generatedAt).toLocaleDateString('ja-JP')}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-center">
            <div className="text-sm text-zinc-500">MBR未生成</div>
          </div>
          <div className="text-center">
            <Badge className="bg-amber-100 text-amber-700 text-[10px]">
              生成忘れ
            </Badge>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

// Ticket 082: 空室問い合わせKPIウィジェット
function VacancyInquiryKpisWidgetCard({ widget }: { widget: VacancyInquiryKpisWidget }) {
  const formatRate = (rate: number) => `${Math.round(rate * 100)}%`;

  return (
    <WidgetCard
      icon={<Home className="w-4 h-4 text-teal-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      {/* サマリー行 */}
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <div className="p-2 bg-teal-50 rounded">
          <div className="text-lg font-bold text-teal-600">{widget.summary.totalInquiries}</div>
          <div className="text-[10px] text-teal-700">問合せ</div>
        </div>
        <div className="p-2 bg-green-50 rounded">
          <div className="text-lg font-bold text-green-600">{formatRate(widget.summary.overallSlaOkRate)}</div>
          <div className="text-[10px] text-green-700">SLA達成</div>
        </div>
        <div className="p-2 bg-blue-50 rounded">
          <div className="text-lg font-bold text-blue-600">{formatRate(widget.summary.overallAcceptRate)}</div>
          <div className="text-[10px] text-blue-700">成約率</div>
        </div>
      </div>

      {/* SLA超過がある場合は警告 */}
      {widget.summary.totalSlaBreach > 0 && (
        <div className="mb-2">
          <Badge className="bg-red-100 text-red-700 text-[10px]">
            SLA超過 {widget.summary.totalSlaBreach}件
          </Badge>
        </div>
      )}

      {/* 担当者別（上位3名） */}
      {widget.assignees.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-zinc-500 mb-1">
            <Users className="w-3 h-3" />
            担当者別（直近{widget.periodDays}日）
          </div>
          {widget.assignees.slice(0, 3).map((row) => (
            <div
              key={row.assigneeUserId}
              className="flex items-center justify-between p-1.5 bg-zinc-50 rounded text-xs"
            >
              <span className="text-zinc-700 truncate" style={{ maxWidth: '80px' }}>
                {row.assigneeName || row.assigneeUserId}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-teal-600">{row.inquiriesAssigned}件</span>
                <span className={row.slaOkRate >= 0.8 ? 'text-green-600' : 'text-amber-600'}>
                  {formatRate(row.slaOkRate)}
                </span>
                <span className="text-blue-600">{formatRate(row.acceptRate)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// Ticket 122: 営業タスクウィジェット
function SalesTasksWidgetCard({
  widget,
  role,
}: {
  widget: SalesTasksWidget;
  role: AppRole;
}) {
  const isStaffOrLeader = ['staff', 'leader'].includes(role);

  // staff/leader: 自分のタスクを表示
  if (isStaffOrLeader) {
    return (
      <WidgetCard
        icon={<Briefcase className="w-4 h-4 text-indigo-500" />}
        title={widget.title}
        href={widget.href}
        severity={widget.severity}
      >
        <div className="space-y-2">
          {/* 今日のタスク件数 */}
          <div className="flex items-center justify-between p-2 bg-indigo-50 rounded">
            <span className="text-xs text-indigo-700">今日のタスク</span>
            <span className="text-lg font-bold text-indigo-600">
              {widget.mySalesTasksToday ?? 0}件
            </span>
          </div>

          {/* 上位3タスク */}
          {widget.myTopTasks && widget.myTopTasks.length > 0 && (
            <div className="space-y-1">
              {widget.myTopTasks.slice(0, 3).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-1.5 bg-zinc-50 rounded text-xs"
                >
                  <span className="text-zinc-700 truncate flex-1 mr-2">
                    {task.title}
                  </span>
                  {task.dueAt && (
                    <span className="text-zinc-500 text-[10px] whitespace-nowrap">
                      {new Date(task.dueAt).toLocaleDateString('ja-JP', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {(!widget.myTopTasks || widget.myTopTasks.length === 0) &&
            (widget.mySalesTasksToday ?? 0) === 0 && (
              <div className="text-center text-xs text-zinc-400 py-2">
                タスクなし
              </div>
            )}
        </div>
      </WidgetCard>
    );
  }

  // manager/admin: 全体状況を表示
  return (
    <WidgetCard
      icon={<Briefcase className="w-4 h-4 text-indigo-500" />}
      title={widget.title}
      href={widget.href}
      severity={widget.severity}
    >
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="p-2 bg-indigo-50 rounded">
          <div className="text-lg font-bold text-indigo-600">
            {widget.salesTasksToday ?? 0}
          </div>
          <div className="text-[10px] text-indigo-700">本日の件数</div>
        </div>
        <div className="p-2 bg-red-50 rounded">
          <div className="text-lg font-bold text-red-600">
            {widget.salesTasksOverdue ?? 0}
          </div>
          <div className="text-[10px] text-red-700">期限超過</div>
        </div>
      </div>

      {/* 事業別上位（任意） */}
      {widget.topBusinessUnits && widget.topBusinessUnits.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="text-[10px] text-zinc-500">事業別上位</div>
          {widget.topBusinessUnits.slice(0, 3).map((bu) => (
            <div
              key={bu.businessUnitId}
              className="flex items-center justify-between p-1.5 bg-zinc-50 rounded text-xs"
            >
              <span className="text-zinc-700 truncate">{bu.businessUnitName}</span>
              <span className="text-indigo-600">{bu.count}件</span>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// デフォルトウィジェット
function DefaultWidgetCard({ widget }: { widget: Widget }) {
  const Icon = getWidgetIcon(widget.type);
  return (
    <WidgetCard
      icon={<Icon className="w-4 h-4 text-zinc-500" />}
      title={widget.title}
      href={widget.href}
    >
      {widget.count !== undefined && (
        <div className="text-center">
          <div className="text-2xl font-bold text-zinc-600">{widget.count}</div>
          <div className="text-xs text-zinc-500">件</div>
        </div>
      )}
    </WidgetCard>
  );
}

// ウィジェットタイプに応じたアイコンを取得
function getWidgetIcon(type: WidgetType) {
  const iconMap: Record<WidgetType, typeof AlertTriangle> = {
    alerts: AlertTriangle,
    unclassified: FileQuestion,
    ai_vp_top3: Bot,
    business_summary: Building2,
    tickets: Ticket,
    repairs: Wrench,
    corrective_actions: ClipboardCheck,
    licenses: Award,
    training: GraduationCap,
    handover: MessageSquare,
    announcements: Megaphone,
    daily_ops: Clock,
    weekly_ops: Calendar,
    os_map: Layers,           // Task 053: 専用アイコン
    quality_risk: ShieldAlert, // Task 053: 専用アイコン
    contracts: FileSignature,  // Task 053: 専用アイコン
    receivables: Wallet,
    vacancy_inquiry_kpis: Home, // Ticket 082: 空室問い合わせKPI
    sales_tasks: Briefcase, // Ticket 122: 営業タスク
    mbr: ClipboardCheck, // Ticket 127: 月次改善レビュー
  };
  return iconMap[type] ?? FileQuestion;
}
