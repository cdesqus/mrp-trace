BEGIN;

ALTER TABLE m_trays
    ADD COLUMN IF NOT EXISTS tray_type VARCHAR(16) NOT NULL DEFAULT 'GENERAL';

ALTER TABLE m_trays DROP CONSTRAINT IF EXISTS m_trays_tray_type_check;
ALTER TABLE m_trays ADD CONSTRAINT m_trays_tray_type_check
    CHECK (tray_type IN ('GENERAL','SOURCE','PASS','REWORK'));

UPDATE m_trays SET tray_type='SOURCE' WHERE tray_code='TRAY-001' AND tray_type='GENERAL';
UPDATE m_trays SET tray_type='PASS' WHERE tray_code='TRAY-002' AND tray_type='GENERAL';
UPDATE m_trays SET tray_type='REWORK' WHERE tray_code IN ('TRAY-003','TRAY-004') AND tray_type='GENERAL';

CREATE TABLE IF NOT EXISTS t_rework_tray_locks (
    tray_id BIGINT PRIMARY KEY REFERENCES m_trays(id),
    station_id VARCHAR(80) NOT NULL,
    operator_id VARCHAR(80) NOT NULL,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rework_tray_locks_locked_at
    ON t_rework_tray_locks (locked_at);

COMMIT;
