BEGIN;

ALTER TABLE m_customers
    ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES m_users(id),
    ADD COLUMN IF NOT EXISTS updated_by_user_id BIGINT REFERENCES m_users(id),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE m_products
    ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES m_users(id),
    ADD COLUMN IF NOT EXISTS updated_by_user_id BIGINT REFERENCES m_users(id),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE m_packaging_configs
    ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES m_users(id),
    ADD COLUMN IF NOT EXISTS updated_by_user_id BIGINT REFERENCES m_users(id),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE m_trays
    ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES m_users(id),
    ADD COLUMN IF NOT EXISTS updated_by_user_id BIGINT REFERENCES m_users(id);

UPDATE m_customers SET created_by_user_id=(SELECT id FROM m_users WHERE username='admin')
WHERE created_by_user_id IS NULL;
UPDATE m_products SET created_by_user_id=(SELECT id FROM m_users WHERE username='admin')
WHERE created_by_user_id IS NULL;
UPDATE m_packaging_configs SET created_by_user_id=(SELECT id FROM m_users WHERE username='admin')
WHERE created_by_user_id IS NULL;
UPDATE m_trays SET created_by_user_id=(SELECT id FROM m_users WHERE username='admin')
WHERE created_by_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_module_created
    ON t_audit_logs ((metadata->>'module'), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
    ON t_audit_logs (entity_type, entity_id, created_at DESC);

COMMIT;
