import { ReactNode } from 'react';
import { Filter } from 'lucide-react';

interface FilterChip {
  key: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

interface FilterChipsProps {
  chips: FilterChip[];
  activeKey: string;
  onSelect: (key: string) => void;
  // フィルタアイコンを表示
  showIcon?: boolean;
  // 件数を表示
  showCount?: boolean;
}

export function FilterChips({
  chips,
  activeKey,
  onSelect,
  showIcon = true,
  showCount = true,
}: FilterChipsProps) {
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {showIcon && (
        <Filter className="w-4 h-4 text-zinc-400" />
      )}
      {chips.map((chip) => (
        <button
          key={chip.key}
          onClick={() => onSelect(chip.key)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeKey === chip.key
              ? 'bg-zinc-900 text-white'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
          }`}
        >
          {chip.icon}
          {chip.label}
          {showCount && chip.count !== undefined && (
            <span className="opacity-75">({chip.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ステータスフィルタ用のプリセット
interface StatusFilterProps<T extends string> {
  statuses: T[];
  activeStatus: T | 'all';
  onSelect: (status: T | 'all') => void;
  statusLabels: Record<T, string>;
  statusCounts?: Record<T, number>;
  allLabel?: string;
}

export function StatusFilter<T extends string>({
  statuses,
  activeStatus,
  onSelect,
  statusLabels,
  statusCounts,
  allLabel = 'すべて',
}: StatusFilterProps<T>) {
  const chips: FilterChip[] = [
    { key: 'all', label: allLabel },
    ...statuses.map((status) => ({
      key: status,
      label: statusLabels[status],
      count: statusCounts?.[status],
    })),
  ];

  return (
    <FilterChips
      chips={chips}
      activeKey={activeStatus}
      onSelect={(key) => onSelect(key as T | 'all')}
      showCount={!!statusCounts}
    />
  );
}
