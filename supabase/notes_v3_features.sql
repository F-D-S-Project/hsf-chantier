-- =====================================================
-- Notes v3 — soft-delete, lectures, preuve, mentions
-- À exécuter dans Supabase SQL Editor
-- =====================================================

-- 1. Soft delete
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Suivi des lectures (tableau d'user_id qui ont ouvert la note)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS read_by uuid[] DEFAULT '{}';

-- 3. Preuve obligatoire pour passer à "Résolu"
ALTER TABLE notes ADD COLUMN IF NOT EXISTS proof_url     text;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS proof_comment text;

-- 4. Mentions @entreprise (Bloc 5)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS mentioned_companies text[] DEFAULT '{}';

-- 5. Toggle email digest par entreprise
CREATE TABLE IF NOT EXISTS company_notif_prefs (
  company_name      text PRIMARY KEY,
  email_digest      boolean DEFAULT true,
  email_immediate   boolean DEFAULT true,
  updated_at        timestamptz DEFAULT now()
);
ALTER TABLE company_notif_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on company_notif_prefs" ON company_notif_prefs;
CREATE POLICY "Allow all on company_notif_prefs" ON company_notif_prefs
  FOR ALL USING (true) WITH CHECK (true);

-- 6. Indexes utiles
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_notes_mentions   ON notes USING GIN(mentioned_companies);
