-- =====================================================
-- Sprint 1 — Fonction "Note" Planify
-- À exécuter dans Supabase SQL Editor (en une fois)
-- =====================================================

-- 1. Table principale
CREATE TABLE IF NOT EXISTS notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  author_id       uuid,
  author_name     text NOT NULL,

  -- Contenu
  title           text,
  content         text NOT NULL,

  -- Ancrages
  intervention_id text REFERENCES interventions(id) ON DELETE SET NULL,
  zone_ids        text[] DEFAULT '{}',
  company_codes   text[] DEFAULT '{}',
  trade_codes     text[] DEFAULT '{}',

  -- Type / catégorisation
  scope           text DEFAULT 'libre',
  category        text,

  -- Workflow
  status          text DEFAULT 'ouvert',
  due_date        date,

  -- Fil de discussion
  parent_id       uuid REFERENCES notes(id) ON DELETE CASCADE,

  -- Pièces jointes
  attachments     jsonb DEFAULT '[]'
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_notes_intervention ON notes(intervention_id);
CREATE INDEX IF NOT EXISTS idx_notes_scope        ON notes(scope);
CREATE INDEX IF NOT EXISTS idx_notes_status       ON notes(status);
CREATE INDEX IF NOT EXISTS idx_notes_parent       ON notes(parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_companies    ON notes USING GIN(company_codes);
CREATE INDEX IF NOT EXISTS idx_notes_trades       ON notes USING GIN(trade_codes);
CREATE INDEX IF NOT EXISTS idx_notes_zones        ON notes USING GIN(zone_ids);

-- 3. RLS — allow-all (cohérent avec le reste de l'app)
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on notes" ON notes;
CREATE POLICY "Allow all on notes" ON notes
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Trigger updated_at
CREATE OR REPLACE FUNCTION notes_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_updated_at ON notes;
CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION notes_set_updated_at();

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notes;

-- =====================================================
-- ⚠️  ÉTAPE MANUELLE — créer le bucket Storage
-- =====================================================
-- Dans l'UI Supabase :
--   1. Storage > New bucket
--   2. Nom: notes-attachments
--   3. Public: ON  (lecture publique via URL)
--   4. File size limit: 10 MB (suffisant pour JPG/PNG/PDF)
--   5. Allowed MIME types: image/jpeg, image/png, application/pdf
-- =====================================================
