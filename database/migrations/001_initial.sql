BEGIN;

CREATE SEQUENCE seq_commercial_serial AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE TABLE m_customers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_code VARCHAR(40) NOT NULL UNIQUE,
    customer_name VARCHAR(160) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE m_products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_code VARCHAR(60) NOT NULL UNIQUE,
    product_name VARCHAR(200) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE m_packaging_configs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES m_products(id),
    config_name VARCHAR(80) NOT NULL,
    version INTEGER NOT NULL,
    parts_per_small_box INTEGER NOT NULL CHECK (parts_per_small_box > 0),
    small_boxes_per_master_box INTEGER NOT NULL CHECK (small_boxes_per_master_box > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, config_name, version)
);

CREATE TABLE m_trays (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tray_code VARCHAR(60) NOT NULL UNIQUE,
    status VARCHAR(24) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'IN_PRODUCTION', 'WAITING_QC', 'QC_PROCESS')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_sales_orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    so_number VARCHAR(80) NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL REFERENCES m_customers(id),
    order_date DATE NOT NULL,
    target_delivery_date DATE,
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'PRODUCTION', 'COMPLETED', 'DELIVERY', 'CLOSED', 'CANCELLED')),
    created_by VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_sales_order_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sales_order_id BIGINT NOT NULL REFERENCES t_sales_orders(id),
    line_number INTEGER NOT NULL CHECK (line_number > 0),
    product_id BIGINT NOT NULL REFERENCES m_products(id),
    packaging_config_id BIGINT NOT NULL REFERENCES m_packaging_configs(id),
    order_qty INTEGER NOT NULL CHECK (order_qty > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sales_order_id, line_number)
);

CREATE TABLE t_production_orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_order_number VARCHAR(80) NOT NULL UNIQUE,
    sales_order_line_id BIGINT NOT NULL UNIQUE REFERENCES t_sales_order_lines(id),
    planned_qty INTEGER NOT NULL CHECK (planned_qty > 0),
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    created_by VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_tray_cycles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tray_cycle_code VARCHAR(80) NOT NULL UNIQUE,
    tray_id BIGINT NOT NULL REFERENCES m_trays(id),
    production_order_id BIGINT NOT NULL REFERENCES t_production_orders(id),
    cycle_number INTEGER NOT NULL CHECK (cycle_number > 0),
    planned_qty INTEGER NOT NULL CHECK (planned_qty > 0),
    operator_id VARCHAR(80) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'IN_PRODUCTION'
        CHECK (status IN ('IN_PRODUCTION', 'WAITING_QC', 'QC_PROCESS', 'COMPLETED', 'CANCELLED')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (tray_id, cycle_number)
);

CREATE TABLE t_serial_groups (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_order_id BIGINT NOT NULL REFERENCES t_production_orders(id),
    packaging_config_id BIGINT NOT NULL REFERENCES m_packaging_configs(id),
    group_number INTEGER NOT NULL CHECK (group_number > 0),
    group_size INTEGER NOT NULL CHECK (group_size > 0),
    production_date DATE NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ALLOCATED'
        CHECK (status IN ('ALLOCATED', 'QC_PROCESS', 'WAITING_REWORK', 'READY_TO_PACK', 'PACKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (production_order_id, group_number)
);

CREATE TABLE t_units_tracking (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    serial_sequence BIGINT NOT NULL DEFAULT nextval('seq_commercial_serial') UNIQUE,
    serial_number CHAR(14) NOT NULL UNIQUE
        CHECK (serial_number ~ '^[0-9]{14}$'),
    serial_group_id BIGINT NOT NULL REFERENCES t_serial_groups(id),
    tray_cycle_id BIGINT NOT NULL REFERENCES t_tray_cycles(id),
    group_position INTEGER NOT NULL CHECK (group_position > 0),
    status VARCHAR(24) NOT NULL DEFAULT 'ALLOCATED'
        CHECK (status IN ('ALLOCATED', 'LASER_PENDING', 'QC_PENDING', 'REWORK', 'PASSED_UNBOXED', 'PACKED')),
    laser_marked_at TIMESTAMPTZ,
    qc_passed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (serial_group_id, group_position)
);

CREATE TABLE t_qc_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    idempotency_key UUID NOT NULL UNIQUE,
    unit_id BIGINT NOT NULL REFERENCES t_units_tracking(id),
    tray_cycle_id BIGINT NOT NULL REFERENCES t_tray_cycles(id),
    result VARCHAR(12) NOT NULL CHECK (result IN ('PASS', 'REJECT')),
    reason TEXT,
    operator_id VARCHAR(80) NOT NULL,
    station_id VARCHAR(80) NOT NULL,
    inspected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((result = 'PASS' AND reason IS NULL) OR (result = 'REJECT' AND reason IS NOT NULL))
);

CREATE TABLE t_rework_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rework_code VARCHAR(80) NOT NULL UNIQUE,
    unit_id BIGINT NOT NULL REFERENCES t_units_tracking(id),
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    reason TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'PASSED')),
    created_by VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    passed_at TIMESTAMPTZ,
    UNIQUE (unit_id, attempt_number)
);

CREATE TABLE t_small_boxes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    box_code VARCHAR(80) NOT NULL UNIQUE,
    serial_group_id BIGINT NOT NULL UNIQUE REFERENCES t_serial_groups(id),
    production_order_id BIGINT NOT NULL REFERENCES t_production_orders(id),
    packaging_config_id BIGINT NOT NULL REFERENCES m_packaging_configs(id),
    actual_qty INTEGER NOT NULL CHECK (actual_qty > 0),
    status VARCHAR(16) NOT NULL DEFAULT 'LOCKED'
        CHECK (status IN ('LOCKED', 'MASTERED')),
    packed_by VARCHAR(80) NOT NULL,
    packed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_small_box_units (
    small_box_id BIGINT NOT NULL REFERENCES t_small_boxes(id),
    unit_id BIGINT NOT NULL UNIQUE REFERENCES t_units_tracking(id),
    box_position INTEGER NOT NULL CHECK (box_position > 0),
    PRIMARY KEY (small_box_id, unit_id),
    UNIQUE (small_box_id, box_position)
);

CREATE TABLE t_master_boxes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    master_box_code VARCHAR(80) NOT NULL UNIQUE,
    production_order_id BIGINT NOT NULL REFERENCES t_production_orders(id),
    packaging_config_id BIGINT NOT NULL REFERENCES m_packaging_configs(id),
    actual_small_box_qty INTEGER NOT NULL CHECK (actual_small_box_qty > 0),
    actual_unit_qty INTEGER NOT NULL CHECK (actual_unit_qty > 0),
    status VARCHAR(16) NOT NULL DEFAULT 'LOCKED'
        CHECK (status IN ('LOCKED', 'DELIVERED')),
    packed_by VARCHAR(80) NOT NULL,
    packed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_master_box_small_boxes (
    master_box_id BIGINT NOT NULL REFERENCES t_master_boxes(id),
    small_box_id BIGINT NOT NULL UNIQUE REFERENCES t_small_boxes(id),
    box_position INTEGER NOT NULL CHECK (box_position > 0),
    PRIMARY KEY (master_box_id, small_box_id),
    UNIQUE (master_box_id, box_position)
);

CREATE TABLE t_delivery_orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    do_number VARCHAR(80) NOT NULL UNIQUE,
    sales_order_id BIGINT NOT NULL REFERENCES t_sales_orders(id),
    delivery_date DATE NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'READY', 'SHIPPED', 'CANCELLED')),
    created_by VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_delivery_order_master_boxes (
    delivery_order_id BIGINT NOT NULL REFERENCES t_delivery_orders(id),
    master_box_id BIGINT NOT NULL UNIQUE REFERENCES t_master_boxes(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (delivery_order_id, master_box_id)
);

CREATE TABLE t_print_jobs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    idempotency_key UUID NOT NULL UNIQUE,
    entity_type VARCHAR(24) NOT NULL
        CHECK (entity_type IN ('UNIT', 'REWORK', 'SMALL_BOX', 'MASTER_BOX')),
    entity_id BIGINT NOT NULL,
    station_id VARCHAR(80) NOT NULL,
    device_role VARCHAR(24) NOT NULL
        CHECK (device_role IN ('LASER', 'REWORK_PRINTER', 'SMALL_BOX_PRINTER', 'MASTER_BOX_PRINTER')),
    payload TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED', 'PROCESSING', 'PRINTED', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    printed_at TIMESTAMPTZ
);

CREATE INDEX idx_packaging_product_active
    ON m_packaging_configs (product_id, is_active);
CREATE INDEX idx_so_customer_status
    ON t_sales_orders (customer_id, status);
CREATE INDEX idx_so_lines_product
    ON t_sales_order_lines (product_id);
CREATE INDEX idx_production_orders_status
    ON t_production_orders (status, created_at);
CREATE INDEX idx_tray_cycles_production_status
    ON t_tray_cycles (production_order_id, status);
CREATE UNIQUE INDEX uq_tray_active_cycle
    ON t_tray_cycles (tray_id)
    WHERE status IN ('IN_PRODUCTION', 'WAITING_QC', 'QC_PROCESS');
CREATE INDEX idx_serial_groups_pack_queue
    ON t_serial_groups (status, created_at, id);
CREATE INDEX idx_units_group_status
    ON t_units_tracking (serial_group_id, status, group_position);
CREATE INDEX idx_units_tray
    ON t_units_tracking (tray_cycle_id);
CREATE INDEX idx_qc_unit_time
    ON t_qc_events (unit_id, inspected_at DESC);
CREATE INDEX idx_rework_unit_status
    ON t_rework_logs (unit_id, status);
CREATE INDEX idx_small_boxes_production_status
    ON t_small_boxes (production_order_id, status, packed_at);
CREATE INDEX idx_master_boxes_production_status
    ON t_master_boxes (production_order_id, status, packed_at);
CREATE INDEX idx_delivery_so_status
    ON t_delivery_orders (sales_order_id, status);
CREATE INDEX idx_print_jobs_worker
    ON t_print_jobs (status, next_attempt_at, id)
    WHERE status IN ('QUEUED', 'FAILED');

COMMIT;
