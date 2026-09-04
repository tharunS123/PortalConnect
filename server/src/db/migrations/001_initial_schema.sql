-- ---------------------------------------------------------------------------
-- 001 · Initial schema
--
-- Replaces the flat `db.json` document used by json-server with a relational
-- model that can enforce uniqueness, referential integrity and RBAC.
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE menus (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- One row per (role, menu). Absence of a row means "no access at all".
CREATE TABLE role_permissions (
  role_code  TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  menu_code  TEXT NOT NULL REFERENCES menus(code) ON DELETE CASCADE,
  can_view   INTEGER NOT NULL DEFAULT 1 CHECK (can_view   IN (0, 1)),
  can_create INTEGER NOT NULL DEFAULT 0 CHECK (can_create IN (0, 1)),
  can_edit   INTEGER NOT NULL DEFAULT 0 CHECK (can_edit   IN (0, 1)),
  can_delete INTEGER NOT NULL DEFAULT 0 CHECK (can_delete IN (0, 1)),
  PRIMARY KEY (role_code, menu_code)
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  -- bcrypt digest. The plaintext password is never stored or returned.
  password_hash TEXT NOT NULL,
  gender        TEXT CHECK (gender IN ('male', 'female', 'other', 'undisclosed')),
  role_code     TEXT REFERENCES roles(code) ON DELETE SET NULL,
  is_active     INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Case-insensitive uniqueness: "Admin" and "admin" must not both exist.
CREATE UNIQUE INDEX idx_users_username_unique ON users (lower(username));
CREATE UNIQUE INDEX idx_users_email_unique    ON users (lower(email));
CREATE INDEX        idx_users_role            ON users (role_code);

-- Only the SHA-256 digest of a refresh token is stored, so a database dump
-- cannot be replayed as a valid session.
CREATE TABLE refresh_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at   TEXT,
  -- Set when this token is rotated, so replay of a consumed token is detectable.
  replaced_by  TEXT,
  user_agent   TEXT,
  ip_address   TEXT
);

CREATE INDEX idx_refresh_tokens_user    ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens (expires_at);

CREATE TABLE customers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  credit_limit REAL NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'prospect')),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_customers_name   ON customers (name);
CREATE INDEX idx_customers_status ON customers (status);

-- Append-only trail of privileged actions.
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  metadata    TEXT,
  ip_address  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_log_actor   ON audit_log (actor_id);
CREATE INDEX idx_audit_log_created ON audit_log (created_at DESC);
