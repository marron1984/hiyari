-- ============================================================
-- ええかいご 管理コンソール - データベーススキーマ
-- Supabase PostgreSQL Migration
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 組織構造テーブル
-- ============================================================

-- 法人テーブル
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE organizations IS '法人マスタ';

-- 事業所テーブル
CREATE TABLE facilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_facilities_organization ON facilities(organization_id);
COMMENT ON TABLE facilities IS '事業所マスタ';

-- ユーザープロファイルテーブル
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'manager', 'hq', 'admin')),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    facility_id UUID REFERENCES facilities(id) ON DELETE SET NULL,
    birthday DATE,
    employment_type TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_organization ON profiles(organization_id);
CREATE INDEX idx_profiles_facility ON profiles(facility_id);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_birthday ON profiles(birthday);
COMMENT ON TABLE profiles IS 'ユーザープロファイル（auth.usersと1:1）';

-- 利用者テーブル
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    name_kana TEXT,
    birthday DATE,
    care_level TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_organization ON clients(organization_id);
CREATE INDEX idx_clients_facility ON clients(facility_id);
CREATE INDEX idx_clients_birthday ON clients(birthday);
COMMENT ON TABLE clients IS '利用者マスタ';

-- ============================================================
-- ヒヤリハット（既存機能のSupabase移行）
-- ============================================================

CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_name TEXT,
    incident_date DATE NOT NULL,
    time_slot TEXT NOT NULL CHECK (time_slot IN ('早朝', '日中', '夕方', '夜勤')),
    job_type TEXT NOT NULL,
    category TEXT NOT NULL,
    severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
    body TEXT NOT NULL CHECK (char_length(body) >= 10 AND char_length(body) <= 2000),
    action TEXT,
    prevention TEXT,
    location TEXT,
    tags TEXT[],
    image_urls TEXT[],
    has_image BOOLEAN DEFAULT FALSE,
    body_length INTEGER,
    total_length INTEGER,
    score_total INTEGER DEFAULT 0,
    score_breakdown JSONB,
    fraud_flag BOOLEAN DEFAULT FALSE,
    fraud_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_incidents_organization ON incidents(organization_id);
CREATE INDEX idx_incidents_facility ON incidents(facility_id);
CREATE INDEX idx_incidents_user ON incidents(user_id);
CREATE INDEX idx_incidents_date ON incidents(incident_date);
CREATE INDEX idx_incidents_category ON incidents(category);
CREATE INDEX idx_incidents_created ON incidents(created_at);
COMMENT ON TABLE incidents IS 'ヒヤリハット報告';

-- ============================================================
-- 改善アイデア投稿
-- ============================================================

CREATE TABLE improvement_ideas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    problem TEXT NOT NULL,
    idea TEXT NOT NULL,
    expected_effects TEXT[],
    difficulty TEXT CHECK (difficulty IN ('low', 'mid', 'high')),
    cost_level TEXT CHECK (cost_level IN ('zero', 'small', 'needs_review')),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'adopted', 'implemented', 'rejected')),
    points_awarded INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ideas_organization ON improvement_ideas(organization_id);
CREATE INDEX idx_ideas_facility ON improvement_ideas(facility_id);
CREATE INDEX idx_ideas_created_by ON improvement_ideas(created_by);
CREATE INDEX idx_ideas_status ON improvement_ideas(status);
CREATE INDEX idx_ideas_created ON improvement_ideas(created_at);
COMMENT ON TABLE improvement_ideas IS '改善アイデア投稿';

-- アイデアコメント
CREATE TABLE idea_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idea_id UUID NOT NULL REFERENCES improvement_ideas(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_idea_comments_idea ON idea_comments(idea_id);
COMMENT ON TABLE idea_comments IS '改善アイデアへのコメント';

-- アイデア添付ファイル
CREATE TABLE idea_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idea_id UUID NOT NULL REFERENCES improvement_ideas(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER,
    uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_idea_attachments_idea ON idea_attachments(idea_id);
COMMENT ON TABLE idea_attachments IS '改善アイデア添付ファイル';

-- ============================================================
-- 簡易稟議システム
-- ============================================================

CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    amount INTEGER,
    category TEXT NOT NULL,
    desired_due_date DATE,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
        'submitted',
        'level1_pending',
        'level2_pending',
        'approved',
        'rejected',
        'returned'
    )),
    current_approver_role TEXT CHECK (current_approver_role IN ('manager', 'hq', 'admin')),
    points_awarded INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approvals_organization ON approvals(organization_id);
CREATE INDEX idx_approvals_facility ON approvals(facility_id);
CREATE INDEX idx_approvals_applicant ON approvals(applicant_id);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_due_date ON approvals(desired_due_date);
CREATE INDEX idx_approvals_created ON approvals(created_at);
COMMENT ON TABLE approvals IS '稟議申請';

-- 承認アクション履歴
CREATE TABLE approval_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    approval_id UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('submit', 'approve', 'return', 'reject')),
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approval_actions_approval ON approval_actions(approval_id);
CREATE INDEX idx_approval_actions_actor ON approval_actions(actor_id);
COMMENT ON TABLE approval_actions IS '稟議承認アクション履歴';

-- 稟議添付ファイル
CREATE TABLE approval_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    approval_id UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER,
    uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approval_attachments_approval ON approval_attachments(approval_id);
COMMENT ON TABLE approval_attachments IS '稟議添付ファイル';

-- ============================================================
-- ポイント台帳
-- ============================================================

CREATE TABLE point_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN (
        'incident_report',
        'idea_submission',
        'idea_adopted',
        'idea_implemented',
        'approval_submission',
        'approval_approved',
        'bonus',
        'adjustment'
    )),
    source_id UUID,
    points INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_point_ledger_organization ON point_ledger(organization_id);
CREATE INDEX idx_point_ledger_user ON point_ledger(user_id);
CREATE INDEX idx_point_ledger_source_type ON point_ledger(source_type);
CREATE INDEX idx_point_ledger_created ON point_ledger(created_at);
COMMENT ON TABLE point_ledger IS 'ポイント台帳（加点・減点履歴）';

-- ============================================================
-- 誕生日インポート
-- ============================================================

CREATE TABLE birthday_import_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('clients', 'profiles')),
    total_rows INTEGER NOT NULL DEFAULT 0,
    success_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    import_details JSONB,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_birthday_import_logs_organization ON birthday_import_logs(organization_id);
COMMENT ON TABLE birthday_import_logs IS '誕生日PDF取込履歴';

-- ============================================================
-- 設定テーブル
-- ============================================================

CREATE TABLE settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    scoring_rules JSONB NOT NULL DEFAULT '[]',
    visibility_mode TEXT DEFAULT 'all' CHECK (visibility_mode IN ('all', 'facility', 'self')),
    exclude_fraud_from_ranking BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE settings IS '組織設定';

CREATE TABLE birthday_alert_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    days_before INTEGER DEFAULT 7,
    notify_time TIME DEFAULT '09:00',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE birthday_alert_settings IS '誕生日アラート設定';

-- ============================================================
-- 月次統計（集計用ビュー/マテリアライズドビュー）
-- ============================================================

-- ユーザー月次統計ビュー
CREATE OR REPLACE VIEW monthly_user_stats AS
SELECT
    p.organization_id,
    p.facility_id,
    pl.user_id,
    p.display_name AS user_name,
    DATE_TRUNC('month', pl.created_at) AS month,
    SUM(pl.points) AS total_points,
    COUNT(DISTINCT CASE WHEN pl.source_type = 'incident_report' THEN pl.source_id END) AS incident_count,
    COUNT(DISTINCT CASE WHEN pl.source_type = 'idea_submission' THEN pl.source_id END) AS idea_count,
    COUNT(DISTINCT CASE WHEN pl.source_type = 'approval_submission' THEN pl.source_id END) AS approval_count
FROM point_ledger pl
JOIN profiles p ON p.id = pl.user_id
GROUP BY p.organization_id, p.facility_id, pl.user_id, p.display_name, DATE_TRUNC('month', pl.created_at);

-- 事業所月次統計ビュー
CREATE OR REPLACE VIEW monthly_facility_stats AS
SELECT
    f.organization_id,
    f.id AS facility_id,
    f.name AS facility_name,
    DATE_TRUNC('month', pl.created_at) AS month,
    SUM(pl.points) AS total_points,
    COUNT(DISTINCT pl.user_id) AS active_users,
    COUNT(DISTINCT CASE WHEN pl.source_type = 'incident_report' THEN pl.source_id END) AS incident_count,
    COUNT(DISTINCT CASE WHEN pl.source_type = 'idea_submission' THEN pl.source_id END) AS idea_count
FROM point_ledger pl
JOIN profiles p ON p.id = pl.user_id
JOIN facilities f ON f.id = p.facility_id
GROUP BY f.organization_id, f.id, f.name, DATE_TRUNC('month', pl.created_at);

-- ============================================================
-- トリガー関数：updated_at自動更新
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- トリガー設定
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_improvement_ideas_updated_at
    BEFORE UPDATE ON improvement_ideas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_approvals_updated_at
    BEFORE UPDATE ON approvals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_birthday_alert_settings_updated_at
    BEFORE UPDATE ON birthday_alert_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ポイント自動付与トリガー
-- ============================================================

-- 改善アイデア投稿時の自動ポイント付与
CREATE OR REPLACE FUNCTION auto_award_idea_points()
RETURNS TRIGGER AS $$
BEGIN
    -- 新規投稿時に5ポイント付与
    IF TG_OP = 'INSERT' THEN
        INSERT INTO point_ledger (
            organization_id,
            user_id,
            source_type,
            source_id,
            points,
            reason
        ) VALUES (
            NEW.organization_id,
            NEW.created_by,
            'idea_submission',
            NEW.id,
            5,
            '改善アイデア投稿'
        );

        UPDATE improvement_ideas
        SET points_awarded = points_awarded + 5
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_award_idea_points
    AFTER INSERT ON improvement_ideas
    FOR EACH ROW
    EXECUTE FUNCTION auto_award_idea_points();

-- 稟議申請時の自動ポイント付与
CREATE OR REPLACE FUNCTION auto_award_approval_points()
RETURNS TRIGGER AS $$
BEGIN
    -- 新規申請時に3ポイント付与
    IF TG_OP = 'INSERT' THEN
        INSERT INTO point_ledger (
            organization_id,
            user_id,
            source_type,
            source_id,
            points,
            reason
        ) VALUES (
            NEW.organization_id,
            NEW.applicant_id,
            'approval_submission',
            NEW.id,
            3,
            '稟議申請'
        );

        UPDATE approvals
        SET points_awarded = points_awarded + 3
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_award_approval_points
    AFTER INSERT ON approvals
    FOR EACH ROW
    EXECUTE FUNCTION auto_award_approval_points();

-- ============================================================
-- 初期データ投入用関数
-- ============================================================

-- 新規ユーザー登録時のプロファイル自動作成
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, display_name, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.email,
        'staff'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
