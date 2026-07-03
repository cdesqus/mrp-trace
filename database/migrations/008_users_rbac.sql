BEGIN;

CREATE TABLE m_permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    permission_code VARCHAR(80) NOT NULL UNIQUE,
    permission_name VARCHAR(120) NOT NULL,
    module VARCHAR(60) NOT NULL
);

CREATE TABLE m_roles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_code VARCHAR(60) NOT NULL UNIQUE,
    role_name VARCHAR(120) NOT NULL,
    description VARCHAR(240),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE m_role_permissions (
    role_id BIGINT NOT NULL REFERENCES m_roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES m_permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE m_users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    full_name VARCHAR(160) NOT NULL,
    email VARCHAR(180),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE m_user_roles (
    user_id BIGINT NOT NULL REFERENCES m_users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES m_roles(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE t_auth_sessions (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES m_users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    ip_address VARCHAR(80),
    user_agent VARCHAR(300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT REFERENCES m_users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(100),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    ip_address VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_sessions_active ON t_auth_sessions(token_hash, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_audit_logs_created ON t_audit_logs(created_at DESC);

INSERT INTO m_permissions(permission_code,permission_name,module) VALUES
('dashboard.view','View Dashboard','Dashboard'),
('master.view','View Master Data','Master Data'),('master.manage','Manage Master Data','Master Data'),
('sales.view','View Sales Orders','Production'),('sales.manage','Manage Sales Orders','Production'),
('qc.view','View Quality Control','Quality Control'),('qc.operate','Operate Quality Control','Quality Control'),
('laser.view','View Laser Queue','Production'),('laser.operate','Operate Laser Marking','Production'),
('packing.view','View Packing','Logistics'),('packing.operate','Operate Packing','Logistics'),
('inventory.view','View Finished Goods','Logistics'),
('delivery.view','View Delivery Orders','Logistics'),('delivery.manage','Manage Delivery Orders','Logistics'),
('trace.view','View Traceability','Analytics'),
('settings.view','View Settings','Settings'),('settings.manage','Manage Users and RBAC','Settings')
ON CONFLICT(permission_code) DO NOTHING;

INSERT INTO m_roles(role_code,role_name,description,is_system) VALUES
('ADMIN','Administrator','Full system access',TRUE),
('SUPERVISOR','Production Supervisor','Operational visibility and control',TRUE),
('QC_OPERATOR','QC Operator','Initial and Rework QC operations',TRUE),
('PACKING_OPERATOR','Packing Operator','Small and Master Box operations',TRUE),
('LOGISTICS','Logistics Operator','Finished Goods and Delivery operations',TRUE)
ON CONFLICT(role_code) DO NOTHING;

INSERT INTO m_role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM m_roles r CROSS JOIN m_permissions p WHERE r.role_code='ADMIN'
ON CONFLICT DO NOTHING;
INSERT INTO m_role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM m_roles r JOIN m_permissions p ON p.permission_code IN
('dashboard.view','master.view','sales.view','sales.manage','qc.view','qc.operate','laser.view','laser.operate','packing.view','inventory.view','delivery.view','trace.view')
WHERE r.role_code='SUPERVISOR' ON CONFLICT DO NOTHING;
INSERT INTO m_role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM m_roles r JOIN m_permissions p ON p.permission_code IN ('dashboard.view','qc.view','qc.operate')
WHERE r.role_code='QC_OPERATOR' ON CONFLICT DO NOTHING;
INSERT INTO m_role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM m_roles r JOIN m_permissions p ON p.permission_code IN ('dashboard.view','packing.view','packing.operate','inventory.view')
WHERE r.role_code='PACKING_OPERATOR' ON CONFLICT DO NOTHING;
INSERT INTO m_role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM m_roles r JOIN m_permissions p ON p.permission_code IN ('dashboard.view','inventory.view','delivery.view','delivery.manage','trace.view')
WHERE r.role_code='LOGISTICS' ON CONFLICT DO NOTHING;

-- Bootstrap only. Username: admin, password: password. Change immediately after first login.
INSERT INTO m_users(username,password_hash,full_name,email,must_change_password)
VALUES('admin','$2a$10$neq3waFUE9axQJ3JkjUVQunHAwNHZpviXQYUkVZlJPfvomGEbq4lO','System Administrator','admin@local',TRUE)
ON CONFLICT(username) DO NOTHING;
INSERT INTO m_user_roles(user_id,role_id)
SELECT u.id,r.id FROM m_users u JOIN m_roles r ON r.role_code='ADMIN' WHERE u.username='admin'
ON CONFLICT DO NOTHING;

COMMIT;
