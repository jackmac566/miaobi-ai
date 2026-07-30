CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  display_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS local_credentials (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_windows (
  user_key TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  scene TEXT NOT NULL,
  topic TEXT NOT NULL,
  style TEXT NOT NULL,
  result_json TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  product TEXT NOT NULL,
  amount_fen INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider_trade_no TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS generations_user_created_idx ON generations(user_email, created_at);
CREATE INDEX IF NOT EXISTS generations_model_created_idx ON generations(model, created_at);
CREATE INDEX IF NOT EXISTS generations_created_idx ON generations(created_at);
CREATE INDEX IF NOT EXISTS users_created_idx ON users(created_at);
CREATE INDEX IF NOT EXISTS users_plan_expires_idx ON users(plan, plan_expires_at);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS orders_paid_idx ON orders(status, paid_at);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit(created_at);
