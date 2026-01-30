'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider, DEFAULT_TENANT_ID } from '@/lib/firebase';
import { User, UserRole, JobType } from '@/types';
import { canApprove as checkCanApprove, canAccessAdmin, hasMinRole } from '@/lib/auth';
import { toDate } from '@/lib/date';

// 初期システム管理者のメールアドレス
const INITIAL_SYSTEM_ADMINS = [
  'yoshida@aska-g.com',
];

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  isOnboarded: boolean;
  isAdmin: boolean;           // admin以上
  isLeaderOrAbove: boolean;   // leader以上（管理画面アクセス可能）
  canApprove: (targetBranchId: string) => boolean;  // 承認権限チェック
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase未初期化の場合は早期リターン
    if (!auth || !db) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setFirebaseUser(firebaseUser);

      if (firebaseUser && db) {
        // Firestoreからユーザー情報を取得
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          let role = userData.role as UserRole || 'user';

          // 初期管理者の自動昇格チェック
          if (
            role === 'user' &&
            firebaseUser.email &&
            INITIAL_SYSTEM_ADMINS.includes(firebaseUser.email)
          ) {
            role = 'system_admin';
            // Firestoreも更新
            await setDoc(userRef, { role: 'system_admin' }, { merge: true });
          }

          setUser({
            id: firebaseUser.uid,
            name: userData.name || firebaseUser.displayName || '',
            email: firebaseUser.email || '',
            photoURL: userData.photoURL || firebaseUser.photoURL || undefined,
            role,
            branchId: userData.branchId || '',
            jobType: userData.jobType as JobType || '介護職',
            tenantId: userData.tenantId || DEFAULT_TENANT_ID,
            createdAt: toDate(userData.createdAt) || new Date(),
          });
        } else {
          // 新規ユーザー（オンボーディング前）
          setUser(null);
        }
      } else {
        setUser(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (!auth || !googleProvider) {
      throw new Error('Firebase not initialized');
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google sign in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    if (!auth) {
      throw new Error('Firebase not initialized');
    }
    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const updateUser = async (data: Partial<User>) => {
    if (!firebaseUser || !db) return;

    const userRef = doc(db, 'users', firebaseUser.uid);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      // 既存ユーザーの更新
      const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };

      // 初期管理者の自動昇格（一度だけ）
      const existingData = userDoc.data();
      if (
        existingData.role === 'user' &&
        firebaseUser.email &&
        INITIAL_SYSTEM_ADMINS.includes(firebaseUser.email)
      ) {
        updateData.role = 'system_admin';
      }

      await setDoc(userRef, updateData, { merge: true });
    } else {
      // 新規ユーザーの作成
      // 初期管理者のメールアドレスはsystem_adminに設定
      const isInitialAdmin = firebaseUser.email && INITIAL_SYSTEM_ADMINS.includes(firebaseUser.email);

      const newUser: Omit<User, 'id'> = {
        name: data.name || firebaseUser.displayName || '',
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || undefined,
        role: isInitialAdmin ? 'system_admin' : 'user',
        branchId: data.branchId || '',
        jobType: data.jobType || '介護職',
        tenantId: DEFAULT_TENANT_ID,
        createdAt: new Date(),
      };
      await setDoc(userRef, newUser);
    }

    // ローカル状態を更新
    const updatedDoc = await getDoc(userRef);
    if (updatedDoc.exists()) {
      const userData = updatedDoc.data();
      setUser({
        id: firebaseUser.uid,
        name: userData.name,
        email: userData.email,
        photoURL: userData.photoURL,
        role: userData.role,
        branchId: userData.branchId,
        jobType: userData.jobType,
        tenantId: userData.tenantId,
        createdAt: toDate(userData.createdAt) || new Date(),
      });
    }
  };

  const isOnboarded = !!user && !!user.branchId;
  const isAdmin = hasMinRole(user?.role, 'admin');
  const isLeaderOrAbove = canAccessAdmin(user?.role);

  // 承認権限チェック（対象事業所を指定）
  const canApprove = (targetBranchId: string): boolean => {
    return checkCanApprove(user?.role, user?.branchId, targetBranchId);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        loading,
        signInWithGoogle,
        signOut,
        updateUser,
        isOnboarded,
        isAdmin,
        isLeaderOrAbove,
        canApprove,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
