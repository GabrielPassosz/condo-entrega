import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const condominiums = sqliteTable(
  "condominiums",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull().default(""),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    photoRetentionDays: integer("photo_retention_days").notNull().default(90),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    // ADD COLUMN no D1 exige default constante; toda criação/alteração pela
    // aplicação grava o timestamp ISO explicitamente.
    updatedAt: text("updated_at").notNull().default(""),
  },
  (table) => [
    uniqueIndex("condominiums_slug_unique")
      .on(table.slug)
      .where(sql`${table.slug} <> ''`),
  ],
);

export const residents = sqliteTable(
  "residents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    condominiumId: integer("condominium_id")
      .notNull()
      .references(() => condominiums.id, { onDelete: "cascade" }),
    unit: text("unit").notNull(),
    block: text("block").notNull().default(""),
    apartment: text("apartment").notNull().default(""),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull().default(""),
    authorizedPeople: text("authorized_people").notNull().default(""),
    notes: text("notes").notNull().default(""),
    whatsappOptInAt: text("whatsapp_opt_in_at"),
    normalizedName: text("normalized_name").notNull(),
    normalizedUnit: text("normalized_unit").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("residents_condo_name_unit_unique").on(
      table.condominiumId,
      table.normalizedName,
      table.normalizedUnit,
    ),
    index("residents_condo_active_idx").on(table.condominiumId, table.active),
    index("residents_email_idx").on(table.email),
  ],
);

export const profiles = sqliteTable(
  "profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    condominiumId: integer("condominium_id")
      .notNull()
      .references(() => condominiums.id, { onDelete: "cascade" }),
    residentId: integer("resident_id").references(() => residents.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").notNull().default(""),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", {
      enum: ["admin", "porter", "resident"],
    })
      .notNull()
      .default("resident"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("profiles_condo_email_unique").on(
      table.condominiumId,
      table.email,
    ),
    index("profiles_user_id_idx").on(table.userId),
    index("profiles_email_idx").on(table.email),
    index("profiles_condo_role_idx").on(table.condominiumId, table.role),
  ],
);

export const packages = sqliteTable(
  "packages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    condominiumId: integer("condominium_id")
      .notNull()
      .references(() => condominiums.id, { onDelete: "cascade" }),
    residentId: integer("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "restrict" }),
    description: text("description").notNull().default(""),
    trackingCode: text("tracking_code").notNull().default(""),
    scanText: text("scan_text").notNull().default(""),
    photoKey: text("photo_key").notNull(),
    photoMime: text("photo_mime").notNull(),
    photoExpiresAt: text("photo_expires_at"),
    photoDeletedAt: text("photo_deleted_at"),
    idempotencyKey: text("idempotency_key").notNull().default(""),
    pickupCodeEncrypted: text("pickup_code_encrypted").notNull().default(""),
    pickupCodeHash: text("pickup_code_hash").notNull().default(""),
    pickupCode: text("pickup_code").notNull(),
    status: text("status", { enum: ["waiting", "withdrawn"] })
      .notNull()
      .default("waiting"),
    notificationStatus: text("notification_status", {
      enum: [
        "pending",
        "sent",
        "delivered",
        "read",
        "failed",
        "not_configured",
        "consent_required",
      ],
    })
      .notNull()
      .default("pending"),
    notificationError: text("notification_error").notNull().default(""),
    notificationAttempts: integer("notification_attempts").notNull().default(0),
    lastNotificationAttemptAt: text("last_notification_attempt_at"),
    whatsappMessageId: text("whatsapp_message_id").notNull().default(""),
    registeredBy: text("registered_by").notNull(),
    withdrawnBy: text("withdrawn_by").notNull().default(""),
    failedPickupAttempts: integer("failed_pickup_attempts").notNull().default(0),
    receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    notifiedAt: text("notified_at"),
    withdrawnAt: text("withdrawn_at"),
  },
  (table) => [
    uniqueIndex("packages_condo_idempotency_unique")
      .on(table.condominiumId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} <> ''`),
    index("packages_condo_status_idx").on(table.condominiumId, table.status),
    index("packages_resident_idx").on(table.residentId),
    index("packages_received_idx").on(table.receivedAt),
    index("packages_photo_expiry_idx").on(
      table.condominiumId,
      table.photoExpiresAt,
    ),
    index("packages_whatsapp_message_idx")
      .on(table.whatsappMessageId)
      .where(sql`${table.whatsappMessageId} <> ''`),
  ],
);

export const messageLogs = sqliteTable(
  "message_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("whatsapp"),
    status: text("status").notNull(),
    remoteId: text("remote_id").notNull().default(""),
    error: text("error").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("message_logs_package_idx").on(table.packageId)],
);

export const notificationJobs = sqliteTable(
  "notification_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    condominiumId: integer("condominium_id")
      .notNull()
      .references(() => condominiums.id, { onDelete: "cascade" }),
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lockedAt: text("locked_at"),
    lastError: text("last_error").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("notification_jobs_package_unique").on(table.packageId),
    index("notification_jobs_due_idx").on(table.status, table.availableAt),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    condominiumId: integer("condominium_id")
      .notNull()
      .references(() => condominiums.id, { onDelete: "cascade" }),
    actorProfileId: integer("actor_profile_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email").notNull().default(""),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull().default(""),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_logs_condo_created_idx").on(
      table.condominiumId,
      table.createdAt,
    ),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);
