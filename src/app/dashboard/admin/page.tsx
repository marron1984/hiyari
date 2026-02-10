'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loading } from '@/components/Loading';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/ui';
import { hasMinRole } from '@/lib/auth';
import {
  Shield,
  Activity,
  Users,
  Settings,
  Database,
  FileText,
  Brain,
  Building2,
  ClipboardList,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Clock,
  BarChart3,
  Wrench,
  BookOpen,
  Ticket,
} from 'lucide-react';

// 管理メニュー項目
const ADMIN_MENU_ITEMS = [
  {
    href: '/dashboard/admin/self-check',
    icon: Activity,
    label: 'Self Check',
    description: 'システム自己診断',
    badge: '重要',
    badgeColor: 'bg-red-100 text-red-700',
  },
  {
    href: '/admin/users',
    icon: Users,
    label: 'ユーザー管理',
    description: 'ユーザー一覧・権限設定',
  },
  {
    href: '/admin/settings',
    icon: Settings,
    label: '設定',
    description: 'システム設定',
  },
  {
    href: '/admin/ringi',
    icon: FileText,
    label: '稟議管理',
    description: '全稟議の閲覧・管理',
  },
  {
    href: '/admin/incidents',
    icon: AlertTriangle,
    label: 'インシデント',
    description: 'ヒヤリハット・改善提案',
  },
  {
    href: '/admin/ai-vp',
    icon: Brain,
    label: 'AI副社長',
    description: 'AI抽出・承認管理',
  },
  {
    href: '/admin/attendance/dashboard',
    icon: Clock,
    label: '勤怠ダッシュボード',
    description: '打刻状況・集計',
  },
  {
    href: '/admin/prospects/import',
    icon: Database,
    label: '入居希望インポート',
    description: 'Google Sheets連携',
  },
  {
    href: '/admin/sync/google-sheets',
    icon: RefreshCw,
    label: 'Google Sheets同期',
    description: '双方向データ同期・夜間バッチ',
  },
  {
    href: '/admin/reports',
    icon: BarChart3,
    label: 'レポート・分析',
    description: 'インシデント傾向・コンバージョン・稼働率',
  },
  {
    href: '/admin/module-permissions',
    icon: Shield,
    label: 'モジュール権限',
    description: '機能別の個別権限設定',
  },
  {
    href: '/admin/points',
    icon: TrendingUp,
    label: 'ポイント管理',
    description: 'ポイント付与・履歴',
  },
  {
    href: '/admin/insights',
    icon: BarChart3,
    label: 'インサイト',
    description: 'データ分析・レポート',
  },
  {
    href: '/admin/attendance/realtime',
    icon: Activity,
    label: 'リアルタイム勤怠',
    description: '全スタッフのリアルタイム出勤状況',
  },
  {
    href: '/dashboard/audit',
    icon: FileText,
    label: '監査ログ',
    description: 'システム操作の監査証跡',
  },
  {
    href: '/dashboard/repair-tickets',
    icon: Wrench,
    label: '修繕チケット',
    description: '設備故障・修理依頼の管理',
  },
  {
    href: '/dashboard/complaints',
    icon: AlertTriangle,
    label: '苦情管理',
    description: '苦情・クレームの追跡管理',
  },
  {
    href: '/dashboard/corrective-actions',
    icon: CheckCircle,
    label: '是正措置',
    description: '是正・予防措置の管理',
  },
  {
    href: '/dashboard/tickets',
    icon: Ticket,
    label: 'チケット管理',
    description: '業務チケットの管理',
  },
  {
    href: '/dashboard/training',
    icon: BookOpen,
    label: '研修管理',
    description: '研修・教育プログラムの管理',
  },
  {
    href: '/dashboard/business-summary',
    icon: TrendingUp,
    label: '業務サマリー',
    description: '業務KPI・トレンド分析',
  },
  {
    href: '/dashboard/quality-risk',
    icon: Shield,
    label: '品質・リスク',
    description: '品質指標・リスクダッシュボード',
  },
];

// 簡易ヘルスチェック結果
interface QuickHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'loading' | 'error';
  message: string;
  time?: string;
}

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [health, setHealth] = useState<QuickHealth>({ status: 'loading', message: '確認中...' });

  // 権限チェック - admin以上でなければリダイレクト
  useEffect(() => {
    if (!authLoading && user && !hasMinRole(user.role, 'admin')) {
      router.push('/dashboard');
    }
  }, [authLoading, user, router]);

  // 簡易ヘルスチェック
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) {
          setHealth({
            status: 'error',
            message: `HTTP ${res.status}`,
          });
          return;
        }
        const data = await res.json();
        setHealth({
          status: data.status,
          message: data.status === 'healthy' ? 'システム正常' : data.status === 'degraded' ? '一部制限あり' : 'システム異常',
          time: data.time,
        });
      } catch (error) {
        setHealth({
          status: 'error',
          message: error instanceof Error ? error.message : '接続エラー',
        });
      }
    };

    checkHealth();
  }, []);

  const HealthIcon = () => {
    switch (health.status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'unhealthy':
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <RefreshCw className="w-5 h-5 text-zinc-400 animate-spin" />;
    }
  };

  const healthBgColor = () => {
    switch (health.status) {
      case 'healthy':
        return 'bg-green-50 border-green-200';
      case 'degraded':
        return 'bg-yellow-50 border-yellow-200';
      case 'unhealthy':
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-zinc-50 border-zinc-200';
    }
  };

  // 認証ローディング中または権限チェック中
  if (authLoading || !user || !hasMinRole(user.role, 'admin')) {
    return <Loading text="読み込み中..." />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
              <Shield className="w-6 h-6" />
              管理画面
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              システム管理・設定
            </p>
          </div>
          <div className="text-right text-xs text-zinc-400">
            <p>ログイン: {user?.email}</p>
            <p>権限: {user?.role}</p>
          </div>
        </div>

        {/* Quick Health Status */}
        <Card className={`mb-6 border ${healthBgColor()}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HealthIcon />
                <div>
                  <p className="font-medium text-zinc-900">{health.message}</p>
                  {health.time && (
                    <p className="text-xs text-zinc-500">
                      {new Date(health.time).toLocaleString('ja-JP')}
                    </p>
                  )}
                </div>
              </div>
              <Link href="/dashboard/admin/self-check">
                <Button variant="outline" size="sm">
                  <Activity className="w-4 h-4 mr-2" />
                  詳細を見る
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Admin Menu Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ADMIN_MENU_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="h-full hover:bg-zinc-50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5 text-zinc-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-zinc-900">{item.label}</h3>
                        {item.badge && (
                          <Badge className={item.badgeColor || 'bg-zinc-100 text-zinc-600'}>
                            {item.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-zinc-500 mt-0.5">{item.description}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-zinc-400 shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick Links */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">クイックリンク</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard">
                <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-200 cursor-pointer">
                  ダッシュボード
                </Badge>
              </Link>
              <Link href="/dashboard/approvals">
                <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-200 cursor-pointer">
                  稟議一覧
                </Badge>
              </Link>
              <Link href="/dashboard/vacancy">
                <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-200 cursor-pointer">
                  空室管理
                </Badge>
              </Link>
              <Link href="/sales">
                <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-200 cursor-pointer">
                  営業
                </Badge>
              </Link>
              <a
                href="/api/health"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer">
                  /api/health
                </Badge>
              </a>
            </div>
          </CardContent>
        </Card>

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-zinc-400">
        <p>管理画面へのアクセスには admin 以上の権限が必要です</p>
      </div>
    </div>
  );
}
