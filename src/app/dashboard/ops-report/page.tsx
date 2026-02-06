'use client';

/**
 * Ops Report ページ
 *
 * Implementation Ticket 067: 本番運用固定（cronスケジュール/再通知/復旧導線/ops-report連動）
 *
 * 表示内容:
 * - daily-ops / weekly-ops / notify-digest の最終実行状況
 * - 失敗ステップの表示
 * - system_error / unclassified / critical アラート件数
 * - 手動再実行ボタン（adminのみ）
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ========== 型定義 ==========

interface OpsRunSummary {
  id: string;
  date?: string;
  weekStart?: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  stepsOk: number;
  stepsFailed: number;
  totalAlertsCreated?: number;
  totalItemsProcessed?: number;
  errorMessage?: string;
  failedSteps?: string[];
}

interface OpsRunStats {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  lastRunAt: string | null;
}

interface OpsJobStatus {
  name: 'daily-ops' | 'weekly-ops' | 'notify-digest';
  label: string;
  schedule: string;
  lastRun: OpsRunSummary | null;
  stats: OpsRunStats | null;
  loading: boolean;
  error: string | null;
}

interface AlertCounts {
  systemError: number;
  unclassified: number;
  critical: number;
  total: number;
}

// ========== コンポーネント ==========

export default function OpsReportPage() {
  const [jobs, setJobs] = useState<OpsJobStatus[]>([
    {
      name: 'daily-ops',
      label: '日次オペ',
      schedule: '毎日 08:30',
      lastRun: null,
      stats: null,
      loading: true,
      error: null,
    },
    {
      name: 'weekly-ops',
      label: '週次オペ',
      schedule: '毎週月曜 08:00',
      lastRun: null,
      stats: null,
      loading: true,
      error: null,
    },
    {
      name: 'notify-digest',
      label: '朝ダイジェスト',
      schedule: '毎日 09:00',
      lastRun: null,
      stats: null,
      loading: true,
      error: null,
    },
  ]);

  const [alertCounts, setAlertCounts] = useState<AlertCounts>({
    systemError: 0,
    unclassified: 0,
    critical: 0,
    total: 0,
  });

  const [rerunning, setRerunning] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('viewer');

  // データ取得
  const fetchJobStatus = useCallback(async (jobName: string) => {
    try {
      const res = await fetch(`/api/ops/status?job=${jobName}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return data;
    } catch {
      return null;
    }
  }, []);

  const fetchAlertCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/alert-counts');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setAlertCounts(data);
    } catch {
      // ignore
    }
  }, []);

  const fetchUserRole = useCallback(async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.role || 'viewer');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      await fetchUserRole();
      await fetchAlertCounts();

      // 各ジョブのステータスを取得
      const jobNames = ['daily-ops', 'weekly-ops', 'notify-digest'];
      for (const name of jobNames) {
        const data = await fetchJobStatus(name);
        setJobs((prev) =>
          prev.map((job) =>
            job.name === name
              ? {
                  ...job,
                  lastRun: data?.lastRun || null,
                  stats: data?.stats || null,
                  loading: false,
                  error: data ? null : 'データ取得失敗',
                }
              : job
          )
        );
      }
    };
    loadAll();
  }, [fetchJobStatus, fetchAlertCounts, fetchUserRole]);

  // 手動再実行
  const handleRerun = async (jobName: string, steps?: string[]) => {
    if (rerunning) return;
    setRerunning(jobName);

    try {
      const res = await fetch('/api/ops/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: jobName, steps, force: true }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`再実行失敗: ${error.error || 'Unknown error'}`);
        return;
      }

      const result = await res.json();
      alert(
        result.success
          ? `再実行完了: ${result.message || 'OK'}`
          : `再実行失敗: ${result.error || 'Unknown error'}`
      );

      // ステータス再取得
      const data = await fetchJobStatus(jobName);
      setJobs((prev) =>
        prev.map((job) =>
          job.name === jobName
            ? {
                ...job,
                lastRun: data?.lastRun || null,
                stats: data?.stats || null,
              }
            : job
        )
      );
      await fetchAlertCounts();
    } catch {
      alert('再実行中にエラーが発生しました');
    } finally {
      setRerunning(null);
    }
  };

  const isAdmin = userRole === 'admin';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ops Report</h1>
        <p className="text-sm text-gray-600 mt-1">
          定期ジョブの実行状況と朝イチ確認ダッシュボード
        </p>
      </div>

      {/* アラートサマリー */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <AlertCountCard
          label="System Error"
          count={alertCounts.systemError}
          severity="critical"
          href="/dashboard/alerts?type=system_error&status=open"
        />
        <AlertCountCard
          label="未分類スコープ"
          count={alertCounts.unclassified}
          severity="warning"
          href="/dashboard/admin/unclassified"
        />
        <AlertCountCard
          label="Critical"
          count={alertCounts.critical}
          severity="critical"
          href="/dashboard/alerts?severity=critical&status=open"
        />
        <AlertCountCard
          label="Open 合計"
          count={alertCounts.total}
          severity="info"
          href="/dashboard/alerts?status=open"
        />
      </div>

      {/* ジョブ一覧 */}
      <div className="space-y-6">
        {jobs.map((job) => (
          <JobStatusCard
            key={job.name}
            job={job}
            isAdmin={isAdmin}
            rerunning={rerunning === job.name}
            onRerun={(steps) => handleRerun(job.name, steps)}
          />
        ))}
      </div>

      {/* 関連リンク */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-3">関連リンク</h3>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/alerts"
            className="text-sm text-blue-600 hover:underline"
          >
            アラート一覧
          </Link>
          <Link
            href="/dashboard/ai-vp"
            className="text-sm text-blue-600 hover:underline"
          >
            AI副社長
          </Link>
          <Link
            href="/dashboard/wbr"
            className="text-sm text-blue-600 hover:underline"
          >
            WBR
          </Link>
          <Link
            href="/dashboard/audit"
            className="text-sm text-blue-600 hover:underline"
          >
            監査ログ
          </Link>
        </div>
      </div>
    </div>
  );
}

// ========== サブコンポーネント ==========

function AlertCountCard({
  label,
  count,
  severity,
  href,
}: {
  label: string;
  count: number;
  severity: 'critical' | 'warning' | 'info';
  href: string;
}) {
  const bgColor =
    severity === 'critical'
      ? count > 0
        ? 'bg-red-50 border-red-200'
        : 'bg-gray-50 border-gray-200'
      : severity === 'warning'
        ? count > 0
          ? 'bg-amber-50 border-amber-200'
          : 'bg-gray-50 border-gray-200'
        : 'bg-blue-50 border-blue-200';

  const textColor =
    severity === 'critical'
      ? count > 0
        ? 'text-red-700'
        : 'text-gray-500'
      : severity === 'warning'
        ? count > 0
          ? 'text-amber-700'
          : 'text-gray-500'
        : 'text-blue-700';

  return (
    <Link
      href={href}
      className={`block p-4 rounded-lg border ${bgColor} hover:opacity-80 transition-opacity`}
    >
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${textColor}`}>{count}</div>
    </Link>
  );
}

function JobStatusCard({
  job,
  isAdmin,
  rerunning,
  onRerun,
}: {
  job: OpsJobStatus;
  isAdmin: boolean;
  rerunning: boolean;
  onRerun: (steps?: string[]) => void;
}) {
  if (job.loading) {
    return (
      <div className="p-4 bg-white rounded-lg border border-gray-200 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  const lastRun = job.lastRun;
  const stats = job.stats;

  const statusColor = lastRun?.ok
    ? 'bg-green-100 text-green-800'
    : lastRun
      ? 'bg-red-100 text-red-800'
      : 'bg-gray-100 text-gray-800';

  const statusText = lastRun?.ok ? 'OK' : lastRun ? 'FAILED' : '未実行';

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">{job.label}</h3>
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded ${statusColor}`}
          >
            {statusText}
          </span>
        </div>
        <span className="text-xs text-gray-500">{job.schedule}</span>
      </div>

      {job.error && (
        <div className="text-sm text-red-600 mb-3">{job.error}</div>
      )}

      {lastRun && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <div>
            <div className="text-xs text-gray-500">最終実行</div>
            <div className="text-sm font-medium">
              {formatDateTime(lastRun.startedAt)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">ステップ</div>
            <div className="text-sm font-medium">
              <span className="text-green-600">{lastRun.stepsOk} OK</span>
              {lastRun.stepsFailed > 0 && (
                <span className="text-red-600 ml-2">
                  {lastRun.stepsFailed} Failed
                </span>
              )}
            </div>
          </div>
          {lastRun.totalAlertsCreated !== undefined && (
            <div>
              <div className="text-xs text-gray-500">作成アラート</div>
              <div className="text-sm font-medium">
                {lastRun.totalAlertsCreated}
              </div>
            </div>
          )}
          {lastRun.totalItemsProcessed !== undefined && (
            <div>
              <div className="text-xs text-gray-500">処理件数</div>
              <div className="text-sm font-medium">
                {lastRun.totalItemsProcessed}
              </div>
            </div>
          )}
        </div>
      )}

      {lastRun?.failedSteps && lastRun.failedSteps.length > 0 && (
        <div className="mb-3 p-2 bg-red-50 rounded border border-red-200">
          <div className="text-xs text-red-700 font-medium mb-1">
            失敗ステップ:
          </div>
          <div className="flex flex-wrap gap-1">
            {lastRun.failedSteps.map((step) => (
              <span
                key={step}
                className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded"
              >
                {step}
              </span>
            ))}
          </div>
        </div>
      )}

      {lastRun?.errorMessage && (
        <div className="mb-3 p-2 bg-red-50 rounded border border-red-200">
          <div className="text-xs text-red-700">{lastRun.errorMessage}</div>
        </div>
      )}

      {stats && (
        <div className="text-xs text-gray-500 mb-3">
          過去30日: {stats.successRuns}/{stats.totalRuns} 成功
        </div>
      )}

      {isAdmin && (
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => onRerun()}
            disabled={rerunning}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rerunning ? '実行中...' : '再実行'}
          </button>
          {lastRun?.failedSteps && lastRun.failedSteps.length > 0 && (
            <button
              onClick={() => onRerun(lastRun.failedSteps)}
              disabled={rerunning}
              className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              失敗ステップのみ再実行
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ========== ユーティリティ ==========

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}
