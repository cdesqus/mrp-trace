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
	`)
	return err
}
