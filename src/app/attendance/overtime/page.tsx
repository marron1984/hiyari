'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card, Input, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  createOvertimeRequest,
  getOvertimeRequestsByUser,
} from '@/lib/attendance';
import { getTodayJST } from '@/lib/attendance-calc';
import { OvertimeRequest, OvertimeStatus } from '@/types/attendance';

const STATUS_LABELS: Record<OvertimeStatus, { label: string; color: string }> = {
  pending: { label: '承認待ち', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '承認済み', color: 'bg-green-100 text-green-700' },
  rejected: { label: '却下', color: 'bg-red-100 text-red-700' },
};

export default function OvertimeRequestPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // フォーム状態
  const [workDate, setWorkDate] = useState(getTodayJST());
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [reason, setReason] = useState('');

  // 申請一覧を取得
  const fetchRequests = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await getOvertimeRequestsByUser(user.id, user.tenantId);
      setRequests(data);
    } catch (err) {
      console.error('Failed to fetch overtime requests:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // 申請を送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
    if (totalMinutes <= 0) {
      setError('残業時間を入力してください');
      return;
    }
    if (!reason.trim()) {
      setError('理由を入力してください');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await createOvertimeRequest({
        tenantId: user.tenantId,
        branchId: user.branchId,
        userId: user.id,
        userName: user.name,
        employeeCode: user.email, // 仮のemployeeCode
        workDate,
        requestedMinutes: totalMinutes,
        reason: reason.trim(),
      });

      setSuccess('残業届を送信しました');
      setReason('');
      setHours('1');
      setMinutes('0');
      await fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : '申請に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="max-w-lg mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold">残業届</h1>
            <Button variant="secondary" onClick={() => router.push('/attendance')}>
              打刻に戻る
            </Button>
          </div>

          {/* 届出フォーム */}
          <Card className="mb-6">
            <div className="p-4">
              <h2 className="font-semibold mb-4">新規届出</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
                  {success}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    勤務日
                  </label>
                  <Input
                    type="date"
                    value={workDate}
                    onChange={(e) => setWorkDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    残業時間
                  </label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      className="w-20"
                      options={[...Array(8)].map((_, i) => ({
                        value: String(i),
                        label: String(i),
                      }))}
                    />
                    <span>時間</span>
                    <Select
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                      className="w-20"
                      options={[0, 15, 30, 45].map((m) => ({
                        value: String(m),
                        label: String(m),
                      }))}
                    />
                    <span>分</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    理由
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="残業の理由を入力してください"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full"
                >
                  {submitting ? '送信中...' : '届出する'}
                </Button>
              </form>
            </div>
          </Card>

          {/* 届出履歴 */}
          <Card>
            <div className="p-4">
              <h2 className="font-semibold mb-4">届出履歴</h2>

              {requests.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  届出履歴がありません
                </div>
              ) : (
                <div className="space-y-3">
                  {requests.map((request) => {
                    const statusInfo = STATUS_LABELS[request.status];
                    const hours = Math.floor(request.requestedMinutes / 60);
                    const mins = request.requestedMinutes % 60;

                    return (
                      <div
                        key={request.id}
                        className="border rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{request.workDate}</span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
                          >
                            {statusInfo.label}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          残業時間: {hours}時間{mins > 0 ? `${mins}分` : ''}
                        </div>
                        <div className="text-sm text-gray-500 mt-1 truncate">
                          {request.reason}
                        </div>
                        {request.status === 'rejected' && request.rejectionReason && (
                          <div className="text-sm text-red-600 mt-2">
                            却下理由: {request.rejectionReason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </main>
      </div>
    </AuthGuard>
  );
}
