// ============================================================
// 誕生日 リポジトリ
// ============================================================

import { supabase, uploadFile, STORAGE_BUCKETS } from '@/lib/supabase';
import {
  BirthdayAlert,
  BirthdayAlertSettings,
  BirthdayImportLog,
  ImportDetail,
  Client,
  Profile,
} from '@/types/database';

// 誕生日アラート設定取得
export async function getBirthdayAlertSettings(
  organizationId: string
): Promise<BirthdayAlertSettings | null> {
  const { data, error } = await supabase
    .from('birthday_alert_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // 設定が存在しない場合はデフォルト値で作成
      return createDefaultBirthdaySettings(organizationId);
    }
    console.error('Error fetching birthday settings:', error);
    throw error;
  }

  return data;
}

// デフォルト設定作成
async function createDefaultBirthdaySettings(
  organizationId: string
): Promise<BirthdayAlertSettings> {
  const { data, error } = await supabase
    .from('birthday_alert_settings')
    .insert({
      organization_id: organizationId,
      days_before: 7,
      notify_time: '09:00',
      enabled: true,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating default birthday settings:', error);
    throw error;
  }

  return data;
}

// 誕生日アラート設定更新
export async function updateBirthdayAlertSettings(
  organizationId: string,
  settings: Partial<BirthdayAlertSettings>
): Promise<void> {
  const { error } = await supabase
    .from('birthday_alert_settings')
    .update(settings)
    .eq('organization_id', organizationId);

  if (error) {
    console.error('Error updating birthday settings:', error);
    throw error;
  }
}

// 誕生日アラート取得
export async function getBirthdayAlerts(
  organizationId: string,
  facilityId?: string,
  daysAhead = 7
): Promise<BirthdayAlert[]> {
  const alerts: BirthdayAlert[] = [];
  const today = new Date();

  // 利用者の誕生日取得
  let clientQuery = supabase
    .from('clients')
    .select('id, name, birthday, facility_id, facilities!clients_facility_id_fkey(name)')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .not('birthday', 'is', null);

  if (facilityId) {
    clientQuery = clientQuery.eq('facility_id', facilityId);
  }

  const { data: clients, error: clientError } = await clientQuery;

  if (clientError) {
    console.error('Error fetching client birthdays:', clientError);
  } else {
    for (const client of clients || []) {
      const daysUntil = calculateDaysUntilBirthday(client.birthday, today);
      if (daysUntil >= 0 && daysUntil <= daysAhead) {
        alerts.push({
          id: client.id,
          name: client.name,
          birthday: client.birthday,
          type: 'client',
          facility_id: client.facility_id,
          facility_name: client.facilities?.name,
          days_until: daysUntil,
        });
      }
    }
  }

  // 職員の誕生日取得
  let profileQuery = supabase
    .from('profiles')
    .select('id, display_name, birthday, facility_id, facilities!profiles_facility_id_fkey(name)')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .not('birthday', 'is', null);

  if (facilityId) {
    profileQuery = profileQuery.eq('facility_id', facilityId);
  }

  const { data: profiles, error: profileError } = await profileQuery;

  if (profileError) {
    console.error('Error fetching profile birthdays:', profileError);
  } else {
    for (const profile of profiles || []) {
      const daysUntil = calculateDaysUntilBirthday(profile.birthday, today);
      if (daysUntil >= 0 && daysUntil <= daysAhead) {
        alerts.push({
          id: profile.id,
          name: profile.display_name,
          birthday: profile.birthday,
          type: 'profile',
          facility_id: profile.facility_id,
          facility_name: profile.facilities?.name,
          days_until: daysUntil,
        });
      }
    }
  }

  // 日数でソート（本日が最初）
  return alerts.sort((a, b) => a.days_until - b.days_until);
}

// 誕生日までの日数を計算（年は無視）
function calculateDaysUntilBirthday(birthdayStr: string, today: Date): number {
  const birthday = new Date(birthdayStr);
  const thisYear = today.getFullYear();

  // 今年の誕生日
  const thisYearBirthday = new Date(thisYear, birthday.getMonth(), birthday.getDate());

  // 今年の誕生日が過ぎていたら来年の誕生日
  if (thisYearBirthday < today) {
    thisYearBirthday.setFullYear(thisYear + 1);
  }

  const diffTime = thisYearBirthday.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

// 取込履歴取得
export async function getBirthdayImportLogs(
  organizationId: string,
  page = 1,
  pageSize = 20
): Promise<{ data: BirthdayImportLog[]; count: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('birthday_import_logs')
    .select(
      `
      *,
      profiles!birthday_import_logs_uploaded_by_fkey(display_name)
    `,
      { count: 'exact' }
    )
    .eq('organization_id', organizationId)
    .order('imported_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching import logs:', error);
    throw error;
  }

  return {
    data: data || [],
    count: count || 0,
  };
}

// 取込履歴保存
export async function saveBirthdayImportLog(
  organizationId: string,
  uploadedBy: string,
  filePath: string,
  fileName: string,
  targetType: 'clients' | 'profiles',
  details: ImportDetail[]
): Promise<BirthdayImportLog> {
  const successRows = details.filter((d) => d.status === 'success').length;
  const failedRows = details.filter((d) => d.status === 'failed').length;

  const { data, error } = await supabase
    .from('birthday_import_logs')
    .insert({
      organization_id: organizationId,
      uploaded_by: uploadedBy,
      file_path: filePath,
      file_name: fileName,
      target_type: targetType,
      total_rows: details.length,
      success_rows: successRows,
      failed_rows: failedRows,
      import_details: details,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving import log:', error);
    throw error;
  }

  return data;
}

// PDFアップロード
export async function uploadBirthdayPdf(
  organizationId: string,
  userId: string,
  file: File
): Promise<string | null> {
  const timestamp = Date.now();
  const path = `${organizationId}/${timestamp}_${file.name}`;

  const result = await uploadFile(STORAGE_BUCKETS.BIRTHDAY_IMPORTS, path, file);
  return result?.path || null;
}

// 利用者の誕生日一括更新
export async function updateClientBirthdays(
  updates: { id: string; birthday: string }[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const update of updates) {
    const { error } = await supabase
      .from('clients')
      .update({ birthday: update.birthday })
      .eq('id', update.id);

    if (error) {
      console.error(`Error updating client ${update.id}:`, error);
      failed++;
    } else {
      success++;
    }
  }

  return { success, failed };
}

// 職員の誕生日一括更新
export async function updateProfileBirthdays(
  updates: { id: string; birthday: string }[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const update of updates) {
    const { error } = await supabase
      .from('profiles')
      .update({ birthday: update.birthday })
      .eq('id', update.id);

    if (error) {
      console.error(`Error updating profile ${update.id}:`, error);
      failed++;
    } else {
      success++;
    }
  }

  return { success, failed };
}

// 名前でマッチング検索（利用者）
export async function findClientsByName(
  organizationId: string,
  names: string[]
): Promise<Map<string, Client>> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('organization_id', organizationId);

  if (error) {
    console.error('Error fetching clients:', error);
    return new Map();
  }

  const result = new Map<string, Client>();

  for (const name of names) {
    const normalizedSearch = normalizeName(name);

    for (const client of data || []) {
      const normalizedClient = normalizeName(client.name);
      const normalizedKana = client.name_kana ? normalizeName(client.name_kana) : '';

      // マッチング優先度:
      // 1. 完全一致
      // 2. 空白除去一致
      // 3. 全角半角無視
      // 4. カナ一致
      if (
        client.name === name ||
        normalizedClient === normalizedSearch ||
        (normalizedKana && normalizedKana === normalizedSearch)
      ) {
        result.set(name, client);
        break;
      }
    }
  }

  return result;
}

// 名前でマッチング検索（職員）
export async function findProfilesByName(
  organizationId: string,
  names: string[]
): Promise<Map<string, Profile>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('organization_id', organizationId);

  if (error) {
    console.error('Error fetching profiles:', error);
    return new Map();
  }

  const result = new Map<string, Profile>();

  for (const name of names) {
    const normalizedSearch = normalizeName(name);

    for (const profile of data || []) {
      const normalizedProfile = normalizeName(profile.display_name);

      if (profile.display_name === name || normalizedProfile === normalizedSearch) {
        result.set(name, profile);
        break;
      }
    }
  }

  return result;
}

// 名前正規化（空白除去、全角半角統一）
function normalizeName(name: string): string {
  return name
    .replace(/[\s\u3000]+/g, '') // 空白除去
    .normalize('NFKC') // 全角半角統一
    .toLowerCase();
}
