import { PlannedFeaturePlaceholder } from '@/components/PlannedFeaturePlaceholder';
import Link from 'next/link';
import { Settings } from 'lucide-react';

export default function NotificationsPage() {
  return (
    <div>
      {/* Task 061: 通知設定へのリンク */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <Link
          href="/dashboard/notification-settings"
          className="inline-flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
        >
          <Settings className="w-4 h-4 mr-2" />
          通知設定
        </Link>
      </div>
      <PlannedFeaturePlaceholder
        title="通知センター"
        description="全通知の一元管理。システム通知、アラート、リマインダーを集約表示します。"
        category="周知・コミュニケーション"
      />
    </div>
  );
}
