BEGIN;

CREATE TABLE IF NOT EXISTS m_system_branding (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    app_name VARCHAR(100) NOT NULL DEFAULT 'MRP Traceability',
    login_wallpaper_data_url TEXT,
    updated_by_user_id BIGINT REFERENCES m_users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO m_system_branding(id,app_name)
VALUES(1,'MRP Traceability')
ON CONFLICT(id) DO NOTHING;

COMMIT;
