'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getBranches } from '@/lib/firestore';
import { Branch, JOB_TYPES, JobType } from '@/types';
import { Button, Input, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { UserCircle } from 'lucide-react';

export default function OnboardingPage() {
  const { firebaseUser, user, loading, isOnboarded, updateUser } = useAuth();
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    name: '',
    branchId: '',
    jobType: '' as JobType | '',
  });

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.push('/login');
    }
    if (!loading && isOnboarded) {
      router.push('/dashboard');
    }
  }, [firebaseUser, loading, isOnboarded, router]);

  useEffect(() => {
    if (firebaseUser) {
      setFormData((prev) => ({
        ...prev,
        name: firebaseUser.displayName || '',
      }));
    }
  }, [firebaseUser]);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const data = await getBranches();
        setBranches(data);
      } catch (error) {
        console.error('Failed to fetch branches:', error);
      } finally {
        setLoadingBranches(false);
      }
    };
    fetchBranches();
  }, []);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = '表示名を入力してください';
    }
    if (!formData.branchId) {
      newErrors.branchId = '所属事業所を選択してください';
    }
    if (!formData.jobType) {
      newErrors.jobType = '職種を選択してください';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await updateUser({
        name: formData.name.trim(),
        branchId: formData.branchId,
        jobType: formData.jobType as JobType,
      });
      router.push('/dashboard');
    } catch (error) {
      console.error('Failed to update user:', error);
      setErrors({ submit: '登録に失敗しました。もう一度お試しください' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || loadingBranches) {
    return <Loading fullScreen text="読み込み中..." />;
  }

  if (!firebaseUser) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center">
            <UserCircle className="w-10 h-10 text-white" />
          </div>
        </div>
        <h1 className="text-center text-2xl font-bold text-gray-900">
          プロフィール設定
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          ご利用を開始するために、以下の情報を入力してください
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-lg sm:rounded-lg sm:px-10 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="表示名"
              name="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={errors.name}
              required
              placeholder="山田 太郎"
            />

            <Select
              label="所属事業所"
              name="branchId"
              value={formData.branchId}
              onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
              error={errors.branchId}
              required
              placeholder="選択してください"
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />

            {branches.length === 0 && !loadingBranches && (
              <p className="text-sm text-yellow-600">
                事業所が登録されていません。管理者にお問い合わせください。
              </p>
            )}

            <Select
              label="職種"
              name="jobType"
              value={formData.jobType}
              onChange={(e) => setFormData({ ...formData, jobType: e.target.value as JobType })}
              error={errors.jobType}
              required
              placeholder="選択してください"
              options={JOB_TYPES.map((jt) => ({ value: jt, label: jt }))}
            />

            {errors.submit && (
              <p className="text-sm text-red-600 text-center">{errors.submit}</p>
            )}

            <Button
              type="submit"
              loading={submitting}
              disabled={branches.length === 0}
              className="w-full"
              size="lg"
            >
              設定を完了する
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
