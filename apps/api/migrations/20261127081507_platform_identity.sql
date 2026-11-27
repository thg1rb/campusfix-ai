-- +goose Up
CREATE TABLE departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    responsibility_scope text NOT NULL DEFAULT '',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX departments_name_key ON departments (lower(name));

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_provider text NOT NULL,
    provider_subject_id text NOT NULL,
    username text NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,30}$'),
    real_name text NOT NULL,
    email text NOT NULL,
    email_verified boolean NOT NULL DEFAULT false,
    hosted_domain text,
    avatar_url text,
    department_id uuid REFERENCES departments(id) ON DELETE RESTRICT,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (auth_provider, provider_subject_id)
);
CREATE UNIQUE INDEX users_username_key ON users (lower(username));
CREATE INDEX users_email_idx ON users (email);
CREATE INDEX users_department_idx ON users (department_id);
CREATE INDEX users_active_idx ON users (is_active);

CREATE TABLE user_roles (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('REPORTER','REVIEWER','DEPARTMENT_STAFF','ADMINISTRATOR')),
    assigned_at timestamptz NOT NULL DEFAULT now(),
    assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role)
);

-- +goose StatementBegin
CREATE FUNCTION check_user_access() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    account_id uuid;
    department uuid;
    role_count integer;
    has_admin boolean;
    has_staff boolean;
BEGIN
    IF TG_TABLE_NAME = 'users' THEN
        account_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        account_id := OLD.user_id;
    ELSE
        account_id := NEW.user_id;
    END IF;
    SELECT department_id INTO department FROM users WHERE id = account_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT count(*), coalesce(bool_or(role = 'ADMINISTRATOR'), false),
        coalesce(bool_or(role = 'DEPARTMENT_STAFF'), false)
    INTO role_count, has_admin, has_staff FROM user_roles WHERE user_id = account_id;
    IF (has_admin AND (role_count <> 1 OR department IS NOT NULL))
        OR has_staff <> (department IS NOT NULL) THEN
        RAISE EXCEPTION 'inconsistent account roles and department' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
-- +goose StatementEnd
CREATE CONSTRAINT TRIGGER users_access AFTER INSERT OR UPDATE OF department_id ON users
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_user_access();
CREATE CONSTRAINT TRIGGER user_roles_access AFTER INSERT OR UPDATE OR DELETE ON user_roles
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_user_access();
-- An assignment can be replaced through DELETE and INSERT, preserving both trigger checks.
-- +goose StatementBegin
CREATE FUNCTION prevent_role_reparenting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.user_id <> OLD.user_id THEN
        RAISE EXCEPTION 'cannot move a role assignment' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER role_assignment_owner BEFORE UPDATE OF user_id ON user_roles
    FOR EACH ROW EXECUTE FUNCTION prevent_role_reparenting();

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash text NOT NULL UNIQUE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiration_idx ON sessions (expires_at);

CREATE TABLE record_sequences (
    kind text NOT NULL CHECK (kind IN ('RPT','TKT')),
    year smallint NOT NULL,
    last_value integer NOT NULL DEFAULT 0 CHECK (last_value BETWEEN 0 AND 99999),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, year)
);

CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text NOT NULL CHECK (entity_type IN ('REPORT','TICKET','AI_RUN','USER','CATEGORY','DEPARTMENT','LOCATION','RETENTION')),
    entity_id uuid NOT NULL,
    action text NOT NULL,
    actor_type text NOT NULL CHECK (actor_type IN ('USER','SYSTEM','AI_SERVICE')),
    actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
    actor_roles jsonb NOT NULL DEFAULT '[]',
    department_id uuid REFERENCES departments(id) ON DELETE RESTRICT,
    details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((actor_type = 'USER') = (actor_user_id IS NOT NULL))
);
CREATE INDEX audit_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_actor_idx ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_action_idx ON audit_logs (action, created_at DESC);
CREATE INDEX audit_time_idx ON audit_logs (created_at DESC);

INSERT INTO departments (id, name, responsibility_scope) VALUES
('c9de655b-4f30-4fb6-8edf-000000000001', 'กองอาคารสถานที่', 'ซ่อมบำรุงอาคาร ไฟฟ้าแสงสว่าง ประปา แอร์ ลิฟต์ ถนน และท่อระบายน้ำ'),
('c9de655b-4f30-4fb6-8edf-000000000002', 'สำนักบริการคอมพิวเตอร์', 'เครือข่าย KU-WiFi ระบบสารสนเทศ และจุดกระจายสัญญาณภายในวิทยาเขต'),
('c9de655b-4f30-4fb6-8edf-000000000003', 'งานรักษาความสะอาดและภูมิทัศน์', 'จัดเก็บขยะ ทำความสะอาดพื้นที่ส่วนกลาง ห้องน้ำ และดูแลต้นไม้/ภูมิทัศน์'),
('c9de655b-4f30-4fb6-8edf-000000000004', 'งานรักษาความปลอดภัยและจราจร', 'ความปลอดภัยพื้นที่ จุดเสี่ยงแสงสว่างน้อย การจราจร และพื้นที่จอดรถ'),
('c9de655b-4f30-4fb6-8edf-000000000005', 'งานโสตทัศนูปกรณ์และห้องเรียน', 'อุปกรณ์การเรียนการสอน โต๊ะ เก้าอี้ โปรเจคเตอร์ และไมโครโฟนในอาคารเรียนรวม');

-- +goose Down
DROP TABLE audit_logs, record_sequences, sessions, user_roles, users, departments;
DROP FUNCTION check_user_access(), prevent_role_reparenting();
