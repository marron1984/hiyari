'use client';

import { AttendanceAlert } from '@/lib/attendance-summary';
import { AlertTriangle, Clock, UserX, FileText } from 'lucide-react';

interface AttendanceAlertListProps {
  alerts: AttendanceAlert[];
  onAlertClick?: (alert: AttendanceAlert) => void;
  maxItems?: number;
}

const ALERT_CONFIG = {
  missing_clock: {
    icon: UserX,
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    iconColor: 'text-yellow-600',
  },
  long_hours: {
    icon: Clock,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
  },
  missing_break: {
    icon: AlertTriangle,
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    iconColor: 'text-orange-600',
  },
  overtime_pending: {
    icon: FileText,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-600',
  },
};

const SEVERITY_BADGE = {
  error: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
};

export function AttendanceAlertList({
  alerts,
  onAlertClick,
  maxItems,
}: AttendanceAlertListProps) {
  const displayAlerts = maxItems ? alerts.slice(0, maxItems) : alerts;

  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>現在アラートはありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayAlerts.map((alert) => {
        const config = ALERT_CONFIG[alert.type];
        const Icon = config.icon;

        return (
          <div
            key={alert.id}
            className={`${config.bgColor} ${config.borderColor} border rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow`}
            onClick={() => onAlertClick?.(alert)}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 ${config.iconColor}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900 truncate">
                    {alert.employeeName}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_BADGE[alert.severity]}`}>
                    {alert.severity === 'error' ? '重要' : alert.severity === 'warning' ? '注意' : '情報'}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{alert.message}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                  <span>{alert.date}</span>
                  {alert.value !== undefined && (
                    <span>
                      {alert.type === 'long_hours' && `${Math.floor(alert.value / 60)}時間${alert.value % 60}分`}
                      {alert.type === 'overtime_pending' && `申請: ${Math.floor(alert.value / 60)}時間${alert.value % 60 > 0 ? `${alert.value % 60}分` : ''}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {maxItems && alerts.length > maxItems && (
        <div className="text-center py-2">
          <span className="text-sm text-gray-500">
            他 {alerts.length - maxItems} 件のアラート
          </span>
        </div>
      )}
    </div>
  );
}

// アラートサマリーカード
interface AlertSummaryProps {
  alerts: AttendanceAlert[];
}

export function AlertSummary({ alerts }: AlertSummaryProps) {
  const counts = {
    error: alerts.filter((a) => a.severity === 'error').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    info: alerts.filter((a) => a.severity === 'info').length,
  };

  return (
    <div className="flex items-center gap-4">
      {counts.error > 0 && (
        <div className="flex items-center gap-1 text-red-600">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-medium">{counts.error}</span>
        </div>
      )}
      {counts.warning > 0 && (
        <div className="flex items-center gap-1 text-yellow-600">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-medium">{counts.warning}</span>
        </div>
      )}
      {counts.info > 0 && (
        <div className="flex items-center gap-1 text-blue-600">
          <FileText className="w-4 h-4" />
          <span className="text-sm font-medium">{counts.info}</span>
        </div>
      )}
      {alerts.length === 0 && (
        <span className="text-sm text-gray-500">アラートなし</span>
      )}
    </div>
  );
}
