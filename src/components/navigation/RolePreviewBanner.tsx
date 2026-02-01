'use client';

import { useRole } from '@/contexts/RoleContext';
import { Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ロールプレビュー中のバナー表示
 * プレビューモード時に画面上部に表示
 */
export function RolePreviewBanner() {
  const { isPreviewMode, currentRole, roleInfo, exitPreviewMode, isActualAdmin } = useRole();

  // 管理者以外、またはプレビュー中でなければ表示しない
  if (!isActualAdmin || !isPreviewMode) {
    return null;
  }

  return (
    <div className="sticky top-14 z-40 bg-gradient-to-r from-amber-400 to-orange-400 text-white px-4 py-2 shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-1">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">プレビューモード</span>
          </div>
          <span className="text-sm">
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
              'bg-white/30 text-white'
            )}>
              {roleInfo.name}
            </span>
            <span className="ml-2 opacity-90">として表示中</span>
          </span>
        </div>
        <button
          onClick={exitPreviewMode}
          className="flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors"
        >
          <X className="w-4 h-4" />
          <span className="hidden sm:inline">終了</span>
        </button>
      </div>
    </div>
  );
}
