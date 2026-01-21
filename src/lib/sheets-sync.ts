// ======== Google Sheets 同期ライブラリ ========
// 入居者情報・空室情報の定期同期

import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getSheetData } from './google-sheets';
import type { Resident, ResidentStatus } from '@/types/resident';
import type { CareLevel, Gender } from '@/types/prospect';

const DEFAULT_TENANT_ID = 'defaultTenant';
const SPREADSHEET_ID = '1y00PmqtKRCsyrvaH8ydO3QbzVbFXGEVA2dpKOUDJMaY';

// シートのgid（URLの gid=XXX 部分）
// TODO: 実際のgidに置き換え
const SHEET_GID = {
  prospects: 0,      // 入居希望者（既存）
  residents: 0,      // 入居者情報まとめ（要設定）
  vacancies: 0,      // 空室情報（要設定）
};

// ======== ヘルパー関数 ========

function normalizeCareLevel(value: string): CareLevel | undefined {
  const careLevelMap: Record<string, CareLevel> = {
    '自立': '自立',
    '要支援1': '要支援1',
    '要支援2': '要支援2',
    '要介護1': '要介護1',
    '要介護2': '要介護2',
    '要介護3': '要介護3',
    '要介護4': '要介護4',
    '要介護5': '要介護5',
    '申請中': '申請中',
  };
  return careLevelMap[value?.trim()] || undefined;
}

function normalizeGender(value: string): Gender | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (v === '男' || v === '男性') return '男性';
  if (v === '女' || v === '女性') return '女性';
  return '不明';
}

function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

// ======== 入居者同期 ========

interface ResidentColumnMapping {
  externalId?: number;      // 社内No.など
  name?: number;            // 氏名
  age?: number;             // 年齢
  gender?: number;          // 性別
  careLevel?: number;       // 介護度
  facilityName?: number;    // 施設名
  roomNumber?: number;      // 部屋番号
  moveInDate?: number;      // 入居日
  status?: number;          // ステータス
  salesCompanyName?: number; // 紹介会社
  monthlyFee?: number;      // 月額
  note?: number;            // 備考
}

function detectResidentColumnMapping(headers: string[]): ResidentColumnMapping {
  const mapping: ResidentColumnMapping = {};

  const patterns: { key: keyof ResidentColumnMapping; patterns: string[] }[] = [
    { key: 'externalId', patterns: ['社内no', 'no.', '番号', 'id', '管理番号'] },
    { key: 'name', patterns: ['氏名', '名前', '入居者名', '顧客名'] },
    { key: 'age', patterns: ['年齢'] },
    { key: 'gender', patterns: ['性別'] },
    { key: 'careLevel', patterns: ['介護度'] },
    { key: 'facilityName', patterns: ['施設名', '施設', '入居施設', 'ホーム名'] },
    { key: 'roomNumber', patterns: ['部屋', '居室', 'room', '号室'] },
    { key: 'moveInDate', patterns: ['入居日', '入居年月日'] },
    { key: 'status', patterns: ['ステータス', '状態', '入居状況'] },
    { key: 'salesCompanyName', patterns: ['紹介会社', '営業会社', '紹介元'] },
    { key: 'monthlyFee', patterns: ['月額', '費用', '利用料'] },
    { key: 'note', patterns: ['備考', 'メモ', 'その他'] },
  ];

  headers.forEach((header, index) => {
    const lowerHeader = header.toLowerCase().trim();
    for (const { key, patterns: patternList } of patterns) {
      if (mapping[key] === undefined && patternList.some((p) => lowerHeader.includes(p))) {
        mapping[key] = index;
        break;
      }
    }
  });

  return mapping;
}

function normalizeResidentStatus(value: string): ResidentStatus {
  const statusMap: Record<string, ResidentStatus> = {
    '入居中': '入居中',
    '入居': '入居中',
    '退去予定': '退去予定',
    '退去済': '退去済',
    '退去': '退去済',
    '一時外出': '一時外出',
    '外出': '一時外出',
  };
  return statusMap[value?.trim()] || '入居中';
}

export async function syncResidentsFromSheet(
  gid: number = SHEET_GID.residents
): Promise<{
  success: boolean;
  totalRows: number;
  synced: number;
  skipped: number;
  errors: string[];
}> {
  const result = {
    success: false,
    totalRows: 0,
    synced: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    const data = await getSheetData(SPREADSHEET_ID, gid);
    if (!data || data.length === 0) {
      result.errors.push('シートからデータを取得できませんでした');
      return result;
    }

    const headers = data[0];
    const mapping = detectResidentColumnMapping(headers);

    if (!mapping.name) {
      result.errors.push('氏名列が見つかりません');
      return result;
    }

    result.totalRows = data.length - 1;

    const db = getAdminDb();
    const batch = db.batch();
    let batchCount = 0;

    // 既存の入居者をexternalIdでマップ
    const existingSnapshot = await db
      .collection('residents')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .get();

    const existingByExternalId = new Map<string, string>();
    existingSnapshot.docs.forEach((doc) => {
      const d = doc.data();
      if (d.externalId) {
        existingByExternalId.set(d.externalId, doc.id);
      }
    });

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.every((cell) => !cell?.trim())) {
        result.skipped++;
        continue;
      }

      try {
        const getValue = (colIndex?: number) => {
          if (colIndex === undefined) return undefined;
          return row[colIndex]?.trim() || undefined;
        };

        const name = getValue(mapping.name);
        if (!name) {
          result.skipped++;
          continue;
        }

        const externalId = getValue(mapping.externalId) || `ROW-${i}`;
        const ageStr = getValue(mapping.age);
        const ageMatch = ageStr?.match(/(\d+)/);
        const age = ageMatch ? parseInt(ageMatch[1], 10) : undefined;

        const residentData: Partial<Resident> = {
          tenantId: DEFAULT_TENANT_ID,
          externalId,
          name,
          age: age && !isNaN(age) ? age : undefined,
          gender: normalizeGender(getValue(mapping.gender) || ''),
          careLevel: normalizeCareLevel(getValue(mapping.careLevel) || ''),
          facilityName: getValue(mapping.facilityName),
          roomNumber: getValue(mapping.roomNumber),
          moveInDate: getValue(mapping.moveInDate),
          status: normalizeResidentStatus(getValue(mapping.status) || ''),
          salesCompanyName: getValue(mapping.salesCompanyName),
          source: 'google-sheets-sync',
          syncedAt: new Date(),
        };

        const cleanedData = removeUndefined(residentData as Record<string, unknown>);

        // 既存レコードがあれば更新、なければ新規作成
        const existingId = existingByExternalId.get(externalId);
        if (existingId) {
          const docRef = db.collection('residents').doc(existingId);
          batch.update(docRef, {
            ...cleanedData,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          const docRef = db.collection('residents').doc();
          batch.set(docRef, {
            ...cleanedData,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        batchCount++;
        result.synced++;

        // バッチは500件まで
        if (batchCount >= 500) {
          await batch.commit();
          batchCount = 0;
        }
      } catch (rowError) {
        result.errors.push(`行${i + 1}: ${rowError instanceof Error ? rowError.message : '処理エラー'}`);
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    result.success = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : '同期エラー');
  }

  return result;
}

// ======== 空室同期 ========

interface VacancyColumnMapping {
  facilityName?: number;    // 施設名
  vacantCount?: number;     // 空室数
  totalRooms?: number;      // 総部屋数
  note?: number;            // 備考
  area?: number;            // エリア
}

function detectVacancyColumnMapping(headers: string[]): VacancyColumnMapping {
  const mapping: VacancyColumnMapping = {};

  const patterns: { key: keyof VacancyColumnMapping; patterns: string[] }[] = [
    { key: 'facilityName', patterns: ['施設名', '施設', 'ホーム名', '名称'] },
    { key: 'vacantCount', patterns: ['空室数', '空室', '空き', '残室'] },
    { key: 'totalRooms', patterns: ['総部屋数', '定員', '部屋数', '総数'] },
    { key: 'note', patterns: ['備考', 'メモ', 'その他', '注記'] },
    { key: 'area', patterns: ['エリア', '地域', '地区'] },
  ];

  headers.forEach((header, index) => {
    const lowerHeader = header.toLowerCase().trim();
    for (const { key, patterns: patternList } of patterns) {
      if (mapping[key] === undefined && patternList.some((p) => lowerHeader.includes(p))) {
        mapping[key] = index;
        break;
      }
    }
  });

  return mapping;
}

export async function syncVacanciesFromSheet(
  gid: number = SHEET_GID.vacancies
): Promise<{
  success: boolean;
  totalRows: number;
  synced: number;
  skipped: number;
  errors: string[];
}> {
  const result = {
    success: false,
    totalRows: 0,
    synced: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    const data = await getSheetData(SPREADSHEET_ID, gid);
    if (!data || data.length === 0) {
      result.errors.push('シートからデータを取得できませんでした');
      return result;
    }

    const headers = data[0];
    const mapping = detectVacancyColumnMapping(headers);

    if (!mapping.facilityName) {
      result.errors.push('施設名列が見つかりません');
      return result;
    }

    result.totalRows = data.length - 1;

    const db = getAdminDb();

    // 既存の施設を取得
    const facilitiesSnapshot = await db
      .collection('facilities')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .get();

    const facilityByName = new Map<string, string>();
    facilitiesSnapshot.docs.forEach((doc) => {
      const d = doc.data();
      if (d.name) {
        facilityByName.set(d.name.toLowerCase(), doc.id);
      }
    });

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.every((cell) => !cell?.trim())) {
        result.skipped++;
        continue;
      }

      try {
        const getValue = (colIndex?: number) => {
          if (colIndex === undefined) return undefined;
          return row[colIndex]?.trim() || undefined;
        };

        const facilityName = getValue(mapping.facilityName);
        if (!facilityName) {
          result.skipped++;
          continue;
        }

        const vacantCountStr = getValue(mapping.vacantCount);
        const vacantCount = vacantCountStr ? parseInt(vacantCountStr, 10) : 0;

        // 施設が存在しない場合は作成
        let facilityId = facilityByName.get(facilityName.toLowerCase());
        if (!facilityId) {
          const totalRoomsStr = getValue(mapping.totalRooms);
          const totalRooms = totalRoomsStr ? parseInt(totalRoomsStr, 10) : undefined;

          const facilityDoc = await db.collection('facilities').add({
            tenantId: DEFAULT_TENANT_ID,
            name: facilityName,
            area: getValue(mapping.area),
            capacity: totalRooms,
            isActive: true,
            createdAt: FieldValue.serverTimestamp(),
          });
          facilityId = facilityDoc.id;
          facilityByName.set(facilityName.toLowerCase(), facilityId);
        }

        // 空室状態を更新
        const vacancyRef = db.collection('vacancyStatus').doc(facilityId);
        await vacancyRef.set(
          {
            facilityId,
            vacantCount: isNaN(vacantCount) ? 0 : vacantCount,
            note: getValue(mapping.note),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: 'system-sync',
            updatedByName: 'Google Sheets同期',
          },
          { merge: true }
        );

        result.synced++;
      } catch (rowError) {
        result.errors.push(`行${i + 1}: ${rowError instanceof Error ? rowError.message : '処理エラー'}`);
      }
    }

    result.success = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : '同期エラー');
  }

  return result;
}

// ======== 全体同期 ========

export async function syncAllFromSheets(): Promise<{
  residents: Awaited<ReturnType<typeof syncResidentsFromSheet>>;
  vacancies: Awaited<ReturnType<typeof syncVacanciesFromSheet>>;
  syncedAt: Date;
}> {
  const [residents, vacancies] = await Promise.all([
    syncResidentsFromSheet(),
    syncVacanciesFromSheet(),
  ]);

  // 同期ログを保存
  await getAdminDb().collection('syncLogs').add({
    tenantId: DEFAULT_TENANT_ID,
    type: 'google-sheets-sync',
    results: {
      residents: {
        success: residents.success,
        synced: residents.synced,
        errors: residents.errors.length,
      },
      vacancies: {
        success: vacancies.success,
        synced: vacancies.synced,
        errors: vacancies.errors.length,
      },
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    residents,
    vacancies,
    syncedAt: new Date(),
  };
}

// gid設定を更新
export function setSheetGid(type: 'prospects' | 'residents' | 'vacancies', gid: number) {
  SHEET_GID[type] = gid;
}

export function getSheetGid() {
  return { ...SHEET_GID };
}
