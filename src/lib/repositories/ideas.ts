// ============================================================
// 改善アイデア リポジトリ
// ============================================================

import { supabase, uploadFile, deleteFile, STORAGE_BUCKETS } from '@/lib/supabase';
import {
  ImprovementIdea,
  IdeaComment,
  IdeaAttachment,
  IdeaStatus,
  IdeaFormData,
} from '@/types/database';

export interface IdeaFilter {
  status?: IdeaStatus;
  category?: string;
  facility_id?: string;
  created_by?: string;
  search?: string;
}

export interface IdeaListResult {
  data: ImprovementIdea[];
  count: number;
}

// アイデア一覧取得
export async function getIdeas(
  filter: IdeaFilter = {},
  page = 1,
  pageSize = 20
): Promise<IdeaListResult> {
  let query = supabase
    .from('improvement_ideas')
    .select(
      `
      *,
      profiles!improvement_ideas_created_by_fkey(display_name),
      facilities!improvement_ideas_facility_id_fkey(name)
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
  if (filter.created_by) {
    query = query.eq('created_by', filter.created_by);
  }
  if (filter.search) {
    query = query.or(`problem.ilike.%${filter.search}%,idea.ilike.%${filter.search}%`);
  }

  // ページング
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching ideas:', error);
    throw error;
  }

  // データ整形
  const ideas = (data || []).map((item) => ({
    ...item,
    creator_name: item.profiles?.display_name,
    facility_name: item.facilities?.name,
  }));

  return {
    data: ideas,
    count: count || 0,
  };
}

// アイデア詳細取得
export async function getIdea(id: string): Promise<ImprovementIdea | null> {
  const { data, error } = await supabase
    .from('improvement_ideas')
    .select(
      `
      *,
      profiles!improvement_ideas_created_by_fkey(display_name),
      facilities!improvement_ideas_facility_id_fkey(name)
    `
    )
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching idea:', error);
    throw error;
  }

  return {
    ...data,
    creator_name: data.profiles?.display_name,
    facility_name: data.facilities?.name,
  };
}

// アイデア作成
export async function createIdea(
  formData: IdeaFormData,
  organizationId: string,
  facilityId: string,
  userId: string
): Promise<ImprovementIdea> {
  const { data, error } = await supabase
    .from('improvement_ideas')
    .insert({
      organization_id: organizationId,
      facility_id: facilityId,
      created_by: userId,
      category: formData.category,
      problem: formData.problem,
      idea: formData.idea,
      expected_effects: formData.expected_effects,
      difficulty: formData.difficulty,
      cost_level: formData.cost_level,
      status: 'submitted',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating idea:', error);
    throw error;
  }

  return data;
}

// アイデア更新
export async function updateIdea(
  id: string,
  updates: Partial<ImprovementIdea>
): Promise<ImprovementIdea> {
  const { data, error } = await supabase
    .from('improvement_ideas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating idea:', error);
    throw error;
  }

  return data;
}

// ステータス更新
export async function updateIdeaStatus(
  id: string,
  status: IdeaStatus,
  organizationId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase.from('improvement_ideas').update({ status }).eq('id', id);

  if (error) {
    console.error('Error updating idea status:', error);
    throw error;
  }

  // 採用時に追加ポイント付与
  if (status === 'adopted') {
    const { data: idea } = await supabase
      .from('improvement_ideas')
      .select('created_by')
      .eq('id', id)
      .single();

    if (idea) {
      await supabase.from('point_ledger').insert({
        organization_id: organizationId,
        user_id: idea.created_by,
        source_type: 'idea_adopted',
        source_id: id,
        points: 10,
        reason: '改善アイデア採用',
      });

      await supabase
        .from('improvement_ideas')
        .update({ points_awarded: supabase.rpc('increment', { x: 10 }) })
        .eq('id', id);
    }
  }

  // 実装完了時に追加ポイント付与
  if (status === 'implemented') {
    const { data: idea } = await supabase
      .from('improvement_ideas')
      .select('created_by')
      .eq('id', id)
      .single();

    if (idea) {
      await supabase.from('point_ledger').insert({
        organization_id: organizationId,
        user_id: idea.created_by,
        source_type: 'idea_implemented',
        source_id: id,
        points: 15,
        reason: '改善アイデア実装完了',
      });
    }
  }
}

// コメント一覧取得
export async function getIdeaComments(ideaId: string): Promise<IdeaComment[]> {
  const { data, error } = await supabase
    .from('idea_comments')
    .select(
      `
      *,
      profiles!idea_comments_user_id_fkey(display_name)
    `
    )
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching comments:', error);
    throw error;
  }

  return (data || []).map((item) => ({
    ...item,
    user_name: item.profiles?.display_name,
  }));
}

// コメント追加
export async function addIdeaComment(
  ideaId: string,
  userId: string,
  content: string
): Promise<IdeaComment> {
  const { data, error } = await supabase
    .from('idea_comments')
    .insert({
      idea_id: ideaId,
      user_id: userId,
      content,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding comment:', error);
    throw error;
  }

  return data;
}

// 添付ファイル一覧取得
export async function getIdeaAttachments(ideaId: string): Promise<IdeaAttachment[]> {
  const { data, error } = await supabase
    .from('idea_attachments')
    .select('*')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching attachments:', error);
    throw error;
  }

  return data || [];
}

// 添付ファイルアップロード
export async function uploadIdeaAttachment(
  ideaId: string,
  userId: string,
  file: File
): Promise<IdeaAttachment | null> {
  const timestamp = Date.now();
  const path = `${ideaId}/${timestamp}_${file.name}`;

  const result = await uploadFile(STORAGE_BUCKETS.IDEAS, path, file);
  if (!result) return null;

  const { data, error } = await supabase
    .from('idea_attachments')
    .insert({
      idea_id: ideaId,
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
    await deleteFile(STORAGE_BUCKETS.IDEAS, result.path);
    throw error;
  }

  return data;
}

// 添付ファイル削除
export async function deleteIdeaAttachment(attachment: IdeaAttachment): Promise<void> {
  const { error } = await supabase.from('idea_attachments').delete().eq('id', attachment.id);

  if (error) {
    console.error('Error deleting attachment record:', error);
    throw error;
  }

  await deleteFile(STORAGE_BUCKETS.IDEAS, attachment.file_path);
}
