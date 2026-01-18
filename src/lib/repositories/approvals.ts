// ============================================================
// 稟議 リポジトリ
// ============================================================

import { supabase, uploadFile, deleteFile, STORAGE_BUCKETS } from '@/lib/supabase';
import {
  Approval,
  ApprovalAction,
  ApprovalAttachment,
  ApprovalStatus,
  ApprovalActionType,
  ApprovalFormData,
  UserRole,
  ApproverRole,
} from '@/types/database';

// 承認フローの定義（5段階）
// スタッフ → サ責 → 拠点責任者 → 事業マネージャー → 本部長兼副社長
const APPROVAL_FLOW: { status: ApprovalStatus; nextStatus: ApprovalStatus; role: ApproverRole }[] = [
  { status: 'level1_pending', nextStatus: 'level2_pending', role: 'service_chief' },
  { status: 'level2_pending', nextStatus: 'level3_pending', role: 'facility_manager' },
  { status: 'level3_pending', nextStatus: 'level4_pending', role: 'area_manager' },
  { status: 'level4_pending', nextStatus: 'approved', role: 'hq' },
];

// ロールから承認可能なステータスを取得
function getApprovableStatuses(role: UserRole): ApprovalStatus[] {
  switch (role) {
    case 'service_chief':
      return ['level1_pending'];
    case 'facility_manager':
      return ['level1_pending', 'level2_pending'];
    case 'area_manager':
      return ['level1_pending', 'level2_pending', 'level3_pending'];
    case 'hq':
    case 'admin':
      return ['level1_pending', 'level2_pending', 'level3_pending', 'level4_pending'];
    default:
      return [];
  }
}

export interface ApprovalFilter {
  status?: ApprovalStatus;
  category?: string;
  facility_id?: string;
  applicant_id?: string;
  pending_for_role?: UserRole;
  is_overdue?: boolean;
  search?: string;
}

export interface ApprovalListResult {
  data: Approval[];
  count: number;
}

// 稟議一覧取得
export async function getApprovals(
  filter: ApprovalFilter = {},
  page = 1,
  pageSize = 20
): Promise<ApprovalListResult> {
  let query = supabase
    .from('approvals')
    .select(
      `
      *,
      profiles!approvals_applicant_id_fkey(display_name),
      facilities!approvals_facility_id_fkey(name)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  // フィルター適用
  if (filter.status) {
    query = query.eq('status', filter.status);
  }
  if (filter.category) {
    query = query.eq('category', filter.category);
  }
  if (filter.facility_id) {
    query = query.eq('facility_id', filter.facility_id);
  }
  if (filter.applicant_id) {
    query = query.eq('applicant_id', filter.applicant_id);
  }
  if (filter.pending_for_role) {
    query = query.eq('current_approver_role', filter.pending_for_role);
  }
  if (filter.is_overdue) {
    const today = new Date().toISOString().split('T')[0];
    query = query
      .lt('desired_due_date', today)
      .not('status', 'in', '(approved,rejected)');
  }
  if (filter.search) {
    query = query.or(`title.ilike.%${filter.search}%,description.ilike.%${filter.search}%`);
  }

  // ページング
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching approvals:', error);
    throw error;
  }

  // データ整形
  const approvals = (data || []).map((item) => ({
    ...item,
    applicant_name: item.profiles?.display_name,
    facility_name: item.facilities?.name,
  }));

  return {
    data: approvals,
    count: count || 0,
  };
}

// 稟議詳細取得
export async function getApproval(id: string): Promise<Approval | null> {
  const { data, error } = await supabase
    .from('approvals')
    .select(
      `
      *,
      profiles!approvals_applicant_id_fkey(display_name),
      facilities!approvals_facility_id_fkey(name)
    `
    )
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching approval:', error);
    throw error;
  }

  return {
    ...data,
    applicant_name: data.profiles?.display_name,
    facility_name: data.facilities?.name,
  };
}

// 稟議作成
export async function createApproval(
  formData: ApprovalFormData,
  organizationId: string,
  facilityId: string,
  applicantId: string
): Promise<Approval> {
  const { data, error } = await supabase
    .from('approvals')
    .insert({
      organization_id: organizationId,
      facility_id: facilityId,
      applicant_id: applicantId,
      title: formData.title,
      description: formData.description,
      amount: formData.amount || null,
      category: formData.category,
      desired_due_date: formData.desired_due_date || null,
      status: 'level1_pending',
      current_approver_role: 'service_chief', // サ責が一次承認
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating approval:', error);
    throw error;
  }

  // 申請アクションを記録
  await recordApprovalAction(data.id, applicantId, 'submit', 'submitted', 'level1_pending', null);

  return data;
}

// 承認アクション記録
async function recordApprovalAction(
  approvalId: string,
  actorId: string,
  actionType: ApprovalActionType,
  fromStatus: string,
  toStatus: string,
  comment: string | null
): Promise<void> {
  const { error } = await supabase.from('approval_actions').insert({
    approval_id: approvalId,
    actor_id: actorId,
    action_type: actionType,
    from_status: fromStatus,
    to_status: toStatus,
    comment,
  });

  if (error) {
    console.error('Error recording approval action:', error);
    throw error;
  }
}

// 承認
export async function approveApproval(
  id: string,
  actorId: string,
  actorRole: UserRole,
  comment?: string
): Promise<void> {
  const approval = await getApproval(id);
  if (!approval) throw new Error('Approval not found');

  // ユーザーがこのステータスを承認できるか確認
  const approvableStatuses = getApprovableStatuses(actorRole);
  if (!approvableStatuses.includes(approval.status as ApprovalStatus)) {
    throw new Error(`権限がありません: ${approval.status}`);
  }

  // 現在のステータスから次のステータスを取得
  const currentFlow = APPROVAL_FLOW.find(f => f.status === approval.status);
  if (!currentFlow) {
    throw new Error(`Cannot approve from status: ${approval.status}`);
  }

  const newStatus = currentFlow.nextStatus;
  let newApproverRole: ApproverRole | null = null;

  // 次のステータスがapproved以外の場合、次の承認者ロールを設定
  if (newStatus !== 'approved') {
    const nextFlow = APPROVAL_FLOW.find(f => f.status === newStatus);
    newApproverRole = nextFlow?.role || null;
  }

  // 承認完了時（approved）に追加ポイント付与
  if (newStatus === 'approved') {
    await supabase.from('point_ledger').insert({
      organization_id: approval.organization_id,
      user_id: approval.applicant_id,
      source_type: 'approval_approved',
      source_id: id,
      points: 5,
      reason: '稟議承認完了',
    });
  }

  // 稟議を更新
  const { error } = await supabase
    .from('approvals')
    .update({
      status: newStatus,
      current_approver_role: newApproverRole,
    })
    .eq('id', id);

  if (error) {
    console.error('Error approving:', error);
    throw error;
  }

  // アクション記録
  await recordApprovalAction(id, actorId, 'approve', approval.status, newStatus, comment || null);
}

// 差戻し
export async function returnApproval(
  id: string,
  actorId: string,
  comment: string
): Promise<void> {
  if (!comment || comment.trim() === '') {
    throw new Error('差戻しにはコメントが必須です');
  }

  const approval = await getApproval(id);
  if (!approval) throw new Error('Approval not found');

  const newStatus: ApprovalStatus = 'returned';

  const { error } = await supabase
    .from('approvals')
    .update({
      status: newStatus,
      current_approver_role: null,
    })
    .eq('id', id);

  if (error) {
    console.error('Error returning:', error);
    throw error;
  }

  // アクション記録
  await recordApprovalAction(id, actorId, 'return', approval.status, newStatus, comment);
}

// 却下
export async function rejectApproval(
  id: string,
  actorId: string,
  comment: string
): Promise<void> {
  if (!comment || comment.trim() === '') {
    throw new Error('却下にはコメントが必須です');
  }

  const approval = await getApproval(id);
  if (!approval) throw new Error('Approval not found');

  const newStatus: ApprovalStatus = 'rejected';

  const { error } = await supabase
    .from('approvals')
    .update({
      status: newStatus,
      current_approver_role: null,
    })
    .eq('id', id);

  if (error) {
    console.error('Error rejecting:', error);
    throw error;
  }

  // アクション記録
  await recordApprovalAction(id, actorId, 'reject', approval.status, newStatus, comment);
}

// 再申請（差戻しからの再提出）
export async function resubmitApproval(
  id: string,
  applicantId: string,
  updates: Partial<ApprovalFormData>
): Promise<void> {
  const approval = await getApproval(id);
  if (!approval) throw new Error('Approval not found');
  if (approval.status !== 'returned') {
    throw new Error('再申請は差戻し状態からのみ可能です');
  }

  const newStatus: ApprovalStatus = 'level1_pending';

  const { error } = await supabase
    .from('approvals')
    .update({
      ...updates,
      status: newStatus,
      current_approver_role: 'service_chief', // サ責が一次承認
    })
    .eq('id', id);

  if (error) {
    console.error('Error resubmitting:', error);
    throw error;
  }

  // アクション記録
  await recordApprovalAction(id, applicantId, 'submit', approval.status, newStatus, '再申請');
}

// アクション履歴取得
export async function getApprovalActions(approvalId: string): Promise<ApprovalAction[]> {
  const { data, error } = await supabase
    .from('approval_actions')
    .select(
      `
      *,
      profiles!approval_actions_actor_id_fkey(display_name, role)
    `
    )
    .eq('approval_id', approvalId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching actions:', error);
    throw error;
  }

  return (data || []).map((item) => ({
    ...item,
    actor_name: item.profiles?.display_name,
    actor_role: item.profiles?.role,
  }));
}

// 添付ファイル一覧取得
export async function getApprovalAttachments(approvalId: string): Promise<ApprovalAttachment[]> {
  const { data, error } = await supabase
    .from('approval_attachments')
    .select('*')
    .eq('approval_id', approvalId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching attachments:', error);
    throw error;
  }

  return data || [];
}

// 添付ファイルアップロード
export async function uploadApprovalAttachment(
  approvalId: string,
  userId: string,
  file: File
): Promise<ApprovalAttachment | null> {
  const timestamp = Date.now();
  const path = `${approvalId}/${timestamp}_${file.name}`;

  const result = await uploadFile(STORAGE_BUCKETS.APPROVALS, path, file);
  if (!result) return null;

  const { data, error } = await supabase
    .from('approval_attachments')
    .insert({
      approval_id: approvalId,
      file_path: result.path,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      uploaded_by: userId,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving attachment record:', error);
    await deleteFile(STORAGE_BUCKETS.APPROVALS, result.path);
    throw error;
  }

  return data;
}

// 添付ファイル削除
export async function deleteApprovalAttachment(attachment: ApprovalAttachment): Promise<void> {
  const { error } = await supabase.from('approval_attachments').delete().eq('id', attachment.id);

  if (error) {
    console.error('Error deleting attachment record:', error);
    throw error;
  }

  await deleteFile(STORAGE_BUCKETS.APPROVALS, attachment.file_path);
}

// 滞留稟議カウント取得
export async function getOverdueCount(organizationId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];

  const { count, error } = await supabase
    .from('approvals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .lt('desired_due_date', today)
    .not('status', 'in', '(approved,rejected)');

  if (error) {
    console.error('Error counting overdue approvals:', error);
    return 0;
  }

  return count || 0;
}

// 承認待ち件数取得（ロール別）
export async function getPendingCountByRole(
  facilityId: string,
  organizationId: string,
  role: UserRole
): Promise<number> {
  let query = supabase
    .from('approvals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  // 各ロールが承認可能なステータスをフィルタリング
  switch (role) {
    case 'service_chief':
      // サ責は自拠点のlevel1_pendingのみ
      query = query.eq('facility_id', facilityId).eq('status', 'level1_pending');
      break;
    case 'facility_manager':
      // 拠点責任者は自拠点のlevel1_pending, level2_pending
      query = query.eq('facility_id', facilityId).in('status', ['level1_pending', 'level2_pending']);
      break;
    case 'area_manager':
      // 事業マネージャーはlevel1_pending, level2_pending, level3_pending
      query = query.in('status', ['level1_pending', 'level2_pending', 'level3_pending']);
      break;
    case 'hq':
    case 'admin':
      // 本部長/管理者は全レベル
      query = query.in('status', ['level1_pending', 'level2_pending', 'level3_pending', 'level4_pending']);
      break;
    default:
      return 0;
  }

  const { count, error } = await query;

  if (error) {
    console.error('Error counting pending approvals:', error);
    return 0;
  }

  return count || 0;
}

// ユーザーが承認可能かどうかを判定
export function canApprove(role: UserRole, status: ApprovalStatus): boolean {
  const approvableStatuses = getApprovableStatuses(role);
  return approvableStatuses.includes(status);
}

// 承認フロー情報を取得
export function getApprovalFlowInfo(status: ApprovalStatus): {
  currentLevel: number;
  totalLevels: number;
  currentApprover: string;
  nextApprover: string | null;
} {
  const levels: { [key: string]: { level: number; name: string; next: string | null } } = {
    'level1_pending': { level: 1, name: 'サ責', next: '拠点責任者' },
    'level2_pending': { level: 2, name: '拠点責任者', next: '事業マネージャー' },
    'level3_pending': { level: 3, name: '事業マネージャー', next: '本部長' },
    'level4_pending': { level: 4, name: '本部長', next: null },
  };

  const info = levels[status];
  if (!info) {
    return { currentLevel: 0, totalLevels: 4, currentApprover: '', nextApprover: null };
  }

  return {
    currentLevel: info.level,
    totalLevels: 4,
    currentApprover: info.name,
    nextApprover: info.next,
  };
}
