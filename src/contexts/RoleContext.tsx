'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  AppRole,
  ROLE_DISPLAY_INFO,
  getFilteredMenu,
  hasPermission,
  ROLE_HOME_PAGE,
  MenuItem,
  FeaturePermission,
} from '@/config/appRoles';
import { useAuth } from './AuthContext';

/**
 * ロールコンテキストの型定義
 */
interface RoleContextType {
  // 現在のロール（プレビュー中はプレビューロール）
  currentRole: AppRole;
  // 実際のユーザーロール
  actualRole: AppRole;
  // プレビューモードかどうか
  isPreviewMode: boolean;
  // プレビューモードの切り替え
  setPreviewRole: (role: AppRole | null) => void;
  // プレビューモードの終了
  exitPreviewMode: () => void;
  // ロール表示情報
  roleInfo: typeof ROLE_DISPLAY_INFO[AppRole];
  // フィルタリングされたメニュー
  filteredMenu: MenuItem[];
  // 権限チェック
  can: (permission: keyof FeaturePermission) => boolean;
  // ホームページパス
  homePage: string;
  // 管理者かどうか（プレビュー中も実際のロールで判定）
  isActualAdmin: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

/**
 * UserRoleからAppRoleへの変換マップ
 */
function mapUserRoleToAppRole(userRole?: string): AppRole {
  switch (userRole) {
    case 'system_admin':
    case 'admin':
      return 'admin';
    case 'leader':
      return 'leader';
    case 'user':
    default:
      return 'staff';
  }
}

/**
 * ロールプロバイダー
 */
export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // 実際のユーザーロール
  const actualRole = mapUserRoleToAppRole(user?.role);

  // プレビューロール（nullの場合はプレビューなし）
  const [previewRole, setPreviewRoleState] = useState<AppRole | null>(null);

  // LocalStorageからプレビューロールを復元
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('rolePreview');
      if (stored && actualRole === 'admin') {
        try {
          const parsed = JSON.parse(stored) as AppRole;
          if (ROLE_DISPLAY_INFO[parsed]) {
            setPreviewRoleState(parsed);
          }
        } catch {
          localStorage.removeItem('rolePreview');
        }
      }
    }
  }, [actualRole]);

  // プレビューロールの設定
  const setPreviewRole = useCallback((role: AppRole | null) => {
    // 管理者のみプレビュー可能
    if (actualRole !== 'admin') return;

    if (role === null) {
      setPreviewRoleState(null);
      localStorage.removeItem('rolePreview');
    } else {
      setPreviewRoleState(role);
      localStorage.setItem('rolePreview', JSON.stringify(role));
    }
  }, [actualRole]);

  // プレビューモードの終了
  const exitPreviewMode = useCallback(() => {
    setPreviewRoleState(null);
    localStorage.removeItem('rolePreview');
  }, []);

  // 現在のロール（プレビュー中はプレビューロール）
  const currentRole = previewRole ?? actualRole;
  const isPreviewMode = previewRole !== null;
  const isActualAdmin = actualRole === 'admin';

  // ロール情報
  const roleInfo = ROLE_DISPLAY_INFO[currentRole];

  // フィルタリングされたメニュー
  const filteredMenu = getFilteredMenu(currentRole);

  // 権限チェック
  const can = useCallback(
    (permission: keyof FeaturePermission) => hasPermission(currentRole, permission),
    [currentRole]
  );

  // ホームページ
  const homePage = ROLE_HOME_PAGE[currentRole];

  return (
    <RoleContext.Provider
      value={{
        currentRole,
        actualRole,
        isPreviewMode,
        setPreviewRole,
        exitPreviewMode,
        roleInfo,
        filteredMenu,
        can,
        homePage,
        isActualAdmin,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

/**
 * ロールコンテキストフック
 */
export function useRole() {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}

/**
 * 現在のロールがメニュー項目にアクセス可能かチェックするフック
 */
export function useMenuAccess(menuId: string): boolean {
  const { filteredMenu } = useRole();

  // フラット化して検索
  const flatMenu: MenuItem[] = [];
  const flatten = (items: MenuItem[]) => {
    items.forEach((item) => {
      flatMenu.push(item);
      if (item.children) {
        flatten(item.children);
      }
    });
  };
  flatten(filteredMenu);

  return flatMenu.some((item) => item.id === menuId);
}
