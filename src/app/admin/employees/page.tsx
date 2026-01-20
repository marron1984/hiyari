'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { BRANCHES_SEED, DIVISIONS_SEED, EMPLOYEES_SEED, EmployeeSeed } from '@/data/employees';
import { db, DEFAULT_TENANT_ID } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';

interface Employee {
  id: string;
  name: string;
  employeeCode: string;
  branchId: string;
  branchName?: string;
  qualification: string;
  employmentType: string;
  notes: string;
}

export default function EmployeesPage() {
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Firestore から従業員一覧を取得
  const fetchEmployees = useCallback(async () => {
    if (!db) return;

    try {
      setLoading(true);
      const q = query(
        collection(db, 'employees'),
        where('tenantId', '==', DEFAULT_TENANT_ID)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Employee[];
      setEmployees(data);
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // シードデータを登録
  const handleSeedData = async () => {
    if (!db) {
      setMessage({ type: 'error', text: 'Firestore が初期化されていません' });
      return;
    }

    setSeeding(true);
    setMessage(null);

    try {
      const batch = writeBatch(db);

      // 事業部を登録
      for (const division of DIVISIONS_SEED) {
        const divisionRef = doc(db, 'divisions', division.id);
        batch.set(divisionRef, {
          ...division,
          createdAt: Timestamp.now(),
        });
      }

      // 拠点を登録
      for (const branch of BRANCHES_SEED) {
        const branchRef = doc(db, 'branches', branch.id);
        batch.set(branchRef, {
          ...branch,
          createdAt: Timestamp.now(),
        });
      }

      // 従業員を登録
      for (const emp of EMPLOYEES_SEED) {
        const empRef = doc(db, 'employees', emp.employeeCode);
        batch.set(empRef, {
          name: emp.name,
          employeeCode: emp.employeeCode,
          divisionId: emp.divisionId,           // 所属事業部
          defaultBranchId: emp.defaultBranchId, // デフォルト拠点
          branchId: emp.defaultBranchId,        // 後方互換性のため
          qualification: emp.qualification,
          employmentType: emp.employmentType,
          notes: emp.notes,
          age: emp.age,
          tenantId: DEFAULT_TENANT_ID,
          isActive: emp.notes !== '休職中',
          createdAt: Timestamp.now(),
        });
      }

      await batch.commit();

      setMessage({
        type: 'success',
        text: `${DIVISIONS_SEED.length}件の事業部、${BRANCHES_SEED.length}件の拠点、${EMPLOYEES_SEED.length}件の従業員を登録しました`,
      });
      await fetchEmployees();
    } catch (err) {
      console.error('Failed to seed data:', err);
      setMessage({ type: 'error', text: '登録に失敗しました' });
    } finally {
      setSeeding(false);
    }
  };

  if (!isAdmin) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <Header />
          <main className="max-w-4xl mx-auto px-4 py-6">
            <div className="text-center py-12">
              <p className="text-gray-600">このページは管理者のみアクセスできます</p>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  if (loading) {
    return <Loading />;
  }

  // 事業所ごとにグループ化
  const branchMap = new Map<string, string>(
    BRANCHES_SEED.map((b) => [b.id, b.name])
  );

  const employeesByBranch = employees.reduce((acc, emp) => {
    const branchName = branchMap.get(emp.branchId) || emp.branchId;
    if (!acc[branchName]) {
      acc[branchName] = [];
    }
    acc[branchName].push(emp);
    return acc;
  }, {} as Record<string, Employee[]>);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold">従業員管理</h1>
            <Button onClick={handleSeedData} disabled={seeding}>
              {seeding ? '登録中...' : '初期データを登録'}
            </Button>
          </div>

          {message && (
            <div
              className={`mb-6 px-4 py-3 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* 統計サマリー */}
          <Card className="mb-6">
            <div className="p-4">
              <h2 className="font-semibold mb-4">サマリー</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500">総従業員数</div>
                  <div className="text-2xl font-bold">{employees.length}名</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500">事業所数</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {Object.keys(employeesByBranch).length}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500">正社員・役員</div>
                  <div className="text-2xl font-bold text-green-600">
                    {employees.filter((e) => e.employmentType === '正社員' || e.employmentType === '役員').length}名
                  </div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500">パート</div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {employees.filter((e) => e.employmentType === 'パート').length}名
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* 事業所ごとの従業員一覧 */}
          {employees.length === 0 ? (
            <Card>
              <div className="p-8 text-center text-gray-500">
                <p className="mb-4">従業員データがまだ登録されていません</p>
                <p className="text-sm">「初期データを登録」ボタンをクリックして、シードデータを登録してください</p>
              </div>
            </Card>
          ) : (
            Object.entries(employeesByBranch).map(([branchName, emps]) => (
              <Card key={branchName} className="mb-4">
                <div className="p-4">
                  <h2 className="font-semibold mb-4">
                    {branchName}
                    <span className="ml-2 text-sm text-gray-500">({emps.length}名)</span>
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">従業員コード</th>
                          <th className="px-3 py-2 text-left">氏名</th>
                          <th className="px-3 py-2 text-left">資格</th>
                          <th className="px-3 py-2 text-left">雇用形態</th>
                          <th className="px-3 py-2 text-left">備考</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {emps.map((emp) => (
                          <tr key={emp.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-gray-600">
                              {emp.employeeCode}
                            </td>
                            <td className="px-3 py-2 font-medium">{emp.name}</td>
                            <td className="px-3 py-2">{emp.qualification}</td>
                            <td className="px-3 py-2">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  emp.employmentType === '役員'
                                    ? 'bg-purple-100 text-purple-700'
                                    : emp.employmentType === '正社員'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {emp.employmentType}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">{emp.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            ))
          )}

          {/* シードデータプレビュー（未登録時のみ） */}
          {employees.length === 0 && (
            <Card className="mt-6">
              <div className="p-4">
                <h2 className="font-semibold mb-4">登録予定データ（プレビュー）</h2>
                <div className="text-sm text-gray-600 mb-4">
                  以下のデータが「初期データを登録」で登録されます。
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {BRANCHES_SEED.map((branch) => {
                    const branchEmployees = EMPLOYEES_SEED.filter(
                      (e) => e.defaultBranchId === branch.id
                    );
                    return (
                      <div key={branch.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="font-medium mb-2">{branch.name}（拠点）</div>
                        <div className="text-sm text-gray-500">
                          {branchEmployees.length}名
                        </div>
                        <div className="mt-2 text-xs text-gray-400">
                          {branchEmployees.slice(0, 3).map((e) => e.name).join('、')}
                          {branchEmployees.length > 3 && ` 他${branchEmployees.length - 3}名`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
