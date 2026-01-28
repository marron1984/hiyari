'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { getUpcomingBirthdays } from '@/lib/resident';
import { getUsers } from '@/lib/firestore';
import { ResidentWithDocStats, calculateAge, getDaysUntilBirthday } from '@/types/resident';
import { User } from '@/types';
import {
  Cake,
  Users,
  Briefcase,
  Building2,
  Calendar,
  ArrowRight,
  Bell,
  Gift,
  PartyPopper,
} from 'lucide-react';

type TargetFilter = 'all' | 'residents' | 'employees';

export default function BirthdayAlertsPage() {
  return (
    <AuthGuard>
      <BirthdayAlertsContent />
    </AuthGuard>
  );
}

function BirthdayAlertsContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [residents, setResidents] = useState<ResidentWithDocStats[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [daysRange, setDaysRange] = useState(30);
  const [targetFilter, setTargetFilter] = useState<TargetFilter>('all');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [birthdaysData, usersData] = await Promise.all([
        getUpcomingBirthdays(user.tenantId, daysRange),
        getUsers(),
      ]);
      setResidents(birthdaysData.residents);

      // 従業員の誕生日フィルタ
      const employeesWithBirthday = usersData.filter((u) => {
        if (!u.birthDate) return false;
        const birthDate = u.birthDate instanceof Date ? u.birthDate : new Date(u.birthDate);
        const days = getDaysUntilBirthday(birthDate);
        return days <= daysRange;
      });
      setEmployees(employeesWithBirthday);
    } catch (err) {
      console.error('Failed to fetch birthdays:', err);
    } finally {
      setLoading(false);
    }
  }, [user, daysRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 統合リスト
  const allBirthdays = useMemo(() => {
    const items: {
      id: string;
      type: 'resident' | 'employee';
      name: string;
      birthDate: Date;
      age: number;
      daysUntil: number;
      location?: string;
    }[] = [];

    // 入居者
    if (targetFilter !== 'employees') {
      residents.forEach((r) => {
        if (r.birthDate) {
          const birthDate = r.birthDate instanceof Date ? r.birthDate : new Date(r.birthDate);
          items.push({
            id: r.id,
            type: 'resident',
            name: r.name,
            birthDate,
            age: calculateAge(birthDate),
            daysUntil: r.daysUntilBirthday || 0,
            location: r.facilityName,
          });
        }
      });
    }

    // 従業員
    if (targetFilter !== 'residents') {
      employees.forEach((e) => {
        if (e.birthDate) {
          const birthDate = e.birthDate instanceof Date ? e.birthDate : new Date(e.birthDate);
          items.push({
            id: e.id,
            type: 'employee',
            name: e.name,
            birthDate,
            age: calculateAge(birthDate),
            daysUntil: getDaysUntilBirthday(birthDate),
            location: e.department,
          });
        }
      });
    }

    // 日数でソート
    items.sort((a, b) => a.daysUntil - b.daysUntil);

    return items;
  }, [residents, employees, targetFilter]);

  // 今日の誕生日
  const todayBirthdays = useMemo(() => {
    return allBirthdays.filter((b) => b.daysUntil === 0);
  }, [allBirthdays]);

  // 今週の誕生日
  const thisWeekBirthdays = useMemo(() => {
    return allBirthdays.filter((b) => b.daysUntil > 0 && b.daysUntil <= 7);
  }, [allBirthdays]);

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Cake className="w-6 h-6 text-pink-500" />
                誕生日アラート
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                入居者・従業員の誕生日を管理
              </p>
            </div>
          </div>

          {/* 今日の誕生日（目立つ表示） */}
          {todayBirthdays.length > 0 && (
            <Card className="mb-6 bg-gradient-to-r from-pink-50 to-purple-50 border-pink-200">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <PartyPopper className="w-8 h-8 text-pink-500" />
                  <h2 className="text-xl font-bold text-pink-700">
                    今日は誕生日です!
                  </h2>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {todayBirthdays.map((b) => (
                    <Link
                      key={b.id}
                      href={
                        b.type === 'resident'
                          ? `/dashboard/residents/${b.id}`
                          : '#'
                      }
                      className="flex items-center gap-4 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center">
                        <Gift className="w-6 h-6 text-pink-500" />
                      </div>
                      <div>
                        <p className="font-bold text-lg">{b.name}</p>
                        <p className="text-sm text-gray-500">
                          {b.age}歳になりました!
                          {b.location && ` / ${b.location}`}
                        </p>
                      </div>
                      <Badge
                        className={
                          b.type === 'resident'
                            ? 'bg-blue-50 text-blue-600 ml-auto'
                            : 'bg-green-50 text-green-600 ml-auto'
                        }
                      >
                        {b.type === 'resident' ? '入居者' : '従業員'}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* フィルター */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">期間:</span>
                  <Select
                    value={String(daysRange)}
                    onChange={(e) => setDaysRange(parseInt(e.target.value))}
                    options={[
                      { value: '7', label: '7日以内' },
                      { value: '14', label: '14日以内' },
                      { value: '30', label: '30日以内' },
                      { value: '60', label: '60日以内' },
                      { value: '90', label: '90日以内' },
                    ]}
                    className="w-28"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">対象:</span>
                  <Select
                    value={targetFilter}
                    onChange={(e) => setTargetFilter(e.target.value as TargetFilter)}
                    options={[
                      { value: 'all', label: '全員' },
                      { value: 'residents', label: '入居者のみ' },
                      { value: 'employees', label: '従業員のみ' },
                    ]}
                    className="w-32"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 今週の誕生日 */}
          {thisWeekBirthdays.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="w-5 h-5 text-yellow-500" />
                  今週の誕生日
                  <Badge className="bg-yellow-50 text-yellow-600">
                    {thisWeekBirthdays.length}名
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {thisWeekBirthdays.map((b) => (
                    <BirthdayRow key={b.id} birthday={b} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 全リスト */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cake className="w-5 h-5" />
                誕生日一覧（{daysRange}日以内）
                <Badge>{allBirthdays.length}名</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allBirthdays.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Cake className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>{daysRange}日以内に誕生日の方はいません</p>
                </div>
              ) : (
                <div className="divide-y">
                  {allBirthdays.map((b) => (
                    <BirthdayRow key={b.id} birthday={b} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function BirthdayRow({
  birthday,
}: {
  birthday: {
    id: string;
    type: 'resident' | 'employee';
    name: string;
    birthDate: Date;
    age: number;
    daysUntil: number;
    location?: string;
  };
}) {
  const href =
    birthday.type === 'resident'
      ? `/dashboard/residents/${birthday.id}`
      : '#';

  return (
    <Link
      href={href}
      className="block py-4 hover:bg-gray-50 -mx-4 px-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              birthday.daysUntil === 0
                ? 'bg-pink-100'
                : birthday.daysUntil <= 7
                ? 'bg-yellow-100'
                : 'bg-gray-100'
            }`}
          >
            {birthday.type === 'resident' ? (
              <Users className="w-5 h-5 text-gray-500" />
            ) : (
              <Briefcase className="w-5 h-5 text-gray-500" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{birthday.name}</span>
              <Badge
                className={
                  birthday.type === 'resident'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-green-50 text-green-600'
                }
              >
                {birthday.type === 'resident' ? '入居者' : '従業員'}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>
                {birthday.birthDate.toLocaleDateString('ja-JP', {
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
              <span>{birthday.age + 1}歳になります</span>
              {birthday.location && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {birthday.location}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge
            className={
              birthday.daysUntil === 0
                ? 'bg-pink-100 text-pink-600'
                : birthday.daysUntil <= 7
                ? 'bg-yellow-100 text-yellow-600'
                : 'bg-gray-100 text-gray-600'
            }
          >
            {birthday.daysUntil === 0
              ? '今日!'
              : `${birthday.daysUntil}日後`}
          </Badge>
          <ArrowRight className="w-4 h-4 text-gray-400" />
        </div>
      </div>
    </Link>
  );
}
