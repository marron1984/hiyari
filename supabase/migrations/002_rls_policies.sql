-- ============================================================
-- ええかいご 管理コンソール - RLS ポリシー
-- Row Level Security Policies for Supabase
-- ============================================================

-- RLSを有効化
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE birthday_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE birthday_alert_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ヘルパー関数
-- ============================================================

-- 現在のユーザーのプロファイルを取得
CREATE OR REPLACE FUNCTION get_current_user_profile()
RETURNS profiles AS $$
    SELECT * FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 現在のユーザーのロールを取得
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 現在のユーザーの組織IDを取得
CREATE OR REPLACE FUNCTION get_current_user_organization_id()
RETURNS UUID AS $$
    SELECT organization_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 現在のユーザーの事業所IDを取得
CREATE OR REPLACE FUNCTION get_current_user_facility_id()
RETURNS UUID AS $$
    SELECT facility_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- adminかどうか
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- hq以上かどうか（hq または admin）
CREATE OR REPLACE FUNCTION is_hq_or_above()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('hq', 'admin')
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- manager以上かどうか（manager, hq, admin）
CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('manager', 'hq', 'admin')
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- organizations ポリシー
-- ============================================================

-- 全員が自分の組織を参照可能
CREATE POLICY "Users can view their organization"
    ON organizations FOR SELECT
    USING (id = get_current_user_organization_id() OR is_admin());

-- adminのみ作成・更新可能
CREATE POLICY "Admins can manage organizations"
    ON organizations FOR ALL
    USING (is_admin());

-- ============================================================
-- facilities ポリシー
-- ============================================================

-- 同一組織のユーザーは参照可能
CREATE POLICY "Users can view facilities in their organization"
    ON facilities FOR SELECT
    USING (organization_id = get_current_user_organization_id() OR is_hq_or_above());

-- adminのみ作成・更新可能
CREATE POLICY "Admins can manage facilities"
    ON facilities FOR ALL
    USING (is_admin());

-- ============================================================
-- profiles ポリシー
-- ============================================================

-- 自分のプロファイルは参照・更新可能
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 同一組織のユーザーは参照可能（manager以上）
CREATE POLICY "Managers can view profiles in their organization"
    ON profiles FOR SELECT
    USING (
        organization_id = get_current_user_organization_id()
        AND is_manager_or_above()
    );

-- hq以上は全組織のプロファイル参照可能
CREATE POLICY "HQ can view all profiles in organization"
    ON profiles FOR SELECT
    USING (
        organization_id = get_current_user_organization_id()
        AND is_hq_or_above()
    );

-- adminは全権限
CREATE POLICY "Admins can manage all profiles"
    ON profiles FOR ALL
    USING (is_admin());

-- ============================================================
-- clients ポリシー
-- ============================================================

-- staff/manager: 自拠点の利用者のみ参照可能
CREATE POLICY "Staff can view clients in their facility"
    ON clients FOR SELECT
    USING (
        (facility_id = get_current_user_facility_id())
        OR is_hq_or_above()
    );

-- manager以上: 自組織の利用者を管理可能
CREATE POLICY "Managers can manage clients"
    ON clients FOR ALL
    USING (
        (organization_id = get_current_user_organization_id() AND is_manager_or_above())
        OR is_admin()
    );

-- ============================================================
-- incidents ポリシー
-- ============================================================

-- staff: 自分の報告のみ参照
CREATE POLICY "Staff can view own incidents"
    ON incidents FOR SELECT
    USING (user_id = auth.uid());

-- manager: 自拠点の報告を参照
CREATE POLICY "Managers can view facility incidents"
    ON incidents FOR SELECT
    USING (
        facility_id = get_current_user_facility_id()
        AND is_manager_or_above()
    );

-- hq以上: 全組織の報告を参照
CREATE POLICY "HQ can view all organization incidents"
    ON incidents FOR SELECT
    USING (
        organization_id = get_current_user_organization_id()
        AND is_hq_or_above()
    );

-- 全員が自分の報告を作成可能
CREATE POLICY "Users can create own incidents"
    ON incidents FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- 自分の報告を更新可能
CREATE POLICY "Users can update own incidents"
    ON incidents FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- adminは全権限
CREATE POLICY "Admins can manage all incidents"
    ON incidents FOR ALL
    USING (is_admin());

-- ============================================================
-- improvement_ideas ポリシー
-- ============================================================

-- staff: 自分の投稿のみ参照
CREATE POLICY "Staff can view own ideas"
    ON improvement_ideas FOR SELECT
    USING (created_by = auth.uid());

-- manager: 自拠点のアイデアを参照
CREATE POLICY "Managers can view facility ideas"
    ON improvement_ideas FOR SELECT
    USING (
        facility_id = get_current_user_facility_id()
        AND is_manager_or_above()
    );

-- hq以上: 全組織のアイデアを参照
CREATE POLICY "HQ can view all organization ideas"
    ON improvement_ideas FOR SELECT
    USING (
        organization_id = get_current_user_organization_id()
        AND is_hq_or_above()
    );

-- 全員が投稿可能
CREATE POLICY "Users can create ideas"
    ON improvement_ideas FOR INSERT
    WITH CHECK (created_by = auth.uid());

-- 自分の投稿を更新可能
CREATE POLICY "Users can update own ideas"
    ON improvement_ideas FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- manager以上はステータス更新可能
CREATE POLICY "Managers can update idea status"
    ON improvement_ideas FOR UPDATE
    USING (
        (facility_id = get_current_user_facility_id() AND is_manager_or_above())
        OR is_hq_or_above()
    );

-- adminは全権限
CREATE POLICY "Admins can manage all ideas"
    ON improvement_ideas FOR ALL
    USING (is_admin());

-- ============================================================
-- idea_comments ポリシー
-- ============================================================

-- アイデアを見れる人はコメントも見れる
CREATE POLICY "Users can view comments on accessible ideas"
    ON idea_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM improvement_ideas
            WHERE id = idea_comments.idea_id
            AND (
                created_by = auth.uid()
                OR (facility_id = get_current_user_facility_id() AND is_manager_or_above())
                OR is_hq_or_above()
            )
        )
    );

-- 自分がコメント可能
CREATE POLICY "Users can create comments"
    ON idea_comments FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- 自分のコメントを更新・削除可能
CREATE POLICY "Users can manage own comments"
    ON idea_comments FOR ALL
    USING (user_id = auth.uid());

-- adminは全権限
CREATE POLICY "Admins can manage all comments"
    ON idea_comments FOR ALL
    USING (is_admin());

-- ============================================================
-- idea_attachments ポリシー
-- ============================================================

-- アイデアを見れる人は添付も見れる
CREATE POLICY "Users can view attachments on accessible ideas"
    ON idea_attachments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM improvement_ideas
            WHERE id = idea_attachments.idea_id
            AND (
                created_by = auth.uid()
                OR (facility_id = get_current_user_facility_id() AND is_manager_or_above())
                OR is_hq_or_above()
            )
        )
    );

-- 自分がアップロード可能
CREATE POLICY "Users can upload attachments"
    ON idea_attachments FOR INSERT
    WITH CHECK (uploaded_by = auth.uid());

-- adminは全権限
CREATE POLICY "Admins can manage all idea attachments"
    ON idea_attachments FOR ALL
    USING (is_admin());

-- ============================================================
-- approvals ポリシー
-- ============================================================

-- 自分の申請は参照可能
CREATE POLICY "Users can view own approvals"
    ON approvals FOR SELECT
    USING (applicant_id = auth.uid());

-- manager: 自拠点の申請で承認待ち(level1_pending)を参照
CREATE POLICY "Managers can view pending approvals"
    ON approvals FOR SELECT
    USING (
        facility_id = get_current_user_facility_id()
        AND is_manager_or_above()
    );

-- hq以上: 全組織の申請を参照
CREATE POLICY "HQ can view all organization approvals"
    ON approvals FOR SELECT
    USING (
        organization_id = get_current_user_organization_id()
        AND is_hq_or_above()
    );

-- 全員が申請可能
CREATE POLICY "Users can create approvals"
    ON approvals FOR INSERT
    WITH CHECK (applicant_id = auth.uid());

-- 自分の申請を更新可能（取り下げなど）
CREATE POLICY "Users can update own approvals"
    ON approvals FOR UPDATE
    USING (applicant_id = auth.uid() AND status = 'submitted')
    WITH CHECK (applicant_id = auth.uid());

-- manager以上は承認アクション可能
CREATE POLICY "Managers can approve"
    ON approvals FOR UPDATE
    USING (
        (
            facility_id = get_current_user_facility_id()
            AND is_manager_or_above()
            AND status = 'level1_pending'
        )
        OR (
            is_hq_or_above()
            AND status = 'level2_pending'
        )
    );

-- adminは全権限
CREATE POLICY "Admins can manage all approvals"
    ON approvals FOR ALL
    USING (is_admin());

-- ============================================================
-- approval_actions ポリシー
-- ============================================================

-- 稟議を見れる人は履歴も見れる
CREATE POLICY "Users can view actions on accessible approvals"
    ON approval_actions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM approvals
            WHERE id = approval_actions.approval_id
            AND (
                applicant_id = auth.uid()
                OR (facility_id = get_current_user_facility_id() AND is_manager_or_above())
                OR is_hq_or_above()
            )
        )
    );

-- manager以上がアクション記録可能
CREATE POLICY "Managers can create actions"
    ON approval_actions FOR INSERT
    WITH CHECK (
        actor_id = auth.uid()
        AND is_manager_or_above()
    );

-- adminは全権限
CREATE POLICY "Admins can manage all actions"
    ON approval_actions FOR ALL
    USING (is_admin());

-- ============================================================
-- approval_attachments ポリシー
-- ============================================================

-- 稟議を見れる人は添付も見れる
CREATE POLICY "Users can view attachments on accessible approvals"
    ON approval_attachments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM approvals
            WHERE id = approval_attachments.approval_id
            AND (
                applicant_id = auth.uid()
                OR (facility_id = get_current_user_facility_id() AND is_manager_or_above())
                OR is_hq_or_above()
            )
        )
    );

-- 自分がアップロード可能
CREATE POLICY "Users can upload approval attachments"
    ON approval_attachments FOR INSERT
    WITH CHECK (uploaded_by = auth.uid());

-- adminは全権限
CREATE POLICY "Admins can manage all approval attachments"
    ON approval_attachments FOR ALL
    USING (is_admin());

-- ============================================================
-- point_ledger ポリシー
-- ============================================================

-- 自分のポイント履歴を参照
CREATE POLICY "Users can view own points"
    ON point_ledger FOR SELECT
    USING (user_id = auth.uid());

-- manager: 自拠点のポイント履歴を参照
CREATE POLICY "Managers can view facility points"
    ON point_ledger FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = point_ledger.user_id
            AND profiles.facility_id = get_current_user_facility_id()
        )
        AND is_manager_or_above()
    );

-- hq以上: 全組織のポイント履歴を参照
CREATE POLICY "HQ can view all organization points"
    ON point_ledger FOR SELECT
    USING (
        organization_id = get_current_user_organization_id()
        AND is_hq_or_above()
    );

-- システムによる自動付与（トリガーで実行されるためSECURITY DEFINER関数内）
-- adminのみ手動ポイント操作可能
CREATE POLICY "Admins can manage points"
    ON point_ledger FOR ALL
    USING (is_admin());

-- ============================================================
-- birthday_import_logs ポリシー
-- ============================================================

-- adminのみ参照・操作可能
CREATE POLICY "Admins can manage birthday imports"
    ON birthday_import_logs FOR ALL
    USING (is_admin());

-- hqも参照可能
CREATE POLICY "HQ can view birthday imports"
    ON birthday_import_logs FOR SELECT
    USING (
        organization_id = get_current_user_organization_id()
        AND is_hq_or_above()
    );

-- ============================================================
-- settings ポリシー
-- ============================================================

-- 全員が設定を参照可能
CREATE POLICY "Users can view settings"
    ON settings FOR SELECT
    USING (organization_id = get_current_user_organization_id());

-- adminのみ更新可能
CREATE POLICY "Admins can manage settings"
    ON settings FOR ALL
    USING (is_admin());

-- ============================================================
-- birthday_alert_settings ポリシー
-- ============================================================

-- 全員が参照可能
CREATE POLICY "Users can view birthday alert settings"
    ON birthday_alert_settings FOR SELECT
    USING (organization_id = get_current_user_organization_id());

-- adminのみ更新可能
CREATE POLICY "Admins can manage birthday alert settings"
    ON birthday_alert_settings FOR ALL
    USING (is_admin());
