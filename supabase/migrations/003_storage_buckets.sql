-- ============================================================
-- ええかいご 管理コンソール - Storage Buckets
-- ============================================================

-- 改善アイデア用バケット
INSERT INTO storage.buckets (id, name, public)
VALUES ('ideas', 'ideas', false)
ON CONFLICT (id) DO NOTHING;

-- 稟議用バケット
INSERT INTO storage.buckets (id, name, public)
VALUES ('approvals', 'approvals', false)
ON CONFLICT (id) DO NOTHING;

-- 誕生日インポート用バケット
INSERT INTO storage.buckets (id, name, public)
VALUES ('birthday-imports', 'birthday-imports', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Storage RLS Policies
-- ============================================================

-- ideas バケットポリシー
CREATE POLICY "Users can view idea attachments"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'ideas' AND auth.role() = 'authenticated');

CREATE POLICY "Users can upload idea attachments"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'ideas'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] IS NOT NULL
    );

CREATE POLICY "Users can delete own idea attachments"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'ideas'
        AND auth.role() = 'authenticated'
    );

-- approvals バケットポリシー
CREATE POLICY "Users can view approval attachments"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'approvals' AND auth.role() = 'authenticated');

CREATE POLICY "Users can upload approval attachments"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'approvals'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] IS NOT NULL
    );

CREATE POLICY "Users can delete own approval attachments"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'approvals'
        AND auth.role() = 'authenticated'
    );

-- birthday-imports バケットポリシー（adminのみ）
CREATE POLICY "Admins can manage birthday imports"
    ON storage.objects FOR ALL
    USING (
        bucket_id = 'birthday-imports'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
