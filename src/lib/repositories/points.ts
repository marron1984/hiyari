// ============================================================
// ポイント台帳 リポジトリ
// ============================================================

import { supabase } from '@/lib/supabase';
import { PointLedger, PointSourceType, MonthlyUserStats, MonthlyFacilityStats } from '@/types/database';

export interface PointFilter {
  user_id?: string;
  facility_id?: string;
  source_type?: PointSourceType;
  from_date?: string;
  to_date?: string;
}

export interface PointListResult {
  data: PointLedger[];
  count: number;
}

// ポイント履歴取得
export async function getPointHistory(
  filter: PointFilter = {},
  page = 1,
  pageSize = 50
): Promise<PointListResult> {
  let query = supabase
    .from('point_ledger')
    .select(
      `
      *,
      profiles!point_ledger_user_id_fkey(display_name)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  // フィルター適用
  if (filter.user_id) {
    query = query.eq('user_id', filter.user_id);
  }
  if (filter.source_type) {
    query = query.eq('source_type', filter.source_type);
  }
  if (filter.from_date) {
    query = query.gte('created_at', filter.from_date);
  }
  if (filter.to_date) {
    query = query.lte('created_at', filter.to_date);
  }

  // ページング
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching point history:', error);
    throw error;
  }

  const points = (data || []).map((item) => ({
    ...item,
    user_name: item.profiles?.display_name,
  }));

  return {
    data: points,
    count: count || 0,
  };
}

// ユーザーの合計ポイント取得
export async function getUserTotalPoints(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('point_ledger')
    .select('points')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching total points:', error);
    return 0;
  }

  return (data || []).reduce((sum, item) => sum + item.points, 0);
}

// ユーザーの今月ポイント取得
export async function getUserMonthlyPoints(userId: string, yearMonth?: string): Promise<number> {
  const now = new Date();
  const year = yearMonth ? parseInt(yearMonth.substring(0, 4)) : now.getFullYear();
  const month = yearMonth ? parseInt(yearMonth.substring(4, 6)) : now.getMonth() + 1;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('point_ledger')
    .select('points')
    .eq('user_id', userId)
    .gte('created_at', startDate)
    .lte('created_at', `${endDate}T23:59:59`);

  if (error) {
    console.error('Error fetching monthly points:', error);
    return 0;
  }

  return (data || []).reduce((sum, item) => sum + item.points, 0);
}

// 月次ユーザーランキング取得
export async function getMonthlyUserRanking(
  organizationId: string,
  yearMonth?: string,
  facilityId?: string,
  limit = 10
): Promise<MonthlyUserStats[]> {
  const now = new Date();
  const year = yearMonth ? parseInt(yearMonth.substring(0, 4)) : now.getFullYear();
  const month = yearMonth ? parseInt(yearMonth.substring(4, 6)) : now.getMonth() + 1;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  // ポイント集計のカスタムクエリ
  const { data, error } = await supabase.rpc('get_monthly_user_ranking', {
    p_organization_id: organizationId,
    p_start_date: startDate,
    p_end_date: `${endDate}T23:59:59`,
    p_facility_id: facilityId || null,
    p_limit: limit,
  });

  if (error) {
    console.error('Error fetching user ranking:', error);
    // フォールバック: 単純なクエリ
    return getMonthlyUserRankingFallback(organizationId, startDate, endDate, facilityId, limit);
  }

  return data || [];
}

// ランキング取得のフォールバック（RPCが使えない場合）
async function getMonthlyUserRankingFallback(
  organizationId: string,
  startDate: string,
  endDate: string,
  facilityId?: string,
  limit = 10
): Promise<MonthlyUserStats[]> {
  let query = supabase
    .from('point_ledger')
    .select(
      `
      user_id,
      points,
      source_type,
      profiles!point_ledger_user_id_fkey(
        display_name,
        facility_id,
        facilities!profiles_facility_id_fkey(name)
      )
    `
    )
    .eq('organization_id', organizationId)
    .gte('created_at', startDate)
    .lte('created_at', `${endDate}T23:59:59`);

  const { data, error } = await query;

  if (error) {
    console.error('Error in fallback ranking:', error);
    return [];
  }

  // 手動で集計
  const userMap = new Map<string, MonthlyUserStats>();

  for (const item of data || []) {
    const userId = item.user_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = item.profiles as any;

    if (facilityId && profile?.facility_id !== facilityId) continue;

    if (!userMap.has(userId)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const facilities = profile?.facilities as any;
      userMap.set(userId, {
        user_id: userId,
        user_name: profile?.display_name || '',
        facility_id: profile?.facility_id || '',
        facility_name: facilities?.name || '',
        month: startDate.substring(0, 7),
        total_points: 0,
        incident_count: 0,
        idea_count: 0,
        approval_count: 0,
      });
    }

    const stats = userMap.get(userId)!;
    stats.total_points += item.points;

    if (item.source_type === 'incident_report') stats.incident_count++;
    if (item.source_type === 'idea_submission') stats.idea_count++;
    if (item.source_type === 'approval_submission') stats.approval_count++;
  }

  // ソートして上位を返す
  return Array.from(userMap.values())
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, limit);
}

// 月次事業所ランキング取得
export async function getMonthlyFacilityRanking(
  organizationId: string,
  yearMonth?: string,
  limit = 10
): Promise<MonthlyFacilityStats[]> {
  const now = new Date();
  const year = yearMonth ? parseInt(yearMonth.substring(0, 4)) : now.getFullYear();
  const month = yearMonth ? parseInt(yearMonth.substring(4, 6)) : now.getMonth() + 1;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  // ポイント集計
  const { data: pointData, error: pointError } = await supabase
    .from('point_ledger')
    .select(
      `
      points,
      source_type,
      profiles!point_ledger_user_id_fkey(
        id,
        facility_id
      )
    `
    )
    .eq('organization_id', organizationId)
    .gte('created_at', startDate)
    .lte('created_at', `${endDate}T23:59:59`);

  if (pointError) {
    console.error('Error fetching facility ranking:', pointError);
    return [];
  }

  // 事業所情報取得
  const { data: facilities, error: facilityError } = await supabase
    .from('facilities')
    .select('id, name')
    .eq('organization_id', organizationId);

  if (facilityError) {
    console.error('Error fetching facilities:', facilityError);
    return [];
  }

  // 集計
  const facilityMap = new Map<string, MonthlyFacilityStats>();

  // 事業所初期化
  for (const facility of facilities || []) {
    facilityMap.set(facility.id, {
      facility_id: facility.id,
      facility_name: facility.name,
      month: startDate.substring(0, 7),
      total_points: 0,
      active_users: 0,
      incident_count: 0,
      idea_count: 0,
    });
  }

  // ポイント集計
  const activeUsersSet = new Map<string, Set<string>>();

  for (const item of pointData || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = item.profiles as any;
    const facilityId = profile?.facility_id;
    if (!facilityId || !facilityMap.has(facilityId)) continue;

    const stats = facilityMap.get(facilityId)!;
    stats.total_points += item.points;

    if (item.source_type === 'incident_report') stats.incident_count++;
    if (item.source_type === 'idea_submission') stats.idea_count++;

    // アクティブユーザー数
    if (!activeUsersSet.has(facilityId)) {
      activeUsersSet.set(facilityId, new Set());
    }
    activeUsersSet.get(facilityId)!.add(profile!.id);
  }

  // アクティブユーザー数を反映
  for (const [facilityId, users] of activeUsersSet) {
    if (facilityMap.has(facilityId)) {
      facilityMap.get(facilityId)!.active_users = users.size;
    }
  }

  // ソートして返す
  return Array.from(facilityMap.values())
    .sort((a, b) => b.total_points - a.total_points)
    .slice(0, limit);
}

// 手動ポイント付与（adminのみ）
export async function awardBonusPoints(
  organizationId: string,
  userId: string,
  points: number,
  reason: string
): Promise<void> {
  const { error } = await supabase.from('point_ledger').insert({
    organization_id: organizationId,
    user_id: userId,
    source_type: 'bonus',
    source_id: null,
    points,
    reason,
  });

  if (error) {
    console.error('Error awarding bonus points:', error);
    throw error;
  }
}

// ポイント調整（adminのみ、減点も可能）
export async function adjustPoints(
  organizationId: string,
  userId: string,
  points: number,
  reason: string
): Promise<void> {
  const { error } = await supabase.from('point_ledger').insert({
    organization_id: organizationId,
    user_id: userId,
    source_type: 'adjustment',
    source_id: null,
    points,
    reason,
  });

  if (error) {
    console.error('Error adjusting points:', error);
    throw error;
  }
}

// ポイント集計サマリー取得
export async function getPointsSummary(
  organizationId: string,
  yearMonth?: string
): Promise<{
  totalPoints: number;
  incidentPoints: number;
  ideaPoints: number;
  approvalPoints: number;
  bonusPoints: number;
}> {
  const now = new Date();
  const year = yearMonth ? parseInt(yearMonth.substring(0, 4)) : now.getFullYear();
  const month = yearMonth ? parseInt(yearMonth.substring(4, 6)) : now.getMonth() + 1;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('point_ledger')
    .select('points, source_type')
    .eq('organization_id', organizationId)
    .gte('created_at', startDate)
    .lte('created_at', `${endDate}T23:59:59`);

  if (error) {
    console.error('Error fetching points summary:', error);
    return {
      totalPoints: 0,
      incidentPoints: 0,
      ideaPoints: 0,
      approvalPoints: 0,
      bonusPoints: 0,
    };
  }

  const summary = {
    totalPoints: 0,
    incidentPoints: 0,
    ideaPoints: 0,
    approvalPoints: 0,
    bonusPoints: 0,
  };

  for (const item of data || []) {
    summary.totalPoints += item.points;

    switch (item.source_type) {
      case 'incident_report':
        summary.incidentPoints += item.points;
        break;
      case 'idea_submission':
      case 'idea_adopted':
      case 'idea_implemented':
        summary.ideaPoints += item.points;
        break;
      case 'approval_submission':
      case 'approval_approved':
        summary.approvalPoints += item.points;
        break;
      case 'bonus':
      case 'adjustment':
        summary.bonusPoints += item.points;
        break;
    }
  }

  return summary;
}
