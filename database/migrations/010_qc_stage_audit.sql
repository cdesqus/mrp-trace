BEGIN;

ALTER TABLE t_pre_laser_units
    ADD COLUMN IF NOT EXISTS initial_qc_operator_id VARCHAR(80),
    ADD COLUMN IF NOT EXISTS initial_qc_station_id VARCHAR(80),
    ADD COLUMN IF NOT EXISTS rework_qc_operator_id VARCHAR(80),
    ADD COLUMN IF NOT EXISTS rework_qc_station_id VARCHAR(80);

UPDATE t_pre_laser_units
SET initial_qc_operator_id=qc_operator_id
WHERE initial_result IS NOT NULL AND initial_qc_operator_id IS NULL;

UPDATE t_pre_laser_units
SET rework_qc_operator_id=qc_operator_id
WHERE rework_passed_at IS NOT NULL AND rework_qc_operator_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pre_laser_initial_history
    ON t_pre_laser_units (inspected_at DESC)
    WHERE initial_result IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pre_laser_rework_history
    ON t_pre_laser_units (rework_passed_at DESC)
    WHERE rework_passed_at IS NOT NULL;

COMMIT;
