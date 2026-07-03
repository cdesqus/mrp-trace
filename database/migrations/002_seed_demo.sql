BEGIN;

INSERT INTO m_customers (customer_code, customer_name)
VALUES ('CUST-DEMO', 'Demo Customer')
ON CONFLICT (customer_code) DO NOTHING;

INSERT INTO m_products (product_code, product_name)
VALUES ('FG-DEMO', 'Demo Finished Good')
ON CONFLICT (product_code) DO NOTHING;

INSERT INTO m_packaging_configs (
    product_id,
    config_name,
    version,
    parts_per_small_box,
    small_boxes_per_master_box
)
SELECT id, 'Standard', 1, 6, 12
FROM m_products
WHERE product_code = 'FG-DEMO'
ON CONFLICT (product_id, config_name, version) DO NOTHING;

INSERT INTO m_trays (tray_code)
VALUES ('TRAY-001'), ('TRAY-002'), ('TRAY-003')
ON CONFLICT (tray_code) DO NOTHING;

COMMIT;
