import { ReactNode } from 'react';
import { Card } from './Card';

type KPIStatus = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface KPICardProps {
  label: string;
  value: string | number | null;
  subtext?: string;
  icon?: ReactNode;
  status?: KPIStatus;
  // ローディング
  loading?: boolean;
  // エラー状態（valueをnullにして--表示）
  error?: boolean;
  // 進捗バー（0-100）
  progress?: number | null;
  // クリック可能
  onClick?: () => void;
}

const statusStyles: Record<KPIStatus, { bg: string; text: string; border: string }> = {
  default: {
    bg: 'bg-white',
    text: 'text-zinc-900',
    border: 'border-zinc-200',
  },
  success: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
  },
  warning: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  danger: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
  },
  info: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
};

const progressColors: Record<KPIStatus, string> = {
  default: 'bg-zinc-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
};

export function KPICard({
  label,
  value,
  subtext,
  icon,
  status = 'default',
  loading = false,
  error = false,
  progress,
  onClick,
}: KPICardProps) {
  const styles = statusStyles[status];

  // 表示値を決定
  const displayValue = (): string => {
    if (loading) return '...';
    if (error || value === null || value === undefined) return '--';
    return value.toString();
  };

  const isClickable = !!onClick;

  return (
    <Card
      className={`p-4 ${styles.bg} border ${styles.border} ${
        isClickable ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
      }`}
      onClick={onClick}
    >
      {/* アイコンとラベル */}
      <div className="flex items-center gap-2 mb-2">
        {icon && (
          <span className="text-zinc-500">{icon}</span>
        )}
        <span className="text-xs font-medium text-zinc-600">{label}</span>
      </div>

      {/* 値 */}
      <div className="flex items-baseline gap-1">
        <span
          className={`text-2xl font-bold ${
            loading || error ? 'text-zinc-400' : styles.text
          }`}
        >
          {displayValue()}
        </span>
      </div>

      {/* サブテキスト */}
      {subtext && (
        <p className="text-xs text-zinc-500 mt-1">{subtext}</p>
      )}

      {/* 進捗バー */}
      {progress !== undefined && progress !== null && (
        <div className="mt-2 w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${progressColors[status]} transition-all`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </Card>
  );
}

// 複数のKPIカードをグリッド表示するラッパー
interface KPIGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}

export function KPIGrid({ children, columns = 4 }: KPIGridProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-4 mb-6`}>
      {children}
    </div>
  );
}
