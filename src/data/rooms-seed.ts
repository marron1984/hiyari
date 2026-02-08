/**
 * 空室管理シードデータ（Google Sheets「入居状況」シートより 2026-02-08 時点）
 *
 * ステータスマッピング:
 *   1.入居中   → '入居中'
 *   2.入居予定 → '予約'
 *   5.空室     → '空室'
 *   6.会社利用 → 'メンテナンス'
 *   7.ショールーム → 'メンテナンス'
 *   その他     → 'メンテナンス'
 */

import type { RoomStatus } from '@/types/prospect';

export interface RoomSeed {
  buildingName: string;
  roomNumber: string;
  status: RoomStatus;
  occupantName?: string;
  moveInDate?: string;
  expectedCareLevel?: string;
  note?: string;
}

export interface FacilitySeed {
  id: string;
  name: string;
  rooms: RoomSeed[];
}

export const FACILITIES_SEED: FacilitySeed[] = [
  {
    id: 'pacific',
    name: 'パシフィック',
    rooms: [
      // ── 入居中 ──
      { buildingName: 'パシフィック', roomNumber: '108', status: '入居中', occupantName: '杉田 圭一', moveInDate: '2025-04-22', expectedCareLevel: '要介護5' },
      { buildingName: 'パシフィック', roomNumber: '206', status: '入居中', occupantName: '林 智宇', moveInDate: '2024-11-27', expectedCareLevel: '要介護2' },
      { buildingName: 'パシフィック', roomNumber: '212', status: '入居中', occupantName: '長谷部 暢子', moveInDate: '2024-11-26', expectedCareLevel: '要介護5' },
      { buildingName: 'パシフィック', roomNumber: '402', status: '入居中', occupantName: '鈴木 信子', moveInDate: '2025-09-25', expectedCareLevel: '要介護1〜5' },
      { buildingName: 'パシフィック', roomNumber: '403', status: '入居中', occupantName: '上村 春子', moveInDate: '2025-09-09', expectedCareLevel: '要介護1〜5' },
      { buildingName: 'パシフィック', roomNumber: '405', status: '入居中', occupantName: '河田 晃見', moveInDate: '2025-10-13', expectedCareLevel: '要介護1〜5' },
      { buildingName: 'パシフィック', roomNumber: '415', status: '入居中', occupantName: '金坂 幸信', moveInDate: '2025-11-29', expectedCareLevel: '要介護1〜5' },
      { buildingName: 'パシフィック', roomNumber: '601', status: '入居中', occupantName: '榎本 裕子', moveInDate: '2024-11-12', expectedCareLevel: '要介護5' },
      { buildingName: 'パシフィック', roomNumber: '703', status: '入居中', occupantName: '岸 義也', moveInDate: '2024-10-21', expectedCareLevel: '要介護5' },
      { buildingName: 'パシフィック', roomNumber: '715', status: '入居中', occupantName: '石川 有道', moveInDate: '2024-11-12', expectedCareLevel: '要介護2' },
      { buildingName: 'パシフィック', roomNumber: '716', status: '入居中', occupantName: '丹田 克紘', moveInDate: '2024-10-21', expectedCareLevel: 'なし' },
      // ── 入居予定 ──
      { buildingName: 'パシフィック', roomNumber: '105', status: '予約' },
      { buildingName: 'パシフィック', roomNumber: '303', status: '予約' },
      { buildingName: 'パシフィック', roomNumber: '608', status: '予約' },
      // ── 空室 ──
      { buildingName: 'パシフィック', roomNumber: '211', status: '空室' },
      { buildingName: 'パシフィック', roomNumber: '401', status: '空室' },
      { buildingName: 'パシフィック', roomNumber: '406', status: '空室' },
      { buildingName: 'パシフィック', roomNumber: '408', status: '空室' },
      { buildingName: 'パシフィック', roomNumber: '410', status: '空室' },
      { buildingName: 'パシフィック', roomNumber: '411', status: '空室' },
      { buildingName: 'パシフィック', roomNumber: '416', status: '空室' },
      // ── 会社利用・その他 ──
      { buildingName: 'パシフィック', roomNumber: '210', status: 'メンテナンス', note: 'ゴミ集約で使用' },
      { buildingName: 'パシフィック', roomNumber: '413', status: 'メンテナンス', note: 'ショールーム' },
      { buildingName: 'パシフィック', roomNumber: '412', status: 'メンテナンス', note: 'ランドリー予定' },
      { buildingName: 'パシフィック', roomNumber: '610', status: 'メンテナンス', note: '休憩室' },
      { buildingName: 'パシフィック', roomNumber: '611', status: 'メンテナンス', note: 'ランドリー' },
      { buildingName: 'パシフィック', roomNumber: '613', status: 'メンテナンス', note: '詰所' },
    ],
  },
  {
    id: 'renaissance',
    name: 'ルネッサンス',
    rooms: [
      // ── 入居中 ──
      { buildingName: 'ルネッサンス', roomNumber: '2A', status: '入居中', occupantName: '味 雅彦', moveInDate: '2025-07-28', expectedCareLevel: '要介護1' },
      { buildingName: 'ルネッサンス', roomNumber: '2B', status: '入居中', occupantName: '笠岡 康志', moveInDate: '2025-02-11', expectedCareLevel: '要介護1' },
      { buildingName: 'ルネッサンス', roomNumber: '5B', status: '入居中', occupantName: '中込 和人', moveInDate: '2024-12-06', expectedCareLevel: 'なし' },
      { buildingName: 'ルネッサンス', roomNumber: '5C', status: '入居中', occupantName: '上田 清江', moveInDate: '2025-03-07', expectedCareLevel: '要介護3' },
      { buildingName: 'ルネッサンス', roomNumber: '6B', status: '入居中', occupantName: '小山 美由紀', moveInDate: '2025-01-07', expectedCareLevel: 'なし' },
      { buildingName: 'ルネッサンス', roomNumber: '6C', status: '入居中', occupantName: '宮本 浩行', moveInDate: '2024-12-25', expectedCareLevel: 'なし' },
      { buildingName: 'ルネッサンス', roomNumber: '6D', status: '入居中', occupantName: '民森 正人', moveInDate: '2025-02-28', expectedCareLevel: '今後要確認予定' },
      // ── 空室 ──
      { buildingName: 'ルネッサンス', roomNumber: '2E', status: '空室' },
      // ── 会社利用 ──
      { buildingName: 'ルネッサンス', roomNumber: '1A', status: 'メンテナンス', note: '事務所' },
      { buildingName: 'ルネッサンス', roomNumber: '6A', status: 'メンテナンス', note: '会社利用' },
      { buildingName: 'ルネッサンス', roomNumber: '6E', status: 'メンテナンス', note: '社宅（2025/09/01〜）' },
    ],
  },
  {
    id: 'serene',
    name: 'セレーネ',
    rooms: [
      // ── 入居中 ──
      { buildingName: 'セレーネ', roomNumber: '608', status: '入居中', occupantName: '岡村 三男', moveInDate: '2025-08-08', expectedCareLevel: '要介護2', note: 'ルネ6Eより転居' },
      { buildingName: 'セレーネ', roomNumber: '703', status: '入居中', occupantName: '安藤 静子', moveInDate: '2025-09-30', expectedCareLevel: '要介護3' },
      { buildingName: 'セレーネ', roomNumber: '906', status: '入居中', occupantName: '藤本 敏博', moveInDate: '2024-12-06', expectedCareLevel: '要介護3' },
      { buildingName: 'セレーネ', roomNumber: '913', status: '入居中', occupantName: '加藤 敏子', moveInDate: '2025-07-10', expectedCareLevel: '要介護' },
      { buildingName: 'セレーネ', roomNumber: '1006', status: '入居中', occupantName: '荒木 のり子', moveInDate: '2025-08-27', expectedCareLevel: '要介護2' },
      // ── 空室 ──
      { buildingName: 'セレーネ', roomNumber: '801', status: '空室' },
      { buildingName: 'セレーネ', roomNumber: '813', status: '空室' },
      { buildingName: 'セレーネ', roomNumber: '915', status: '空室' },
      { buildingName: 'セレーネ', roomNumber: '1012', status: '空室' },
      // ── ショールーム・会社利用 ──
      { buildingName: 'セレーネ', roomNumber: '316', status: 'メンテナンス', note: 'ショールーム' },
      { buildingName: 'セレーネ', roomNumber: '908', status: 'メンテナンス', note: '詰所' },
      { buildingName: 'セレーネ', roomNumber: '916', status: 'メンテナンス', note: 'ランドリー' },
      { buildingName: 'セレーネ', roomNumber: '1005', status: 'メンテナンス', note: 'ショールーム' },
    ],
  },
];

/**
 * 施設ごとの集計を返す
 */
export function getFacilitySummary(facility: FacilitySeed) {
  const rooms = facility.rooms;
  const occupied = rooms.filter(r => r.status === '入居中').length;
  const reserved = rooms.filter(r => r.status === '予約').length;
  const vacant = rooms.filter(r => r.status === '空室').length;
  const maintenance = rooms.filter(r => r.status === 'メンテナンス').length;
  // 定員 = 入居中 + 予約 + 空室（会社利用等は含まない）
  const capacity = occupied + reserved + vacant;

  return { occupied, reserved, vacant, maintenance, capacity, total: rooms.length };
}
