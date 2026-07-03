BEGIN;

ALTER TABLE m_trays ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE t_qc_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_code VARCHAR(80) NOT NULL UNIQUE,
    tray_id BIGINT NOT NULL REFERENCES m_trays(id),
    tray_cycle_id BIGINT NOT NULL UNIQUE REFERENCES t_tray_cycles(id),
    production_order_id BIGINT NOT NULL REFERENCES t_production_orders(id),
    actual_qty INTEGER NOT NULL CHECK (actual_qty > 0),
    inspected_qty INTEGER NOT NULL DEFAULT 0 CHECK (inspected_qty >= 0),
    status VARCHAR(24) NOT NULL DEFAULT 'QC_IN_PROGRESS'
        CHECK (status IN ('QC_IN_PROGRESS','READY_FOR_LASER','LASER_COMPLETE','CANCELLED')),
    operator_id VARCHAR(80) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE t_pre_laser_units (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    qc_session_id BIGINT NOT NULL REFERENCES t_qc_sessions(id),
    inspection_sequence INTEGER NOT NULL CHECK (inspection_sequence > 0),
    status VARCHAR(28) NOT NULL DEFAULT 'QC_PENDING'
        CHECK (status IN ('QC_PENDING','REWORK','QC_PASSED_UNMARKED','LASER_RESERVED','LASER_MARKED')),
    initial_result VARCHAR(12) CHECK (initial_result IN ('PASS','REJECT')),
    rework_code VARCHAR(80) UNIQUE,
    ng_reason VARCHAR(160),
    qc_operator_id VARCHAR(80),
    inspected_at TIMESTAMPTZ,
    rework_passed_at TIMESTAMPTZ,
    commercial_unit_id BIGINT UNIQUE REFERENCES t_units_tracking(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (qc_session_id, inspection_sequence)
);

ALTER TABLE t_laser_batches ADD COLUMN IF NOT EXISTS qc_session_id BIGINT REFERENCES t_qc_sessions(id);
ALTER TABLE t_laser_batches ADD COLUMN IF NOT EXISTS carrier_tray_id BIGINT REFERENCES m_trays(id);
ALTER TABLE t_laser_batches ADD COLUMN IF NOT EXISTS source_type VARCHAR(16) NOT NULL DEFAULT 'DIRECT'
    CHECK (source_type IN ('DIRECT','REWORK'));
ALTER TABLE t_laser_batches DROP CONSTRAINT IF EXISTS t_laser_batches_tray_cycle_id_key;

CREATE INDEX idx_qc_sessions_status ON t_qc_sessions(status, started_at);
CREATE INDEX idx_pre_laser_ready ON t_pre_laser_units(status, created_at);
CREATE INDEX idx_pre_laser_rework ON t_pre_laser_units(rework_code) WHERE status='REWORK';

COMMIT;
