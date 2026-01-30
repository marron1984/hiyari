import { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, RefreshCw, XCircle, Info } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

type BannerVariant = 'error' | 'warning' | 'info' | 'success';

interface ErrorBannerProps {
  title?: string;
  message: string;
  variant?: BannerVariant;
  // 再試行ボタン
  onRetry?: () => void;
  retrying?: boolean;
  // 閉じるボタン
  onDismiss?: () => void;
  // 詳細（exec向け）
  details?: string;
  // カスタムアクション
  action?: ReactNode;
}

const variantStyles: Record<BannerVariant, {
  bg: string;
  border: string;
  icon: typeof AlertCircle;
  iconColor: string;
  titleColor: string;
  textColor: string;
}> = {
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: AlertCircle,
    iconColor: 'text-red-600',
    titleColor: 'text-red-800',
    textColor: 'text-red-700',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-800',
    textColor: 'text-amber-700',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: Info,
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-800',
    textColor: 'text-blue-700',
  },
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: AlertCircle,
    iconColor: 'text-green-600',
    titleColor: 'text-green-800',
    textColor: 'text-green-700',
  },
};

export function ErrorBanner({
  title,
  message,
  variant = 'error',
  onRetry,
  retrying = false,
  onDismiss,
  details,
  action,
}: ErrorBannerProps) {
  const styles = variantStyles[variant];
  const Icon = styles.icon;

  const defaultTitle = {
    error: 'エラーが発生しました',
    warning: '警告',
    info: 'お知らせ',
    success: '完了',
  };

  return (
    <Card className={`p-4 mb-6 ${styles.bg} border ${styles.border}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${styles.iconColor} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${styles.titleColor}`}>
            {title || defaultTitle[variant]}
          </p>
          <p className={`text-sm ${styles.textColor} mt-1`}>{message}</p>
          {details && (
            <details className="mt-2">
              <summary className={`text-xs ${styles.textColor} cursor-pointer hover:underline`}>
                詳細を表示
              </summary>
              <pre className={`mt-1 text-xs ${styles.textColor} bg-white/50 p-2 rounded overflow-auto`}>
                {details}
              </pre>
            </details>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          {onRetry && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRetry}
              disabled={retrying}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${retrying ? 'animate-spin' : ''}`} />
              再試行
            </Button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className={`p-1 rounded hover:bg-white/50 ${styles.iconColor}`}
            >
              <XCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

// 複数の警告を表示するためのリスト
interface WarningListProps {
  warnings: Array<{ label: string; message: string }>;
  title?: string;
}

export function WarningList({ warnings, title = '警告' }: WarningListProps) {
  if (warnings.length === 0) return null;

  return (
    <ErrorBanner
      variant="warning"
      title={title}
      message={warnings.map(w => `[${w.label}] ${w.message}`).join('\n')}
    />
  );
}
