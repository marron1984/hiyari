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

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  isOnboarded: boolean;
  isAdmin: boolean;
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
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUser({
            id: firebaseUser.uid,
            name: userData.name || firebaseUser.displayName || '',
            email: firebaseUser.email || '',
            photoURL: userData.photoURL || firebaseUser.photoURL || undefined,
            role: userData.role as UserRole || 'user',
            branchId: userData.branchId || '',
            jobType: userData.jobType as JobType || '介護職',
            tenantId: userData.tenantId || DEFAULT_TENANT_ID,
            createdAt: userData.createdAt?.toDate() || new Date(),
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
      await setDoc(userRef, { ...data, updatedAt: new Date() }, { merge: true });
    } else {
      // 新規ユーザーの作成
      const newUser: Omit<User, 'id'> = {
        name: data.name || firebaseUser.displayName || '',
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || undefined,
        role: 'user',
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
        createdAt: userData.createdAt?.toDate() || new Date(),
      });
    }
  };

  const isOnboarded = !!user && !!user.branchId;
  const isAdmin = user?.role === 'admin' || user?.role === 'system_admin';

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
