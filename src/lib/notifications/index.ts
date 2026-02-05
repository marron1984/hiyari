/**
 * 通知リポジトリ - エントリーポイント
 *
 * PROD-003: ストレージドライバー切り替え対応
 *
 * 環境変数 STORAGE_DRIVER で実装を切り替え:
 * - memory: In-Memory + JSONファイル（デフォルト）
 * - firestore: Cloud Firestore（本番用）
 *
 * 使用方法:
 * import { create, listByUser, ... } from '@/lib/notifications';
 */

import { getStorageDriver } from '@/config/storage';
import { memoryNotificationRepository } from './repo.memory';
import * as firestoreRepo from './repo.firestore';

// 型をre-export
export type {
  Notification,
  NotificationStatus,
  NotificationSeverity,
  CreateNotificationRequest,
  ListNotificationsOptions,
  ListNotificationsResult,
  CreateNotificationResult,
  MarkReadResult,
  NotificationRepository,
  DigestQueueItem,
} from './types';

// ドライバー判定
const isFirestore = getStorageDriver() === 'firestore';

// ========== 同期API（Memory用、後方互換） ==========

export function create(request: Parameters<typeof memoryNotificationRepository.create>[0]) {
  if (isFirestore) {
    console.warn('[Notifications] Sync API called with Firestore driver. Use createAsync instead.');
  }
  return memoryNotificationRepository.create(request);
}

export function createMany(requests: Parameters<typeof memoryNotificationRepository.createMany>[0]) {
  return memoryNotificationRepository.createMany(requests);
}

export function listByUser(
  userId: string,
  options?: Parameters<typeof memoryNotificationRepository.listByUser>[1]
) {
  return memoryNotificationRepository.listByUser(userId, options);
}

export function listByRole(
  role: string,
  options?: Parameters<typeof memoryNotificationRepository.listByRole>[1]
) {
  return memoryNotificationRepository.listByRole(role, options);
}

export function getUnreadCount(userId: string) {
  return memoryNotificationRepository.getUnreadCount(userId);
}

export function getUnreadCountByRole(role: string) {
  return memoryNotificationRepository.getUnreadCountByRole(role);
}

export function markRead(id: string, userId: string) {
  return memoryNotificationRepository.markRead(id, userId);
}

export function markAllRead(userId: string) {
  return memoryNotificationRepository.markAllRead(userId);
}

export function markAllReadByRole(role: string) {
  return memoryNotificationRepository.markAllReadByRole(role);
}

export function dismiss(id: string, userId: string) {
  return memoryNotificationRepository.dismiss(id, userId);
}

export function getById(id: string) {
  return memoryNotificationRepository.getById(id);
}

export function getByFingerprint(userId: string, fingerprint: string) {
  return memoryNotificationRepository.getByFingerprint(userId, fingerprint);
}

export function listAll(limit?: number) {
  return memoryNotificationRepository.listAll(limit);
}

export function getStats() {
  return memoryNotificationRepository.getStats();
}

// ========== 非同期API（Firestore対応） ==========

export async function createAsync(
  request: Parameters<typeof memoryNotificationRepository.create>[0]
) {
  if (isFirestore) {
    return firestoreRepo.createAsync(request);
  }
  return memoryNotificationRepository.create(request);
}

export async function createManyAsync(
  requests: Parameters<typeof memoryNotificationRepository.createMany>[0]
) {
  if (isFirestore) {
    return firestoreRepo.createManyAsync(requests);
  }
  return memoryNotificationRepository.createMany(requests);
}

export async function listByUserAsync(
  userId: string,
  options?: Parameters<typeof memoryNotificationRepository.listByUser>[1]
) {
  if (isFirestore) {
    return firestoreRepo.listByUserAsync(userId, options);
  }
  return memoryNotificationRepository.listByUser(userId, options);
}

export async function listByRoleAsync(
  role: string,
  options?: Parameters<typeof memoryNotificationRepository.listByRole>[1]
) {
  if (isFirestore) {
    return firestoreRepo.listByRoleAsync(role, options);
  }
  return memoryNotificationRepository.listByRole(role, options);
}

export async function getUnreadCountAsync(userId: string) {
  if (isFirestore) {
    return firestoreRepo.getUnreadCountAsync(userId);
  }
  return memoryNotificationRepository.getUnreadCount(userId);
}

export async function getUnreadCountByRoleAsync(role: string) {
  if (isFirestore) {
    return firestoreRepo.getUnreadCountByRoleAsync(role);
  }
  return memoryNotificationRepository.getUnreadCountByRole(role);
}

export async function markReadAsync(id: string, userId: string) {
  if (isFirestore) {
    return firestoreRepo.markReadAsync(id, userId);
  }
  return memoryNotificationRepository.markRead(id, userId);
}

export async function markAllReadAsync(userId: string) {
  if (isFirestore) {
    return firestoreRepo.markAllReadAsync(userId);
  }
  return memoryNotificationRepository.markAllRead(userId);
}

export async function markAllReadByRoleAsync(role: string) {
  if (isFirestore) {
    return firestoreRepo.markAllReadByRoleAsync(role);
  }
  return memoryNotificationRepository.markAllReadByRole(role);
}

export async function dismissAsync(id: string, userId: string) {
  if (isFirestore) {
    return firestoreRepo.dismissAsync(id, userId);
  }
  return memoryNotificationRepository.dismiss(id, userId);
}

export async function getByIdAsync(id: string) {
  if (isFirestore) {
    return firestoreRepo.getByIdAsync(id);
  }
  return memoryNotificationRepository.getById(id);
}

export async function getByFingerprintAsync(userId: string, fingerprint: string) {
  if (isFirestore) {
    return firestoreRepo.getByFingerprintAsync(userId, fingerprint);
  }
  return memoryNotificationRepository.getByFingerprint(userId, fingerprint);
}

export async function listAllAsync(limit?: number) {
  if (isFirestore) {
    return firestoreRepo.listAllAsync(limit);
  }
  return memoryNotificationRepository.listAll(limit);
}

export async function getStatsAsync() {
  if (isFirestore) {
    return firestoreRepo.getStatsAsync();
  }
  return memoryNotificationRepository.getStats();
}

// ========== ヘルパー関数 ==========

export function generateFingerprint(type: string, ...parts: string[]): string {
  return [type, ...parts].join(':');
}

// ========== 現在のドライバー情報 ==========

export function getDriverInfo() {
  return {
    driver: getStorageDriver(),
    isFirestore,
  };
}
