package api

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

func EnsureSchema(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		ALTER TABLE t_qc_sessions
		    ADD COLUMN IF NOT EXISTS started_station_id VARCHAR(80),
		    ADD COLUMN IF NOT EXISTS completed_by_operator_id VARCHAR(80),
		    ADD COLUMN IF NOT EXISTS completed_station_id VARCHAR(80),
		    ADD COLUMN IF NOT EXISTS finalized_by_operator_id VARCHAR(80),
		    ADD COLUMN IF NOT EXISTS finalized_station_id VARCHAR(80);

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

		UPDATE t_qc_sessions
		SET completed_by_operator_id = last_qc.operator_id,
		    completed_station_id = last_qc.station_id
		FROM (
		    SELECT DISTINCT ON (qc_session_id)
		           qc_session_id,
		           initial_qc_operator_id AS operator_id,
		           initial_qc_station_id AS station_id
		    FROM t_pre_laser_units
		    WHERE initial_result IS NOT NULL
		    ORDER BY qc_session_id, inspected_at DESC NULLS LAST, id DESC
		) AS last_qc
		WHERE t_qc_sessions.id = last_qc.qc_session_id
		  AND t_qc_sessions.completed_by_operator_id IS NULL;

		UPDATE t_tray_cycles tc
		SET status = 'COMPLETED',
		    completed_at = COALESCE(tc.completed_at, NOW())
		FROM t_qc_sessions qs
		WHERE qs.tray_cycle_id = tc.id
		  AND tc.status IN ('IN_PRODUCTION','WAITING_QC','QC_PROCESS')
		  AND qs.status IN ('READY_FOR_LASER','LASER_COMPLETE','CANCELLED');
	`)
	return err
}
