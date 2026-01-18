'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { storage, DEFAULT_TENANT_ID } from '@/lib/firebase';
import { createIncident, getBranches, checkFraud, getSettings } from '@/lib/firestore';
import { calculateScore } from '@/lib/scoring';
import { getTodayString } from '@/lib/utils';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Input, Textarea, Select, Card, CardContent } from '@/components/ui';
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
} from '@/types';
import { Camera, X, AlertTriangle } from 'lucide-react';

export default function SubmitPage() {
  return (
    <AuthGuard>
      <SubmitContent />
    </AuthGuard>
  );
}

function SubmitContent() {
  const { profile, isAdmin } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [scoringRules, setScoringRules] = useState<ScoringRule[]>(DEFAULT_SCORING_RULES);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    date: getTodayString(),
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

  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [branchesData, settingsData] = await Promise.all([
          getBranches(),
          getSettings(),
        ]);
        setBranches(branchesData);
        if (settingsData?.scoringRules) {
          setScoringRules(settingsData.scoringRules);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (profile && !formData.branchId) {
      setFormData((prev) => ({
        ...prev,
        branchId: profile.facility_id || '',
      }));
    }
  }, [profile, formData.branchId]);

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

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files).slice(0, 3 - images.length);
    const validFiles = newFiles.filter((file) => {
      if (!file.type.startsWith('image/')) {
        alert('画像ファイルのみアップロードできます');
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('画像サイズは5MB以下にしてください');
        return false;
      }
      return true;
    });

    setImages((prev) => [...prev, ...validFiles]);
    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreviews((prev) => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageRemove = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && formData.tags.length < 5 && !formData.tags.includes(tag)) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !profile) return;

    setSubmitting(true);
    setErrors({});

    try {
      // 不正チェック
      const fraudCheck = await checkFraud(profile.id, formData.body);

      // 画像アップロード
      const imageUrls: string[] = [];
      if (storage && images.length > 0) {
        for (const image of images) {
          const imageRef = ref(
            storage,
            `incidents/${profile.id}/${Date.now()}_${image.name}`
          );
          await uploadBytes(imageRef, image);
          const url = await getDownloadURL(imageRef);
          imageUrls.push(url);
        }
      }

      // スコア計算
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
          hasImage: imageUrls.length > 0,
        },
        totalLength,
        scoringRules
      );

      // インシデント作成
      const incidentId = await createIncident({
        tenantId: DEFAULT_TENANT_ID,
        branchId: formData.branchId,
        userId: profile.id,
        userName: profile.display_name || '',
        date: formData.date,
        timeSlot: formData.timeSlot as TimeSlot,
        jobType: formData.jobType as JobType,
        category: formData.category as Category,
        severity: parseInt(formData.severity, 10) as Severity,
        body: formData.body.trim(),
        action: formData.action?.trim() || undefined,
        prevention: formData.prevention?.trim() || undefined,
        location: formData.location || undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        hasImage: imageUrls.length > 0,
        bodyLength: scoreResult.bodyLength,
        totalLength: scoreResult.totalLength,
        scoreTotal: scoreResult.scoreTotal,
        scoreBreakdown: scoreResult.scoreBreakdown,
        fraudFlag: fraudCheck.isFraud,
        fraudReason: fraudCheck.reason,
      });

      router.push(`/incident/${incidentId}`);
    } catch (error) {
      console.error('Failed to submit incident:', error);
      setErrors({ submit: '投稿に失敗しました。もう一度お試しください' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-pulse text-gray-500">読み込み中...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="pb-24">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className="text-xl font-bold text-gray-900 mb-6">ヒヤリハット報告</h1>

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

                {isAdmin ? (
                  <Select
                    label="事業所"
                    name="branchId"
                    value={formData.branchId}
                    onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                    error={errors.branchId}
                    required
                    placeholder="選択"
                    options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  />
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      事業所
                    </label>
                    <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-700">
                      {branches.find((b) => b.id === formData.branchId)?.name || '未設定'}
                    </p>
                  </div>
                )}

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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    タグ（任意、最大5つ）
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="タグを入力"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddTag}
                      disabled={formData.tags.length >= 5}
                    >
                      追加
                    </Button>
                  </div>
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2 py-1 bg-gray-100 rounded text-sm"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-1 text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 画像 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    画像（任意、最大3枚） <span className="text-xs text-gray-500">+5ポイント</span>
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative w-20 h-20">
                        <img
                          src={preview}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => handleImageRemove(index)}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {images.length < 3 && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500"
                      >
                        <Camera className="w-6 h-6" />
                        <span className="text-xs mt-1">追加</span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageAdd}
                    className="hidden"
                  />
                </div>
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
        <div className="max-w-2xl mx-auto">
          <Button
            onClick={handleSubmit}
            loading={submitting}
            className="w-full"
            size="lg"
          >
            投稿する
          </Button>
        </div>
      </div>
    </>
  );
}
