'use client';

import Link from 'next/link';
import { ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import type { KPIValue, KPIDefinition, KPIStatus } from '@/types/dashboard-kpi';

interface KPICardProps {
  kpi: KPIValue;
  definition: KPIDefinition;
  loading?: boolean;
}

export function KPICard({ kpi, definition, loading }: KPICardProps) {
  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="p-5">
          <div className="animate-pulse">
            <div className="h-4 bg-zinc-200 rounded w-1/2 mb-3" />
            <div className="h-8 bg-zinc-100 rounded w-1/3 mb-2" />
            <div className="h-3 bg-zinc-100 rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isAlert = kpi.status === 'warning' || kpi.status === 'critical';

  return (
    <Link href={definition.href} className="block h-full">
      <Card className={`h-full transition-all hover:shadow-md cursor-pointer ${
        getCardStyle(kpi.status)
      }`}>
        <CardContent className="p-5 h-full flex flex-col">
          {/* ラベル */}
          <div className="flex items-center justify-between mb-3">
            <p className={`text-sm font-medium ${getLabelStyle(kpi.status)}`}>
              {definition.label}
            </p>
            {isAlert && (
              <span className={`w-2 h-2 rounded-full ${
                kpi.status === 'critical' ? 'bg-red-500' : 'bg-amber-500'
              }`} />
            )}
          </div>

          {/* 数値 */}
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className={`text-3xl font-bold tracking-tight ${getValueStyle(kpi.status)}`}>
              {formatValue(kpi.value)}
            </span>
            {definition.unit && (
              <span className={`text-sm ${getUnitStyle(kpi.status)}`}>
                {definition.unit}
              </span>
            )}
            {kpi.trend && (
              <span className="ml-1">
                {kpi.trend === 'up' && <TrendingUp className="w-4 h-4 text-zinc-400" />}
                {kpi.trend === 'down' && <TrendingDown className="w-4 h-4 text-zinc-400" />}
                {kpi.trend === 'stable' && <Minus className="w-4 h-4 text-zinc-300" />}
              </span>
            )}
          </div>

          {/* 意味（必須表示） */}
          <p className={`text-sm flex-1 ${getMeaningStyle(kpi.status)}`}>
            {kpi.meaning}
          </p>

          {/* アクションリンク */}
          <div className={`mt-3 pt-2 border-t flex items-center justify-end ${
            isAlert ? 'border-red-200' : 'border-zinc-100'
          }`}>
            <span className={`text-xs flex items-center ${
              isAlert ? 'text-red-600' : 'text-zinc-400'
            }`}>
              {isAlert ? '対応する' : '詳細'}
              <ChevronRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ======== スタイルヘルパー ========

function getCardStyle(status: KPIStatus): string {
  switch (status) {
    case 'critical':
      return 'border-red-300 bg-red-50/50';
    case 'warning':
      return 'border-amber-200 bg-amber-50/30';
    default:
      return 'border-zinc-200 bg-white';
  }
}

function getLabelStyle(status: KPIStatus): string {
  switch (status) {
    case 'critical':
      return 'text-red-700';
    case 'warning':
      return 'text-amber-700';
    default:
      return 'text-zinc-600';
  }
}

function getValueStyle(status: KPIStatus): string {
  switch (status) {
    case 'critical':
      return 'text-red-600';
    case 'warning':
      return 'text-amber-600';
    default:
      return 'text-zinc-900';
  }
}

function getUnitStyle(status: KPIStatus): string {
  switch (status) {
    case 'critical':
      return 'text-red-500';
    case 'warning':
      return 'text-amber-500';
    default:
      return 'text-zinc-500';
  }
}

function getMeaningStyle(status: KPIStatus): string {
  switch (status) {
    case 'critical':
      return 'text-red-600';
    case 'warning':
      return 'text-amber-600';
    default:
      return 'text-zinc-500';
  }
}

function formatValue(value: number | null): string {
  if (value === null) return '--';
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}

// ======== KPIグリッド ========

interface KPIGridProps {
  kpis: KPIValue[];
  definitions: Record<string, KPIDefinition>;
  loading?: boolean;
  maxItems?: number;
}

export function KPIGrid({ kpis, definitions, loading, maxItems = 6 }: KPIGridProps) {
  const displayKpis = kpis.slice(0, maxItems);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[...Array(maxItems)].map((_, i) => (
          <KPICard
            key={i}
            kpi={{
              id: 'loading',
              value: null,
              meaning: '',
              status: 'normal',
            }}
            definition={{
              id: 'loading',
              label: '',
              description: '',
              href: '#',
              roles: [],
            }}
            loading
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {displayKpis.map((kpi) => {
        const definition = definitions[kpi.id];
        if (!definition) return null;
        return (
          <KPICard
            key={kpi.id}
            kpi={kpi}
            definition={definition}
          />
        );
      })}
    </div>
  );
}
