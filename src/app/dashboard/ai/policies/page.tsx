'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import { isAiVpOwner } from '@/lib/auth';
import {
  AiTemplate,
  AiPolicy,
  AiReplyRiskLevel,
  AiReplyCategory,
  AI_REPLY_RISK_LABELS,
  AI_REPLY_RISK_COLORS,
  AI_REPLY_CATEGORY_LABELS,
} from '@/types/ai-vp';
import {
  Bot,
  ArrowLeft,
  Shield,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Settings,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';

// 初期FAQテンプレート（20本）
const INITIAL_TEMPLATES: AiTemplate[] = [
  // L1テンプレート（自動返信OK）
  {
    id: 'tpl_001',
    key: 'ops_document_submit',
    title: '書類提出方法',
    category: 'ops',
    riskLevel: 'L1',
    templateText: '書類の提出方法をご案内します。\n\n1. DHPハブにログイン\n2. 「書類提出」メニューを選択\n3. 必要書類をアップロード\n\n不明点は管理者にお問い合わせください。',
    keywords: ['書類', '提出', 'アップロード', 'どこに'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_002',
    key: 'ops_attendance_fix',
    title: '打刻修正方法',
    category: 'ops',
    riskLevel: 'L1',
    templateText: '打刻修正の手順をご案内します。\n\n1. 勤怠画面で「修正申請」を選択\n2. 修正理由を入力\n3. 管理者承認後に反映\n\n誤打刻が多い場合は管理者に相談してください。',
    keywords: ['打刻', '修正', '勤怠', '間違え'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_003',
    key: 'ops_shift_check',
    title: 'シフト確認方法',
    category: 'ops',
    riskLevel: 'L1',
    templateText: 'シフトの確認方法をご案内します。\n\n1. DHPハブの「勤怠」メニュー\n2. カレンダー表示でシフト確認\n3. 希望変更は管理者へ連絡\n\n急な変更は直接ご連絡ください。',
    keywords: ['シフト', '確認', '予定', 'スケジュール'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_004',
    key: 'nyukyo_required_docs',
    title: '入居必要書類案内',
    category: 'nyukyo',
    riskLevel: 'L1',
    templateText: '入居に必要な書類は以下の通りです。\n\n■ 必須書類\n・身分証明書（写真付き）\n・健康保険証\n・介護保険証\n・診断書（3ヶ月以内）\n\n■ 該当者のみ\n・生活保護受給証明書\n・後見人関係書類\n\n詳細は担当者にご確認ください。',
    keywords: ['書類', '必要', '入居', '準備'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_005',
    key: 'nyukyo_tour_guide',
    title: '見学案内',
    category: 'nyukyo',
    riskLevel: 'L1',
    templateText: '見学についてご案内します。\n\n■ 見学可能時間\n10:00〜16:00（要予約）\n\n■ 所要時間\n約1時間\n\n■ 持ち物\n特になし\n\n日程調整は担当者にご連絡ください。',
    keywords: ['見学', '案内', '予約', 'ツアー'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_006',
    key: 'ops_password_reset',
    title: 'パスワードリセット',
    category: 'ops',
    riskLevel: 'L1',
    templateText: 'パスワードのリセット方法をご案内します。\n\n1. ログイン画面で「パスワードを忘れた」を選択\n2. 登録メールアドレスを入力\n3. 届いたメールのリンクから再設定\n\nメールが届かない場合は管理者にご連絡ください。',
    keywords: ['パスワード', 'リセット', 'ログイン', '忘れた'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_007',
    key: 'ops_system_trouble',
    title: 'システムトラブル対応',
    category: 'ops',
    riskLevel: 'L1',
    templateText: 'システムトラブル時の対応をご案内します。\n\n■ まず試すこと\n1. ブラウザの更新（F5キー）\n2. キャッシュクリア\n3. 別ブラウザで試す\n\n解決しない場合は管理者に連絡してください。',
    keywords: ['システム', 'トラブル', 'エラー', '動かない'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_008',
    key: 'general_consultation',
    title: '相談受付',
    category: 'general',
    riskLevel: 'L1',
    requiredFieldsJson: JSON.stringify(['相談内容', '緊急度']),
    templateText: 'ご相談ありがとうございます。\n\n内容を確認し、適切な担当者におつなぎします。\n\n■ 確認させてください\n・具体的な内容\n・緊急度（すぐ/今日中/今週中）\n\nお待ちください。',
    keywords: ['相談', '聞きたい', '確認', '質問'],
    createdAt: new Date(),
  },

  // L2テンプレート（管理者承認）
  {
    id: 'tpl_009',
    key: 'sales_referral_reply',
    title: '紹介会社への返信',
    category: 'sales',
    riskLevel: 'L2',
    templateText: '紹介会社への返信文案です。\n\n---\nいつもお世話になっております。\nご紹介いただいた件、以下の通りご報告いたします。\n\n[報告内容を記載]\n\n引き続きよろしくお願いいたします。\n---\n\n※ 管理者確認後に送信します。',
    keywords: ['紹介会社', '返信', '連絡', '報告'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_010',
    key: 'sales_family_contact',
    title: 'ご家族への連絡',
    category: 'sales',
    riskLevel: 'L2',
    templateText: 'ご家族への連絡文案です。\n\n---\n○○様\n\nいつもお世話になっております。\n[連絡内容を記載]\n\nご不明点がございましたらお気軽にお問い合わせください。\n---\n\n※ 管理者確認後に送信します。',
    keywords: ['家族', '連絡', 'ご家族', '報告'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_011',
    key: 'expense_small_purchase',
    title: '小口購入の確認',
    category: 'expense',
    riskLevel: 'L2',
    templateText: '小口購入についてご案内します。\n\n■ 1万円未満の場合\n・事後報告で対応可能\n・レシート保管必須\n\n■ 1万円以上の場合\n・事前承認が必要\n・稟議申請をしてください\n\n管理者に確認します。',
    keywords: ['購入', '経費', '買い物', '立替'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_012',
    key: 'hr_overtime_request',
    title: '残業申請の確認',
    category: 'hr',
    riskLevel: 'L2',
    templateText: '残業申請についてご案内します。\n\n■ 事前申請が原則です\n1. DHPハブで残業申請\n2. 理由と予定時間を入力\n3. 管理者承認後に残業\n\n■ 注意事項\n・月45時間を超える場合は要相談\n\n管理者に確認します。',
    keywords: ['残業', '申請', '超過', '延長'],
    createdAt: new Date(),
  },

  // L3テンプレート（吉田承認必須）
  {
    id: 'tpl_013',
    key: 'expense_refund',
    title: '返金対応',
    category: 'expense',
    riskLevel: 'L3',
    requiredFieldsJson: JSON.stringify(['契約書番号', '入居期間', '返金理由']),
    templateText: '返金に関するご質問ですね。\n\n金銭に関わる判断は吉田の承認が必要です。\n\n■ 確認事項\n・契約書番号\n・入居期間\n・返金の理由\n\nこれらの情報を整理して、吉田に確認します。',
    keywords: ['返金', '返却', '払い戻し', 'キャンセル'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_014',
    key: 'hr_employment',
    title: '採用・雇用関連',
    category: 'hr',
    riskLevel: 'L3',
    templateText: '採用・雇用に関するご質問ですね。\n\n人事に関わる判断は吉田の承認が必要です。\n\n内容を整理して、吉田に確認します。\n\n緊急の場合は直接吉田にご連絡ください。',
    keywords: ['採用', '雇用', '面接', '入社', '退職'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_015',
    key: 'hr_discipline',
    title: '労務問題対応',
    category: 'hr',
    riskLevel: 'L3',
    templateText: '労務に関するご相談ですね。\n\n内容が重要なため、吉田の判断が必要です。\n\n■ 対応の流れ\n1. 状況を整理\n2. 吉田に報告\n3. 対応方針を決定\n\n緊急の場合は直接吉田にご連絡ください。',
    keywords: ['トラブル', '問題', 'ハラスメント', '懲戒'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_016',
    key: 'risk_complaint',
    title: 'クレーム対応',
    category: 'risk',
    riskLevel: 'L3',
    requiredFieldsJson: JSON.stringify(['発生日時', '相手方', 'クレーム内容', '現状']),
    templateText: 'クレームに関するご報告ですね。\n\nクレーム対応は吉田の判断が必要です。\n\n■ 確認事項\n・発生日時\n・相手方（ご家族/紹介会社等）\n・クレーム内容\n・現状\n\nこれらを整理して、至急吉田に報告します。',
    keywords: ['クレーム', '苦情', '怒り', 'トラブル', '問題'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_017',
    key: 'risk_accident',
    title: '事故対応',
    category: 'risk',
    riskLevel: 'L3',
    requiredFieldsJson: JSON.stringify(['発生日時', '場所', '状況', '対応済み事項']),
    templateText: '事故に関するご報告ですね。\n\n■ まず確認\n・怪我人の有無と状態\n・救急/警察への連絡有無\n\n■ 報告事項\n・発生日時\n・場所\n・状況\n・対応済み事項\n\n至急吉田に報告します。',
    keywords: ['事故', '怪我', '転倒', '救急'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_018',
    key: 'risk_legal',
    title: '法務・行政対応',
    category: 'risk',
    riskLevel: 'L3',
    templateText: '法務・行政に関するご質問ですね。\n\n法的な判断は吉田の確認が必要です。\n\n■ 確認事項\n・関係機関（行政/弁護士等）\n・内容の概要\n・期限の有無\n\n至急吉田に確認します。',
    keywords: ['行政', '法務', '弁護士', '監査', '指導'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_019',
    key: 'expense_contract',
    title: '契約・支払い判断',
    category: 'expense',
    riskLevel: 'L3',
    requiredFieldsJson: JSON.stringify(['契約相手', '金額', '契約内容']),
    templateText: '契約・支払いに関するご質問ですね。\n\n金銭に関わる判断は吉田の承認が必要です。\n\n■ 確認事項\n・契約相手\n・金額\n・契約内容\n\n吉田に確認します。',
    keywords: ['契約', '支払い', '請求', '振込'],
    createdAt: new Date(),
  },
  {
    id: 'tpl_020',
    key: 'risk_medical',
    title: '医療判断',
    category: 'risk',
    riskLevel: 'L3',
    templateText: '医療に関するご質問ですね。\n\n医療の判断は吉田の確認が必要です。\n\n■ 緊急の場合\n・すぐに救急（119）に連絡\n・その後で報告\n\n■ 緊急でない場合\n・状況を整理して報告\n\n吉田に確認します。',
    keywords: ['医療', '病院', '診断', '処置', '緊急'],
    createdAt: new Date(),
  },
];

// ポリシー定義
const POLICY_DEFINITIONS = {
  autoReply: {
    title: '自動返信ルール',
    description: 'L1（低リスク）の質問は自動で返信します',
    rules: [
      '手順確認・定型案内は自動返信',
      '不足情報がある場合は聞き返し',
      '15分以内に返信を試みる',
    ],
  },
  escalation: {
    title: 'エスカレーションルール',
    description: 'L2/L3は承認フローに回します',
    rules: [
      'L2: 管理者承認（対外連絡、例外判断）',
      'L3: 吉田承認必須（金銭、人事、リスク）',
      '判断に迷う場合は必ずL3に上げる',
    ],
  },
  prohibited: {
    title: '禁止事項',
    description: 'AIは以下の判断を行いません',
    rules: [
      '支払実行・契約確定',
      '採用・解雇・懲戒決定',
      '医療判断・診断',
      '行政対応の最終回答',
    ],
  },
};

export default function AiPoliciesPage() {
  return (
    <AuthGuard>
      <AiPoliciesContent />
    </AuthGuard>
  );
}

function AiPoliciesContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<AiTemplate[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<AiReplyCategory>>(new Set());

  const canAccess = user && isAiVpOwner(user.email);

  useEffect(() => {
    const fetchData = async () => {
      if (!canAccess) {
        setLoading(false);
        return;
      }

      // TODO: PR3で実データに置き換え
      await new Promise(resolve => setTimeout(resolve, 500));
      setTemplates(INITIAL_TEMPLATES);
      setLoading(false);
    };

    fetchData();
  }, [canAccess]);

  const toggleCategory = (category: AiReplyCategory) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="ポリシーを読み込み中..." />
      </>
    );
  }

  if (!canAccess) {
    return (
      <>
        <Header />
        <main className="pb-8">
          <div className="max-w-4xl mx-auto px-4 py-12 text-center">
            <Shield className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">アクセス権限がありません</h1>
            <p className="text-gray-500">この機能は吉田のみアクセス可能です。</p>
          </div>
        </main>
      </>
    );
  }

  // カテゴリ別にテンプレートをグループ化
  const templatesByCategory = templates.reduce((acc, tpl) => {
    if (!acc[tpl.category]) {
      acc[tpl.category] = [];
    }
    acc[tpl.category].push(tpl);
    return acc;
  }, {} as Record<AiReplyCategory, AiTemplate[]>);

  // リスクレベル別の統計
  const riskStats = {
    L1: templates.filter(t => t.riskLevel === 'L1').length,
    L2: templates.filter(t => t.riskLevel === 'L2').length,
    L3: templates.filter(t => t.riskLevel === 'L3').length,
  };

  return (
    <>
      <Header />
      <PreviewBadge />
      <main className="pb-8">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center mb-6">
            <Link href="/dashboard/ai/inbox" className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="ml-2 flex-1">
              <h1 className="text-xl font-bold text-gray-900 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-indigo-600" />
                返信ポリシー
              </h1>
              <p className="text-sm text-gray-500">
                自動返信ルールとFAQテンプレート
              </p>
            </div>
          </div>

          {/* ポリシー概要 */}
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    吉田返信の動作ポリシー
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    スタッフには吉田本人からの返信として送信されます。
                    不可逆な判断（支払実行、契約確定、懲戒等）は必ず吉田が最終承認します。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* リスクレベル統計 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="p-4 bg-green-50 border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700">L1（自動返信）</p>
                  <p className="text-2xl font-bold text-green-600">{riskStats.L1}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-300" />
              </div>
            </Card>
            <Card className="p-4 bg-yellow-50 border-yellow-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-700">L2（管理者承認）</p>
                  <p className="text-2xl font-bold text-yellow-600">{riskStats.L2}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-300" />
              </div>
            </Card>
            <Card className="p-4 bg-red-50 border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-700">L3（吉田承認）</p>
                  <p className="text-2xl font-bold text-red-600">{riskStats.L3}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-300" />
              </div>
            </Card>
          </div>

          {/* ポリシー定義 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {Object.entries(POLICY_DEFINITIONS).map(([key, policy]) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="text-sm">{policy.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-500 mb-2">{policy.description}</p>
                  <ul className="text-xs space-y-1">
                    {policy.rules.map((rule, idx) => (
                      <li key={idx} className="flex items-start gap-1">
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-700">{rule}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* FAQテンプレート一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <BookOpen className="w-4 h-4 mr-2" />
                FAQテンプレート（{templates.length}件）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(Object.keys(AI_REPLY_CATEGORY_LABELS) as AiReplyCategory[]).map((category) => {
                  const categoryTemplates = templatesByCategory[category] || [];
                  if (categoryTemplates.length === 0) return null;

                  const isExpanded = expandedCategories.has(category);

                  return (
                    <div key={category} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          )}
                          <span className="font-medium text-gray-900">
                            {AI_REPLY_CATEGORY_LABELS[category]}
                          </span>
                          <Badge className="bg-gray-200 text-gray-700">
                            {categoryTemplates.length}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          {['L1', 'L2', 'L3'].map((level) => {
                            const count = categoryTemplates.filter(
                              t => t.riskLevel === level
                            ).length;
                            if (count === 0) return null;
                            return (
                              <Badge
                                key={level}
                                className={`${AI_REPLY_RISK_COLORS[level as AiReplyRiskLevel].bg} ${AI_REPLY_RISK_COLORS[level as AiReplyRiskLevel].text} text-xs`}
                              >
                                {level}: {count}
                              </Badge>
                            );
                          })}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="divide-y">
                          {categoryTemplates.map((tpl) => (
                            <div key={tpl.id} className="p-3 hover:bg-gray-50">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge
                                  className={`${AI_REPLY_RISK_COLORS[tpl.riskLevel].bg} ${AI_REPLY_RISK_COLORS[tpl.riskLevel].text}`}
                                >
                                  {tpl.riskLevel}
                                </Badge>
                                <span className="font-medium text-gray-900">
                                  {tpl.title}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                                {tpl.templateText.split('\n')[0]}
                              </p>
                              {tpl.keywords && (
                                <div className="flex flex-wrap gap-1">
                                  {tpl.keywords.map((kw, idx) => (
                                    <span
                                      key={idx}
                                      className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded"
                                    >
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
