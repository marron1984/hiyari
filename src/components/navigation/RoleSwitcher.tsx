'use client';

import { useState, useRef, useEffect } from 'react';
import { useRole } from '@/contexts/RoleContext';
import { AppRole, ROLE_DISPLAY_INFO } from '@/config/appRoles';
import { Eye, EyeOff, ChevronDown, Check, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 管理者用ロール切り替えコンポーネント
 * 異なるロールでの表示をプレビュー可能
 */
export function RoleSwitcher() {
  const {
    currentRole,
    actualRole,
    isPreviewMode,
    setPreviewRole,
    exitPreviewMode,
    isActualAdmin,
  } = useRole();

  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 管理者以外には表示しない
  if (!isActualAdmin) {
    return null;
  }

  // 外側クリックでメニューを閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const roles: AppRole[] = ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'];

  const handleRoleSelect = (role: AppRole) => {
    if (role === actualRole) {
      exitPreviewMode();
    } else {
      setPreviewRole(role);
    }
    setIsOpen(false);
  };

  const currentRoleInfo = ROLE_DISPLAY_INFO[currentRole];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
          isPreviewMode
            ? 'bg-amber-100 text-amber-700 border border-amber-200'
            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
        )}
      >
        {isPreviewMode ? (
          <Eye className="w-4 h-4" />
        ) : (
          <Shield className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">
          {isPreviewMode ? `プレビュー: ${currentRoleInfo.name}` : '管理者'}
        </span>
        <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden z-50 animate-slide-down">
          <div className="p-3 border-b border-zinc-100 bg-zinc-50">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
              <Eye className="w-4 h-4" />
              ロールプレビュー
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              異なる権限での表示を確認できます
            </p>
          </div>

          <div className="p-2">
            {roles.map((role) => {
              const roleInfo = ROLE_DISPLAY_INFO[role];
              const isSelected = role === currentRole;
              const isActual = role === actualRole;

              return (
                <button
                  key={role}
                  onClick={() => handleRoleSelect(role)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                    isSelected
                      ? 'bg-zinc-100'
                      : 'hover:bg-zinc-50'
                  )}
                >
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    roleInfo.color
                  )}>
                    {roleInfo.name}
                  </span>
                  <span className="flex-1 text-xs text-zinc-500 truncate">
                    {roleInfo.description}
                  </span>
                  {isSelected && (
                    <Check className="w-4 h-4 text-green-600" />
                  )}
                  {isActual && !isSelected && (
                    <span className="text-xs text-zinc-400">実際</span>
                  )}
                </button>
              );
            })}
          </div>

          {isPreviewMode && (
            <div className="p-2 border-t border-zinc-100">
              <button
                onClick={() => {
                  exitPreviewMode();
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-100 rounded-lg text-sm text-zinc-700 hover:bg-zinc-200 transition-colors"
              >
                <EyeOff className="w-4 h-4" />
                プレビュー終了
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
