'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import {
  ArrowLeft,
  GraduationCap,
  AlertTriangle,
} from 'lucide-react';
import type { TrainingCourse } from '@/lib/training/types';

export default function NewSessionPage() {
  const router = useRouter();

  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [courseId, setCourseId] = useState('');
  const [name, setName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [location, setLocation] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await fetch('/api/training/courses?active=true');
        const data = await res.json();
        setCourses(data.courses || []);
      } catch (err) {
        console.error('Failed to fetch courses:', err);
      }
    };
    fetchCourses();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!courseId || !name || !scheduledAt) {
      setError('コース、名前、開催日時は必須です');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/training/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          name,
          scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : null,
          location: location || null,
          instructorName: instructorName || null,
          notes: notes || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'セッションの作成に失敗しました');
        return;
      }

      router.push(`/dashboard/training/sessions/${data.session.id}`);
    } catch (err) {
      setError('セッションの作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/dashboard/training"
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">研修セッション作成</h1>
              <p className="text-sm text-zinc-500">新しい研修セッションを作成</p>
            </div>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* コース */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  研修コース <span className="text-red-500">*</span>
                </label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  required
                >
                  <option value="">コースを選択...</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* 名前 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  セッション名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: 2026年2月 身体拘束適正化研修"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  required
                />
              </div>

              {/* 開催日時 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  開催日時 <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  required
                />
              </div>

              {/* 時間・場所 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    所要時間（分）
                  </label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    placeholder="60"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    場所
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="例: 会議室A"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">追加情報（任意）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 講師 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  講師・担当
                </label>
                <input
                  type="text"
                  value={instructorName}
                  onChange={(e) => setInstructorName(e.target.value)}
                  placeholder="例: 研修委員会"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                />
              </div>

              {/* メモ */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  メモ
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="研修に関するメモ..."
                  rows={3}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3">
            <Link
              href="/dashboard/training"
              className="px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              キャンセル
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? '作成中...' : 'セッションを作成'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
