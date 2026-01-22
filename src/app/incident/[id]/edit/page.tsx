'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getIncident, getBranches, getSettings, updateIncident } from '@/lib/firestore';
import { calculateScore } from '@/lib/scoring';
import { getTodayString } from '@/lib/utils';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Input, Textarea, Select, Card, CardContent } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  Branch,
  Category,
  CATEGORIES,
  TimeSlot,
  TIME_SLOTS,
  JobType,
  JOB_TYPES,
  Location,
  LOCATIONS,
  Severity,
  SEVERITY_LABELS,
  ScoringRule,
  DEFAULT_SCORING_RULES,
  IncidentTag,
  INCIDENT_TAGS,
  Incident,
} from '@/types';
import { AlertTriangle, ArrowLeft, Image as ImageIcon } from 'lucide-react';

export default function EditIncidentPage() {
  return (
    <AuthGuard>
      <EditIncidentContent />
    </AuthGuard>
  );
}

function EditIncidentContent() {
  const params = useParams();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const incidentId = params.id as string;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [scoringRules, setScoringRules] = useState<ScoringRule[]>(DEFAULT_SCORING_RULES);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accessError, setAccessError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    date: '',
    timeSlot: '' as TimeSlot | '',
    branchId: '',
    jobType: '' as JobType | '',
    category: '' as Category | '',
    severity: '' as string,
    body: '',
    action: '',
    prevention: '',
    location: '' as Location | '',
    tags: [] as string[],
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        const [incidentData, branchesData, settingsData] = await Promise.all([
          getIncident(incidentId),
          getBranches(),
          getSettings(),
        ]);

        if (!incidentData) {
          setAccessError('投稿が見つかりません');
          return;
        }

        // 自分の投稿かチェック
        if (incidentData.userId !== user.id) {
          setAccessError('この投稿を編集する権限がありません');
          return;
        }

        setIncident(incidentData);
        setBranches(branchesData);
        if (settingsData?.scoringRules) {
          setScoringRules(settingsData.scoringRules);
        }

        // フォームに既存データを設定
        setFormData({
          date: incidentData.date,
          timeSlot: incidentData.timeSlot,
          branchId: incidentData.branchId,
          jobType: incidentData.jobType,
          category: incidentData.category,
          severity: String(incidentData.severity),
          body: incidentData.body,
          action: incidentData.action || '',
          prevention: incidentData.prevention || '',
          location: incidentData.location || '',
          tags: incidentData.tags || [],
        });
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setAccessError('データの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [incidentId, user]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.date) {
      newErrors.date = '発生日を入力してください';
    }
    if (!formData.timeSlot) {
      newErrors.timeSlot = '時間帯を選択してください';
    }
    if (!formData.branchId) {
      newErrors.branchId = '事業所を選択してください';
    }
    if (!formData.jobType) {
      newErrors.jobType = '職種を選択してください';
    }
    if (!formData.category) {
      newErrors.category = 'カテゴリを選択してください';
    }
    if (!formData.severity) {
      newErrors.severity = '重大度を選択してください';
    }
    if (!formData.body.trim()) {
      newErrors.body = '本文を入力してください';
    } else if (formData.body.trim().length < 10) {
      newErrors.body = '本文は10文字以上入力してください';
    } else if (formData.body.trim().length > 2000) {
      newErrors.body = '本文は2000文字以内で入力してください';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleToggleTag = (tag: IncidentTag) => {
    setFormData((prev) => {
      if (prev.tags.includes(tag)) {
        return { ...prev, tags: prev.tags.filter((t) => t !== tag) };
      }
      if (prev.tags.length >= 5) {
        return prev;
      }
      return { ...prev, tags: [...prev.tags, tag] };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !user || !incident) return;

    setSubmitting(true);
    setErrors({});

    try {
      // スコア再計算（画像は既存のものを維持）
      const bodyLength = formData.body.trim().length;
      const totalLength =
        bodyLength +
        (formData.action?.trim().length || 0) +
        (formData.prevention?.trim().length || 0);

      const scoreResult = calculateScore(
        {
          bodyLength,
          severity: parseInt(formData.severity, 10),
          hasAction: !!formData.action?.trim(),
          hasPrevention: !!formData.prevention?.trim(),
          hasImage: incident.hasImage,
        },
        totalLength,
        scoringRules
      );

      // インシデント更新
      await updateIncident(incidentId, user.id, {
        date: formData.date,
        timeSlot: formData.timeSlot as TimeSlot,
        category: formData.category as Category,
        severity: parseInt(formData.severity, 10) as Severity,
        body: formData.body.trim(),
        action: formData.action?.trim() || undefined,
        prevention: formData.prevention?.trim() || undefined,
        location: formData.location || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        bodyLength: scoreResult.bodyLength,
        totalLength: scoreResult.totalLength,
        scoreTotal: scoreResult.scoreTotal,
        scoreBreakdown: scoreResult.scoreBreakdown,
      });

      router.push(`/incident/${incidentId}`);
    } catch (error) {
      console.error('Failed to update incident:', error);
      setErrors({ submit: '更新に失敗しました。もう一度お試しください' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  if (accessError || !incident) {
    return (
      <>
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">{accessError || '投稿が見つかりません'}</p>
              <Button onClick={() => router.push('/dashboard')}>
                ダッシュボードに戻る
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="pb-24">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center mb-6">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="ml-2 text-xl font-bold text-gray-900">ヒヤリハット編集</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 発生日時 */}
            <Card>
              <CardContent className="space-y-4">
                <h2 className="font-semibold text-gray-900">発生日時</h2>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="発生日"
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    error={errors.date}
                    required
                    max={getTodayString()}
                  />
                  <Select
                    label="時間帯"
                    name="timeSlot"
                    value={formData.timeSlot}
                    onChange={(e) => setFormData({ ...formData, timeSlot: e.target.value as TimeSlot })}
                    error={errors.timeSlot}
                    required
                    placeholder="選択"
                    options={TIME_SLOTS.map((ts) => ({
                      value: ts.value,
                      label: `${ts.label} (${ts.range})`,
                    }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 基本情報 */}
            <Card>
              <CardContent className="space-y-4">
                <h2 className="font-semibold text-gray-900">基本情報</h2>

                {/* 事業所は編集不可（表示のみ） */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    事業所
                  </label>
                  <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-700">
                    {branches.find((b) => b.id === formData.branchId)?.name || '未設定'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">事業所は変更できません</p>
                </div>

                <Select
                  label="職種"
                  name="jobType"
                  value={formData.jobType}
                  onChange={(e) => setFormData({ ...formData, jobType: e.target.value as JobType })}
                  error={errors.jobType}
                  required
                  placeholder="選択"
                  options={JOB_TYPES.map((jt) => ({ value: jt, label: jt }))}
                />

                <Select
                  label="カテゴリ"
                  name="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as Category })}
                  error={errors.category}
                  required
                  placeholder="選択"
                  options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    重大度 <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {([1, 2, 3, 4, 5] as Severity[]).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setFormData({ ...formData, severity: String(level) })}
                        className={`p-3 rounded-lg border text-center transition-colors ${
                          formData.severity === String(level)
                            ? level >= 4
                              ? 'border-red-500 bg-red-50 text-red-700'
                              : 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="block text-lg font-bold">{level}</span>
                      </button>
                    ))}
                  </div>
                  {formData.severity && (
                    <p className="mt-2 text-sm text-gray-600">
                      {SEVERITY_LABELS[parseInt(formData.severity, 10) as Severity]}
                    </p>
                  )}
                  {errors.severity && (
                    <p className="mt-1 text-sm text-red-500">{errors.severity}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 詳細 */}
            <Card>
              <CardContent className="space-y-4">
                <h2 className="font-semibold text-gray-900">詳細</h2>

                <Textarea
                  label="本文"
                  name="body"
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  error={errors.body}
                  required
                  placeholder="何が起きたか、どのような状況だったかを詳しく記載してください"
                  rows={5}
                  showCount
                  maxCount={2000}
                />

                <Textarea
                  label="回避行動（任意）"
                  name="action"
                  value={formData.action}
                  onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                  placeholder="事故を回避するためにとった行動があれば記載してください"
                  rows={3}
                  showCount
                  maxCount={1000}
                  hint="+5ポイント"
                />

                <Textarea
                  label="再発防止提案（任意）"
                  name="prevention"
                  value={formData.prevention}
                  onChange={(e) => setFormData({ ...formData, prevention: e.target.value })}
                  placeholder="同様の事故を防ぐための提案があれば記載してください"
                  rows={3}
                  showCount
                  maxCount={1000}
                  hint="+10ポイント"
                />

                <Select
                  label="場所（任意）"
                  name="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value as Location })}
                  placeholder="選択"
                  options={LOCATIONS.map((l) => ({ value: l, label: l }))}
                />

                {/* タグ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    タグ（選択任意、最大5つ）
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {INCIDENT_TAGS.map((tag) => {
                      const isSelected = formData.tags.includes(tag);
                      const isDisabled = !isSelected && formData.tags.length >= 5;
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleTag(tag)}
                          disabled={isDisabled}
                          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                            isSelected
                              ? 'bg-blue-500 text-white'
                              : isDisabled
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  {formData.tags.length > 0 && (
                    <p className="mt-2 text-sm text-gray-500">
                      選択中: {formData.tags.length}/5
                    </p>
                  )}
                </div>

                {/* 画像（編集不可、表示のみ） */}
                {incident.imageUrls && incident.imageUrls.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      添付画像
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {incident.imageUrls.map((url, index) => (
                        <div key={index} className="relative w-20 h-20">
                          <img
                            src={url}
                            alt={`添付画像 ${index + 1}`}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">画像は変更できません</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {errors.submit && (
              <div className="flex items-center p-4 bg-red-50 rounded-lg border border-red-200">
                <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
                <p className="text-sm text-red-700">{errors.submit}</p>
              </div>
            )}
          </form>
        </div>
      </main>

      {/* 固定フッター */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-area-inset-bottom">
        <div className="max-w-2xl mx-auto flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="flex-1"
          >
            キャンセル
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            className="flex-1"
            size="lg"
          >
            更新する
          </Button>
        </div>
      </div>
    </>
  );
}
