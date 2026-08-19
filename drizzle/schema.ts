import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const staffProfiles = mysqlTable(
  "staff_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    username: varchar("username", { length: 64 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    employeeNo: varchar("employeeNo", { length: 32 }),
    title: varchar("title", { length: 64 }),
    staffRole: mysqlEnum("staffRole", ["admin", "doctor", "frontdesk"]).default("frontdesk").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("staff_profiles_username_uq").on(table.username), index("staff_profiles_role_idx").on(table.staffRole)]
);

export const treatmentProjects = mysqlTable(
  "treatment_projects",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    durationMinutes: int("durationMinutes").default(30).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("treatment_projects_active_idx").on(table.isActive)]
);

export const patients = mysqlTable(
  "patients",
  {
    id: int("id").autoincrement().primaryKey(),
    patientNo: varchar("patientNo", { length: 32 }).notNull().unique(),
    fullName: varchar("fullName", { length: 80 }).notNull(),
    gender: mysqlEnum("gender", ["male", "female", "unknown"]).default("unknown").notNull(),
    birthDate: timestamp("birthDate"),
    mobile: varchar("mobile", { length: 32 }),
    idNumber: varchar("idNumber", { length: 64 }),
    address: varchar("address", { length: 255 }),
    qrToken: varchar("qrToken", { length: 80 }).notNull().unique(),
    prescribedTotal: int("prescribedTotal").default(0).notNull(),
    notes: text("notes"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("patients_name_idx").on(table.fullName), index("patients_active_idx").on(table.isActive)]
);

export const treatmentSchedules = mysqlTable(
  "treatment_schedules",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: int("patientId").notNull().references(() => patients.id, { onDelete: "restrict" }),
    doctorId: int("doctorId").notNull().references(() => staffProfiles.id, { onDelete: "restrict" }),
    treatmentProjectId: int("treatmentProjectId").notNull().references(() => treatmentProjects.id, { onDelete: "restrict" }),
    scheduledAt: timestamp("scheduledAt").notNull(),
    durationMinutes: int("durationMinutes").default(30).notNull(),
    status: mysqlEnum("status", ["scheduled", "checked_in", "called", "completed", "cancelled", "no_show"]).default("scheduled").notNull(),
    checkedInAt: timestamp("checkedInAt"),
    calledAt: timestamp("calledAt"),
    completedAt: timestamp("completedAt"),
    performerId: int("performerId").references(() => staffProfiles.id, { onDelete: "set null" }),
    cancellationReason: varchar("cancellationReason", { length: 255 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("treatment_schedules_time_idx").on(table.scheduledAt),
    index("treatment_schedules_patient_idx").on(table.patientId),
    index("treatment_schedules_doctor_idx").on(table.doctorId),
    index("treatment_schedules_status_idx").on(table.status),
  ]
);

export const backupSettings = mysqlTable("backup_settings", {
  id: int("id").autoincrement().primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  intervalHours: int("intervalHours").default(24).notNull(),
  retentionDays: int("retentionDays").default(30).notNull(),
  updatedById: int("updatedById").references(() => users.id, { onDelete: "set null" }),
  lastRunAt: timestamp("lastRunAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const backupRecords = mysqlTable(
  "backup_records",
  {
    id: int("id").autoincrement().primaryKey(),
    filename: varchar("filename", { length: 255 }).notNull().unique(),
    sizeBytes: int("sizeBytes").default(0).notNull(),
    status: mysqlEnum("status", ["completed", "failed"]).default("completed").notNull(),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("backup_records_created_idx").on(table.createdAt)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type StaffProfile = typeof staffProfiles.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type TreatmentSchedule = typeof treatmentSchedules.$inferSelect;
