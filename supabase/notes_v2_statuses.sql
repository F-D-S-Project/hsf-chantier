-- =====================================================
-- Notes v2 — harmonisation des statuts
-- À exécuter dans Supabase SQL Editor
-- =====================================================
-- Avant : ouvert | en_cours | resolu | clos
-- Après : ouvert | en_cours | en_retard | resolu | termine

-- 1. Renommer 'clos' → 'termine' sur les notes existantes
UPDATE notes SET status = 'termine' WHERE status = 'clos';

-- 2. Optionnel : contrainte CHECK pour éviter les typos futurs
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_status_check;
ALTER TABLE notes ADD  CONSTRAINT notes_status_check
  CHECK (status IN ('ouvert', 'en_cours', 'en_retard', 'resolu', 'termine'));

-- 3. Vérification (devrait retourner 0)
SELECT count(*) FROM notes WHERE status NOT IN ('ouvert', 'en_cours', 'en_retard', 'resolu', 'termine');
