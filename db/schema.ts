import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  displayName: text("display_name"),
  plan: text("plan").notNull().default("free"),
  planExpiresAt: integer("plan_expires_at"),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});

export const generations = sqliteTable("generations", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  scene: text("scene").notNull(),
  topic: text("topic").notNull(),
  style: text("style").notNull(),
  resultJson: text("result_json").notNull(),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  product: text("product").notNull(),
  amountFen: integer("amount_fen").notNull(),
  status: text("status").notNull(),
  providerTradeNo: text("provider_trade_no"),
  createdAt: integer("created_at").notNull(),
  paidAt: integer("paid_at"),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const secretSettings = sqliteTable("secret_settings", {
  key: text("key").primaryKey(),
  encryptedValue: text("encrypted_value").notNull(),
  iv: text("iv").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const dailyUsage = sqliteTable("daily_usage", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  usageDate: text("usage_date").notNull(),
  used: integer("used").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const siteAdmins = sqliteTable("site_admins", {
  email: text("email").primaryKey(),
  active: integer("active").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const adminAudit = sqliteTable("admin_audit", {
  id: text("id").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  detail: text("detail").notNull(),
  createdAt: integer("created_at").notNull(),
}, table => [index("admin_audit_created_idx").on(table.createdAt)]);

export const aiProviderChecks = sqliteTable("ai_provider_checks", {
  providerId: text("provider_id").primaryKey(),
  model: text("model").notNull(),
  ok: integer("ok").notNull(),
  resolvedModel: text("resolved_model"),
  detail: text("detail").notNull(),
  checkedAt: integer("checked_at").notNull(),
});
