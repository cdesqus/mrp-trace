BEGIN;

ALTER TABLE t_print_jobs
    DROP CONSTRAINT IF EXISTS t_print_jobs_entity_type_check;

ALTER TABLE t_print_jobs
    ADD CONSTRAINT t_print_jobs_entity_type_check
    CHECK (entity_type IN ('UNIT', 'LASER_BATCH', 'REWORK', 'SMALL_BOX', 'MASTER_BOX'));

CREATE TABLE t_laser_batches (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_code VARCHAR(80) NOT NULL UNIQUE,
    tray_cycle_id BIGINT NOT NULL UNIQUE REFERENCES t_tray_cycles(id),
    production_order_id BIGINT NOT NULL REFERENCES t_production_orders(id),
    total_qty INTEGER NOT NULL CHECK (total_qty > 0),
    serial_from CHAR(14) NOT NULL CHECK (serial_from ~ '^[0-9]{14}$'),
    serial_to CHAR(14) NOT NULL CHECK (serial_to ~ '^[0-9]{14}$'),
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
    transmission_attempts INTEGER NOT NULL DEFAULT 0 CHECK (transmission_attempts >= 0),
    station_id VARCHAR(80) NOT NULL,
    created_by VARCHAR(80) NOT NULL,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE TABLE t_laser_batch_units (
    laser_batch_id BIGINT NOT NULL REFERENCES t_laser_batches(id),
    unit_id BIGINT NOT NULL UNIQUE REFERENCES t_units_tracking(id),
    batch_position INTEGER NOT NULL CHECK (batch_position > 0),
    PRIMARY KEY (laser_batch_id, unit_id),
    UNIQUE (laser_batch_id, batch_position)
);

CREATE INDEX idx_laser_batches_history
    ON t_laser_batches (created_at DESC, id DESC);

CREATE INDEX idx_laser_batches_status
    ON t_laser_batches (status, updated_at)
    WHERE status IN ('PENDING', 'PROCESSING', 'FAILED');

COMMIT;
