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
} from '@/types/database';

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
      current_approver_role: 'manager',
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

  let newStatus: ApprovalStatus;
  let newApproverRole: UserRole | null = null;

  // 現在のステータスに応じて次のステータスを決定
  if (approval.status === 'level1_pending') {
    // 一次承認完了 → 二次承認待ち
    newStatus = 'level2_pending';
    newApproverRole = 'hq';
  } else if (approval.status === 'level2_pending') {
    // 二次承認完了 → 承認済み
    newStatus = 'approved';
    newApproverRole = null;

    // 承認完了時に追加ポイント付与
    await supabase.from('point_ledger').insert({
      organization_id: approval.organization_id,
      user_id: approval.applicant_id,
      source_type: 'approval_approved',
      source_id: id,
      points: 5,
      reason: '稟議承認完了',
    });
  } else {
    throw new Error(`Cannot approve from status: ${approval.status}`);
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
      current_approver_role: 'manager',
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

  if (role === 'manager') {
    // managerは自拠点のlevel1_pendingのみ
    query = query.eq('facility_id', facilityId).eq('status', 'level1_pending');
  } else if (role === 'hq' || role === 'admin') {
    // hq/adminはlevel2_pending
    query = query.eq('status', 'level2_pending');
  } else {
    return 0;
  }

  const { count, error } = await query;

  if (error) {
    console.error('Error counting pending approvals:', error);
    return 0;
  }

  return count || 0;
}
