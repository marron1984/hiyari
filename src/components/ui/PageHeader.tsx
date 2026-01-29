import { ReactNode } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  // 最終更新時刻
  lastUpdated?: Date | null;
  // 更新ボタン
  onRefresh?: () => void;
  refreshing?: boolean;
  // プライマリアクション
  primaryAction?: ReactNode;
  // セカンダリアクション
  secondaryActions?: ReactNode;
  // ブレッドクラム（将来用）
  breadcrumb?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  lastUpdated,
  onRefresh,
  refreshing = false,
  primaryAction,
  secondaryActions,
  breadcrumb,
}: PageHeaderProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="mb-6">
      {breadcrumb && (
        <div className="mb-2">
          {breadcrumb}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900 flex items-center gap-2">
            {icon}
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>
          )}
          {lastUpdated && (
            <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              最終更新: {formatTime(lastUpdated)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {secondaryActions}
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
          {primaryAction}
        </div>
      </div>
    </div>
  );
}
