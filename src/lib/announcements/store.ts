/**
 * 周知事項ストア
 *
 * インメモリストレージ（本番ではFirestoreに置き換え）
 */

import type { AppRole } from '@/config/appRoles';
import type {
  Announcement,
  AnnouncementStatus,
  CreateAnnouncementRequest,
  AnnouncementFilter,
} from './types';

// インメモリストレージ
const announcementsStore = new Map<string, Announcement>();

// ID生成
let idCounter = 1;

function generateId(): string {
  return `announcement_${Date.now()}_${idCounter++}`;
}

// 初期化フラグ
let isInitialized = false;

/**
 * デモ用データで初期化
 */
function initializeStore(): void {
  if (isInitialized) return;

  const now = new Date();
  const demoData: Announcement[] = [
    {
      id: 'ann_001',
      title: '【重要】年末年始の勤務体制について',
      content: `年末年始の勤務体制についてお知らせします。

12月29日（日）〜1月3日（金）は特別勤務体制となります。
各事業所のシフトは事業所長の指示に従ってください。

緊急連絡先：
- 本部代表：03-XXXX-XXXX
- 夜間緊急：090-XXXX-XXXX

ご不明点があれば各事業所長までお問い合わせください。`,
      status: 'published',
      priority: 'urgent',
      targetRoles: ['admin', 'executive', 'manager', 'leader', 'staff'],
      publishedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      authorId: 'user_001',
      authorName: '吉田 太郎',
    },
    {
      id: 'ann_002',
      title: '新しい感染症対策ガイドラインの適用開始',
      content: `感染症対策ガイドラインが更新されました。

主な変更点：
1. 手指消毒の頻度を1時間に1回から30分に1回へ変更
2. 共用スペースの換気時間を15分から20分へ延長
3. 来訪者の健康チェックシート様式を更新

詳細は添付のPDFをご確認ください。
ご質問は感染対策委員会までお願いします。`,
      status: 'published',
      priority: 'high',
      targetRoles: ['manager', 'leader', 'staff'],
      publishedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      authorId: 'user_002',
      authorName: '田中 花子',
    },
    {
      id: 'ann_003',
      title: '給与明細のWeb化について',
      content: `来月より給与明細のWeb配信を開始します。

■ 開始時期：2024年2月度給与より
■ 確認方法：AA-HUB > マイページ > 給与明細

紙での配布は原則廃止となります。
印刷が必要な場合は各自でダウンロード・印刷をお願いします。

システムへのログイン方法が不明な場合は
総務部までお問い合わせください。`,
      status: 'published',
      priority: 'normal',
      targetRoles: ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'],
      publishedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      authorId: 'user_003',
      authorName: '鈴木 一郎',
    },
    {
      id: 'ann_004',
      title: '社内研修「認知症ケア基礎」のご案内',
      content: `研修のご案内です。

■ 研修名：認知症ケア基礎研修
■ 日時：2024年2月15日（木）14:00〜17:00
■ 場所：本部会議室（オンライン参加可）
■ 対象：介護職・看護職全員（必修）
■ 講師：○○大学 △△教授

参加希望の方は2月10日までに
研修管理システムからお申し込みください。`,
      status: 'published',
      priority: 'normal',
      targetRoles: ['leader', 'staff'],
      targetBranchIds: ['branch_a', 'branch_b'],
      publishedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      authorId: 'user_002',
      authorName: '田中 花子',
    },
    {
      id: 'ann_005',
      title: '駐車場利用ルールの変更について',
      content: `駐車場利用ルールを一部変更します。

■ 変更内容：
- 来客用駐車スペースを3台から5台へ拡大
- 職員駐車エリアの区画を再配置

■ 適用日：2024年2月1日〜

新しい駐車区画図は事務所に掲示しています。
ご確認ください。`,
      status: 'published',
      priority: 'low',
      targetRoles: ['manager', 'leader', 'staff'],
      publishedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      authorId: 'user_003',
      authorName: '鈴木 一郎',
    },
    {
      id: 'ann_006',
      title: '【下書き】春季健康診断のお知らせ',
      content: `春季健康診断について（下書き中）`,
      status: 'draft',
      priority: 'normal',
      targetRoles: ['admin', 'executive', 'manager', 'leader', 'staff'],
      createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      authorId: 'user_001',
      authorName: '吉田 太郎',
    },
  ];

  for (const ann of demoData) {
    announcementsStore.set(ann.id, ann);
  }

  isInitialized = true;
}

/**
 * 周知事項一覧を取得
 */
export function listAnnouncements(filter: AnnouncementFilter = {}): {
  announcements: Announcement[];
  total: number;
} {
  initializeStore();

  let announcements = Array.from(announcementsStore.values());

  // ステータスフィルタ
  if (filter.status) {
    announcements = announcements.filter((a) => a.status === filter.status);
  } else {
    // デフォルトは公開済みのみ
    announcements = announcements.filter((a) => a.status === 'published');
  }

  // 優先度フィルタ
  if (filter.priority) {
    announcements = announcements.filter((a) => a.priority === filter.priority);
  }

  // 検索フィルタ
  if (filter.search) {
    const search = filter.search.toLowerCase();
    announcements = announcements.filter(
      (a) =>
        a.title.toLowerCase().includes(search) ||
        a.content.toLowerCase().includes(search)
    );
  }

  // ソート（公開日時 DESC）
  announcements.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });

  const total = announcements.length;

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  announcements = announcements.slice(offset, offset + limit);

  return { announcements, total };
}

/**
 * 周知事項を取得
 */
export function getAnnouncementById(id: string): Announcement | null {
  initializeStore();
  return announcementsStore.get(id) ?? null;
}

/**
 * ユーザーが対象の周知事項を取得
 */
export function listAnnouncementsForUser(
  userRole: AppRole,
  userId: string,
  userBranchId?: string,
  filter: AnnouncementFilter = {}
): { announcements: Announcement[]; total: number } {
  initializeStore();

  let announcements = Array.from(announcementsStore.values());

  // 公開済みのみ
  announcements = announcements.filter((a) => a.status === 'published');

  // ユーザーが対象かチェック
  announcements = announcements.filter((a) => {
    // ロールが対象に含まれるか
    const roleMatch = a.targetRoles.includes(userRole);

    // 個別指定されているか
    const userIdMatch = a.targetUserIds?.includes(userId);

    // 事業所が対象に含まれるか（指定がない場合は全事業所対象）
    const branchMatch =
      !a.targetBranchIds ||
      a.targetBranchIds.length === 0 ||
      (userBranchId && a.targetBranchIds.includes(userBranchId));

    return (roleMatch || userIdMatch) && branchMatch;
  });

  // 優先度フィルタ
  if (filter.priority) {
    announcements = announcements.filter((a) => a.priority === filter.priority);
  }

  // 検索フィルタ
  if (filter.search) {
    const search = filter.search.toLowerCase();
    announcements = announcements.filter(
      (a) =>
        a.title.toLowerCase().includes(search) ||
        a.content.toLowerCase().includes(search)
    );
  }

  // ソート（公開日時 DESC）
  announcements.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });

  const total = announcements.length;

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  announcements = announcements.slice(offset, offset + limit);

  return { announcements, total };
}

/**
 * 周知事項を作成
 */
export function createAnnouncement(
  request: CreateAnnouncementRequest,
  authorId: string,
  authorName: string
): Announcement {
  initializeStore();

  const now = new Date().toISOString();
  const announcement: Announcement = {
    id: generateId(),
    title: request.title,
    content: request.content,
    status: request.publishedAt ? 'published' : 'draft',
    priority: request.priority ?? 'normal',
    targetRoles: request.targetRoles,
    targetUserIds: request.targetUserIds,
    targetBranchIds: request.targetBranchIds,
    publishedAt: request.publishedAt,
    expiresAt: request.expiresAt,
    createdAt: now,
    updatedAt: now,
    authorId,
    authorName,
  };

  announcementsStore.set(announcement.id, announcement);
  return announcement;
}

/**
 * 周知事項を公開
 */
export function publishAnnouncement(id: string): Announcement | null {
  initializeStore();

  const announcement = announcementsStore.get(id);
  if (!announcement) return null;

  const now = new Date().toISOString();
  announcement.status = 'published';
  announcement.publishedAt = now;
  announcement.updatedAt = now;

  announcementsStore.set(id, announcement);
  return announcement;
}

/**
 * ストアをクリア（テスト用）
 */
export function clearAnnouncementsStore(): void {
  announcementsStore.clear();
  idCounter = 1;
  isInitialized = false;
}
