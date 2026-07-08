BEGIN;

CREATE TABLE IF NOT EXISTS m_ng_categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_code VARCHAR(40) NOT NULL UNIQUE,
    category_name VARCHAR(120) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id BIGINT REFERENCES m_users(id),
    updated_by_user_id BIGINT REFERENCES m_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE t_pre_laser_units
    ADD COLUMN IF NOT EXISTS ng_category_id BIGINT REFERENCES m_ng_categories(id);

INSERT INTO m_ng_categories (category_code, category_name, description, sort_order)
VALUES
    ('SCRATCH_DENT', 'Visual Scratch / Dent', 'Visible scratch, dent, or cosmetic damage.', 10),
    ('DIMENSION_OOS', 'Dimension Out of Spec', 'Part dimension is outside the approved tolerance.', 20),
    ('FUNCTION_FAIL', 'Functional Test Failed', 'Part failed functional or fit test.', 30),
    ('ASSEMBLY_DEFECT', 'Assembly Defect', 'Assembly is incomplete, loose, reversed, or incorrect.', 40),
    ('CONTAMINATION', 'Contamination', 'Oil, dust, foreign material, or other contamination found.', 50),
    ('MARKING_DEFECT', 'Marking Defect', 'Label, marking, print, or identification issue.', 60)
ON CONFLICT (category_code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_ng_categories_active_order
    ON m_ng_categories (is_active, sort_order, category_name);
CREATE INDEX IF NOT EXISTS idx_pre_laser_ng_category
    ON t_pre_laser_units (ng_category_id)
    WHERE ng_category_id IS NOT NULL;

COMMIT;
