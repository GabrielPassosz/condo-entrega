import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const condominiums = sqliteTable("condominiums", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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
    uniqueIndex("profiles_email_unique").on(table.email),
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
    pickupCode: text("pickup_code").notNull(),
    status: text("status", { enum: ["waiting", "withdrawn"] })
      .notNull()
      .default("waiting"),
    notificationStatus: text("notification_status", {
      enum: ["pending", "sent", "failed", "not_configured"],
    })
      .notNull()
      .default("pending"),
    notificationError: text("notification_error").notNull().default(""),
    whatsappMessageId: text("whatsapp_message_id").notNull().default(""),
    registeredBy: text("registered_by").notNull(),
    withdrawnBy: text("withdrawn_by").notNull().default(""),
    failedPickupAttempts: integer("failed_pickup_attempts").notNull().default(0),
    receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    notifiedAt: text("notified_at"),
    withdrawnAt: text("withdrawn_at"),
  },
  (table) => [
    index("packages_condo_status_idx").on(table.condominiumId, table.status),
    index("packages_resident_idx").on(table.residentId),
    index("packages_received_idx").on(table.receivedAt),
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
