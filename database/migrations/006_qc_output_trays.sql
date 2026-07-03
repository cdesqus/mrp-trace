BEGIN;

ALTER TABLE t_qc_sessions
    ADD COLUMN IF NOT EXISTS pass_tray_id BIGINT REFERENCES m_trays(id),
    ADD COLUMN IF NOT EXISTS rework_tray_id BIGINT REFERENCES m_trays(id),
    ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

ALTER TABLE t_qc_sessions DROP CONSTRAINT IF EXISTS t_qc_sessions_status_check;
ALTER TABLE t_qc_sessions ADD CONSTRAINT t_qc_sessions_status_check
    CHECK (status IN ('QC_IN_PROGRESS','AWAITING_OUTPUT_TRAYS','READY_FOR_LASER','LASER_COMPLETE','CANCELLED'));

ALTER TABLE t_pre_laser_units
    ADD COLUMN IF NOT EXISTS pass_tray_id BIGINT REFERENCES m_trays(id),
    ADD COLUMN IF NOT EXISTS rework_tray_id BIGINT REFERENCES m_trays(id);

CREATE INDEX IF NOT EXISTS idx_pre_laser_pass_tray
    ON t_pre_laser_units (pass_tray_id, status);

COMMIT;
