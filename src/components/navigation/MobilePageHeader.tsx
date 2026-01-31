'use client';

import { useState, ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobilePageHeaderProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * モバイル最適化されたページヘッダー
 * - デスクトップ: 通常表示
 * - モバイル: 説明文は折りたたみ可能
 */
export function MobilePageHeader({
  icon,
  title,
  description,
  badge,
  actions,
  className,
}: MobilePageHeaderProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn('mb-4 md:mb-6', className)}>
      {/* メインヘッダー行 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <div className="p-2 bg-zinc-100 rounded-lg shrink-0">{icon}</div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold text-zinc-900 truncate">
                {title}
              </h1>
              {badge}
            </div>

            {/* デスクトップ用説明文（常に表示） */}
            {description && (
              <p className="hidden md:block text-sm text-zinc-500 mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex items-center gap-2 shrink-0">
          {actions}

          {/* モバイル用展開ボタン（説明文がある場合のみ） */}
          {description && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="md:hidden p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 transition-colors"
              aria-label={expanded ? '説明を閉じる' : '説明を表示'}
            >
              {expanded ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* モバイル用説明文（折りたたみ） */}
      {description && expanded && (
        <div className="md:hidden mt-2 p-3 bg-zinc-50 rounded-lg animate-slide-down">
          <p className="text-sm text-zinc-600">{description}</p>
        </div>
      )}
    </div>
  );
}

interface WarningBannerProps {
  warnings: string[];
  adminMessage?: string;
  isAdmin?: boolean;
  onDismiss?: () => void;
  className?: string;
}

/**
 * 警告バナー（必要時のみ表示）
 */
export function WarningBanner({
  warnings,
  adminMessage,
  isAdmin,
  onDismiss,
  className,
}: WarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (warnings.length === 0 || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div
      className={cn(
        'mb-4 p-3 md:p-4 bg-yellow-50 border border-yellow-200 rounded-lg',
        className
      )}
    >
      <div className="flex items-start gap-2 md:gap-3">
        <div className="shrink-0 w-5 h-5 mt-0.5 text-yellow-600">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-yellow-800 text-sm md:text-base">
            一部のデータ取得に問題があります
          </p>
          <ul className="mt-1 text-xs md:text-sm text-yellow-700 list-disc list-inside">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
          {isAdmin && adminMessage && (
            <p className="mt-2 text-xs text-yellow-600">{adminMessage}</p>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 rounded hover:bg-yellow-100 text-yellow-600"
            aria-label="閉じる"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
