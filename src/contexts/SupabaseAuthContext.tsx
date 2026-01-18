'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile, UserRole, Facility, Organization } from '@/types/database';

interface AuthContextType {
  supabaseUser: SupabaseUser | null;
  session: Session | null;
  profile: Profile | null;
  facility: Facility | null;
  organization: Organization | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  isOnboarded: boolean;
  isAdmin: boolean;
  isHqOrAbove: boolean;
  isAreaManagerOrAbove: boolean;
  isFacilityManagerOrAbove: boolean;
  isServiceChiefOrAbove: boolean;
  isManagerOrAbove: boolean; // 互換性維持（service_chief以上）
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [facility, setFacility] = useState<Facility | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  // プロファイル取得
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          // プロファイルが存在しない（新規ユーザー）
          setProfile(null);
          return;
        }
        throw profileError;
      }

      setProfile(profileData);

      // 事業所と組織も取得
      if (profileData.facility_id) {
        const { data: facilityData } = await supabase
          .from('facilities')
          .select('*')
          .eq('id', profileData.facility_id)
          .single();
        setFacility(facilityData);
      }

      if (profileData.organization_id) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', profileData.organization_id)
          .single();
        setOrganization(orgData);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfile(null);
    }
  }, []);

  // セッション変更の監視
  useEffect(() => {
    // 初期セッション取得
    const initSession = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);
        setSupabaseUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          await fetchProfile(currentSession.user.id);
        }
      } catch (error) {
        console.error('Error getting session:', error);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    // 認証状態の変更を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log('Auth state changed:', event);
        setSession(newSession);
        setSupabaseUser(newSession?.user ?? null);

        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
          setFacility(null);
          setOrganization(null);
        }

        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Googleログイン
  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error('Google sign in error:', error);
      throw error;
    }
  };

  // ログアウト
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setProfile(null);
      setFacility(null);
      setOrganization(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  // プロファイル更新
  const updateProfile = async (data: Partial<Profile>) => {
    if (!supabaseUser) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', supabaseUser.id);

      if (error) throw error;

      // プロファイルを再取得
      await fetchProfile(supabaseUser.id);
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  };

  // プロファイル再取得
  const refreshProfile = async () => {
    if (supabaseUser) {
      await fetchProfile(supabaseUser.id);
    }
  };

  // 権限チェック（5段階ロール階層）
  // staff < service_chief < facility_manager < area_manager < hq < admin
  const isOnboarded = !!profile && !!profile.facility_id && !!profile.organization_id;
  const isAdmin = profile?.role === 'admin';
  const isHqOrAbove = ['hq', 'admin'].includes(profile?.role || '');
  const isAreaManagerOrAbove = ['area_manager', 'hq', 'admin'].includes(profile?.role || '');
  const isFacilityManagerOrAbove = ['facility_manager', 'area_manager', 'hq', 'admin'].includes(profile?.role || '');
  const isServiceChiefOrAbove = ['service_chief', 'facility_manager', 'area_manager', 'hq', 'admin'].includes(profile?.role || '');
  // 互換性維持: isManagerOrAbove = service_chief以上
  const isManagerOrAbove = isServiceChiefOrAbove;

  return (
    <AuthContext.Provider
      value={{
        supabaseUser,
        session,
        profile,
        facility,
        organization,
        loading,
        signInWithGoogle,
        signOut,
        updateProfile,
        refreshProfile,
        isOnboarded,
        isAdmin,
        isHqOrAbove,
        isAreaManagerOrAbove,
        isFacilityManagerOrAbove,
        isServiceChiefOrAbove,
        isManagerOrAbove,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useSupabaseAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
  }
  return context;
}

// 互換性のためのエイリアス
export const useAuth = useSupabaseAuth;
