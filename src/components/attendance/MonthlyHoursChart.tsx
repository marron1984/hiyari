'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
} from 'recharts';
import { DailyWorkData } from '@/lib/attendance-summary';

interface MonthlyHoursChartProps {
  data: DailyWorkData[];
  chartType?: 'bar' | 'line' | 'composed';
}

// 分を時間に変換
function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

// データを時間単位に変換
function transformData(data: DailyWorkData[]) {
  return data.map((d) => ({
    date: d.date.split('-')[2] + '日', // 日付のみ表示
    労働時間: minutesToHours(d.workMinutes),
    残業時間: minutesToHours(d.overtimeMinutes),
    深夜時間: minutesToHours(d.lateNightMinutes),
    出勤人数: d.headcount,
  }));
}

// カスタムツールチップ
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((entry: any, index: number) => (
        <p key={index} style={{ color: entry.color }}>
          {entry.name}: {entry.value}{entry.name === '出勤人数' ? '名' : '時間'}
        </p>
      ))}
    </div>
  );
}

export function MonthlyHoursChart({ data, chartType = 'composed' }: MonthlyHoursChartProps) {
  const chartData = transformData(data);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        データがありません
      </div>
    );
  }

  if (chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="労働時間" fill="#3b82f6" />
          <Bar dataKey="残業時間" fill="#f59e0b" />
          <Bar dataKey="深夜時間" fill="#8b5cf6" />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line type="monotone" dataKey="労働時間" stroke="#3b82f6" strokeWidth={2} />
          <Line type="monotone" dataKey="残業時間" stroke="#f59e0b" strokeWidth={2} />
          <Line type="monotone" dataKey="出勤人数" stroke="#10b981" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // composed (default)
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 12 }} label={{ value: '時間', angle: -90, position: 'insideLeft' }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} label={{ value: '人数', angle: 90, position: 'insideRight' }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar yAxisId="left" dataKey="労働時間" fill="#3b82f6" />
        <Bar yAxisId="left" dataKey="残業時間" fill="#f59e0b" />
        <Line yAxisId="right" type="monotone" dataKey="出勤人数" stroke="#10b981" strokeWidth={2} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// 事業所別比較チャート
interface BranchComparisonData {
  branchName: string;
  working: number;
  onBreak: number;
  completed: number;
  notStarted: number;
}

interface BranchComparisonChartProps {
  data: BranchComparisonData[];
}

export function BranchComparisonChart({ data }: BranchComparisonChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        データがありません
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="branchName" tick={{ fontSize: 12 }} width={100} />
        <Tooltip />
        <Legend />
        <Bar dataKey="working" name="勤務中" stackId="a" fill="#22c55e" />
        <Bar dataKey="onBreak" name="休憩中" stackId="a" fill="#eab308" />
        <Bar dataKey="completed" name="退勤済" stackId="a" fill="#3b82f6" />
        <Bar dataKey="notStarted" name="未出勤" stackId="a" fill="#d1d5db" />
      </BarChart>
    </ResponsiveContainer>
  );
}
