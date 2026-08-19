import { COOKIE_NAME } from "@shared/const";
import { and, asc, desc, eq, gte, inArray, like, lt } from "drizzle-orm";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { z } from "zod";
import {
  backupRecords,
  backupSettings,
  patients,
  staffProfiles,
  treatmentProjects,
  treatmentSchedules,
  users,
} from "../drizzle/schema";
import { normalizeQrPayload, type StaffRole } from "../shared/clinic";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { aggregateVolumes, dateRangeForPeriod, hasPermission, timeSlotsOverlap, validatePatientImportRow } from "./clinicRules";
import {
  ensureStaffProfile,
  getDb,
  getStaffProfileByUserId,
  requireDb,
} from "./db";
import { createLocalSession, hashPassword, localLogin, LOCAL_SESSION_COOKIE } from "./localAuth";
import { backupDirectory, requestManualBackup } from "./backup";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const patientInput = z.object({
  fullName: z.string().trim().min(1, "请输入患者姓名").max(80),
  gender: z.enum(["male", "female", "unknown"]),
  birthDate: z.string().optional().nullable(),
  mobile: z.string().trim().max(32).optional().nullable(),
  idNumber: z.string().trim().max(64).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  prescribedTotal: z.number().int().min(0).max(9999),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const scheduleInput = z.object({
  patientId: z.number().int().positive(),
  doctorId: z.number().int().positive(),
  treatmentProjectId: z.number().int().positive(),
  scheduledAt: z.date(),
  durationMinutes: z.number().int().min(5).max(360),
  notes: z.string().trim().max(1000).optional().nullable(),
});

const treatmentImportInput = z.object({
  patientNo: z.string().trim().min(1),
  projectCode: z.string().trim().min(1),
  doctorUsername: z.string().trim().min(1),
  scheduledAt: z.string().trim().min(1),
  status: z.enum(["scheduled", "checked_in", "called", "completed", "cancelled", "no_show"]).default("scheduled"),
  durationMinutes: z.number().int().min(5).max(360).default(30),
  checkedInAt: z.string().trim().optional().nullable(),
  completedAt: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = startOfDay(date);
  value.setDate(value.getDate() + 1);
  return value;
}

function nullableText(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

function maskPatientName(name: string) {
  return name.length <= 1 ? `${name}*` : `${name.slice(0, 1)}${"*".repeat(Math.min(name.length - 1, 3))}`;
}

async function getActor(userId: number, userRole: "admin" | "user") {
  return (await getStaffProfileByUserId(userId)) ?? ensureStaffProfile(userId, userRole === "admin" ? "admin" : "frontdesk");
}

async function requireFeature(user: { id: number; role: "admin" | "user" }, feature: keyof typeof import("./clinicRules").permissions) {
  const actor = await getActor(user.id, user.role);
  if (!actor.isActive || !hasPermission(actor.staffRole, feature)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "当前角色无权访问该功能。" });
  }
  return actor;
}

async function assertScheduleEditable(scheduleId: number, actor: { id: number; staffRole: StaffRole }) {
  const db = await requireDb();
  const schedule = (await db.select().from(treatmentSchedules).where(eq(treatmentSchedules.id, scheduleId)).limit(1))[0];
  if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "未找到治疗排班。" });
  if (actor.staffRole === "doctor" && schedule.doctorId !== actor.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "医生仅可操作本人排班。" });
  }
  return schedule;
}

async function assertNoDoctorConflict(input: z.infer<typeof scheduleInput>, excludeId?: number) {
  const db = await requireDb();
  const dayStart = startOfDay(input.scheduledAt);
  const dayEnd = endOfDay(input.scheduledAt);
  const sameDay = await db.select().from(treatmentSchedules).where(and(
    eq(treatmentSchedules.doctorId, input.doctorId),
    gte(treatmentSchedules.scheduledAt, dayStart),
    lt(treatmentSchedules.scheduledAt, dayEnd),
    inArray(treatmentSchedules.status, ["scheduled", "checked_in", "called"]),
  ));
  const conflict = sameDay.some(item => {
    if (item.id === excludeId) return false;
    return timeSlotsOverlap(input.scheduledAt, input.durationMinutes, item.scheduledAt, item.durationMinutes);
  });
  if (conflict) throw new TRPCError({ code: "CONFLICT", message: "该医生此时间段已有治疗排班。" });
}

async function getTodayQueue() {
  const db = await requireDb();
  const today = startOfDay(new Date());
  const tomorrow = endOfDay(new Date());
  return db.select({
    schedule: treatmentSchedules,
    patient: patients,
    doctor: staffProfiles,
    project: treatmentProjects,
  })
    .from(treatmentSchedules)
    .innerJoin(patients, eq(treatmentSchedules.patientId, patients.id))
    .innerJoin(staffProfiles, eq(treatmentSchedules.doctorId, staffProfiles.id))
    .innerJoin(treatmentProjects, eq(treatmentSchedules.treatmentProjectId, treatmentProjects.id))
    .where(and(gte(treatmentSchedules.scheduledAt, today), lt(treatmentSchedules.scheduledAt, tomorrow)))
    .orderBy(asc(treatmentSchedules.scheduledAt));
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    localLogin: publicProcedure.input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const user = await localLogin(input.username, input.password);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "账号或密码错误。" });
        const token = await createLocalSession(user);
        ctx.res.cookie(LOCAL_SESSION_COOKIE, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 12 * 60 * 60 * 1000,
        });
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(LOCAL_SESSION_COOKIE, { httpOnly: true, path: "/", maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  clinic: router({
    session: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getActor(ctx.user.id, ctx.user.role);
      return { user: ctx.user, profile };
    }),
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx.user, "dashboard");
      const queue = await getTodayQueue();
      const total = queue.filter(item => item.schedule.status !== "cancelled").length;
      const checkedIn = queue.filter(item => ["checked_in", "called", "completed"].includes(item.schedule.status)).length;
      const completed = queue.filter(item => item.schedule.status === "completed").length;
      return { total, checkedIn, completed, pending: total - completed, next: queue.find(item => ["checked_in", "called"].includes(item.schedule.status)) ?? queue.find(item => item.schedule.status === "scheduled") ?? null };
    }),
  }),

  patients: router({
    list: protectedProcedure.input(z.object({ search: z.string().trim().optional(), includeInactive: z.boolean().default(false) })).query(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "patients");
      const db = await requireDb();
      const conditions = input.includeInactive ? [] : [eq(patients.isActive, true)];
      if (input.search) conditions.push(like(patients.fullName, `%${input.search}%`));
      const data = await db.select().from(patients).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(patients.createdAt));
      const schedules = await db.select().from(treatmentSchedules).where(inArray(treatmentSchedules.patientId, data.map(item => item.id).length ? data.map(item => item.id) : [-1]));
      return data.map(patient => {
        const history = schedules.filter(schedule => schedule.patientId === patient.id);
        const completed = history.filter(schedule => schedule.status === "completed").length;
        const future = history.filter(schedule => ["scheduled", "checked_in", "called"].includes(schedule.status)).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
        return { ...patient, completedCount: completed, remainingCount: Math.max(patient.prescribedTotal - completed, 0), nextScheduledAt: future[0]?.scheduledAt ?? null };
      });
    }),
    detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "patients");
      const db = await requireDb();
      const patient = (await db.select().from(patients).where(eq(patients.id, input.id)).limit(1))[0];
      if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "未找到患者。" });
      const history = await db.select({ schedule: treatmentSchedules, project: treatmentProjects, doctor: staffProfiles })
        .from(treatmentSchedules)
        .innerJoin(treatmentProjects, eq(treatmentSchedules.treatmentProjectId, treatmentProjects.id))
        .innerJoin(staffProfiles, eq(treatmentSchedules.doctorId, staffProfiles.id))
        .where(eq(treatmentSchedules.patientId, patient.id))
        .orderBy(desc(treatmentSchedules.scheduledAt));
      const completedCount = history.filter(item => item.schedule.status === "completed").length;
      return { patient, history, completedCount, remainingCount: Math.max(patient.prescribedTotal - completedCount, 0) };
    }),
    create: protectedProcedure.input(patientInput).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "patients");
      const db = await requireDb();
      const now = Date.now().toString(36).toUpperCase();
      const patientNo = `PT${now}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const qrToken = crypto.randomUUID().replaceAll("-", "");
      await db.insert(patients).values({
        patientNo, qrToken, fullName: input.fullName, gender: input.gender,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        mobile: nullableText(input.mobile), idNumber: nullableText(input.idNumber), address: nullableText(input.address),
        prescribedTotal: input.prescribedTotal, notes: nullableText(input.notes), isActive: true,
      });
      return (await db.select().from(patients).where(eq(patients.patientNo, patientNo)).limit(1))[0];
    }),
    update: protectedProcedure.input(patientInput.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "patients");
      const db = await requireDb();
      await db.update(patients).set({
        fullName: input.fullName, gender: input.gender, birthDate: input.birthDate ? new Date(input.birthDate) : null,
        mobile: nullableText(input.mobile), idNumber: nullableText(input.idNumber), address: nullableText(input.address),
        prescribedTotal: input.prescribedTotal, notes: nullableText(input.notes),
      }).where(eq(patients.id, input.id));
      return { success: true } as const;
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "patients");
      const db = await requireDb();
      const linkedSchedules = await db.select({ id: treatmentSchedules.id }).from(treatmentSchedules).where(eq(treatmentSchedules.patientId, input.id)).limit(1);
      if (linkedSchedules[0]) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "该患者已有治疗记录，无法删除；请保留资料以维护治疗审计链。" });
      await db.delete(patients).where(eq(patients.id, input.id));
      return { success: true } as const;
    }),
    qr: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "patients");
      const db = await requireDb();
      const patient = (await db.select().from(patients).where(eq(patients.id, input.id)).limit(1))[0];
      if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "未找到患者。" });
      const payload = `PTMS:${patient.qrToken}`;
      return { patientNo: patient.patientNo, fullName: patient.fullName, payload, dataUrl: await QRCode.toDataURL(payload, { margin: 1, width: 360, errorCorrectionLevel: "M" }) };
    }),
  }),

  kiosk: router({
    inspect: publicProcedure.input(z.object({ payload: z.string().min(1) })).query(async ({ input }) => {
      const db = await requireDb();
      const token = normalizeQrPayload(input.payload);
      const patient = (await db.select().from(patients).where(and(eq(patients.qrToken, token), eq(patients.isActive, true))).limit(1))[0];
      if (!patient) return { found: false as const };
      const schedules = await getTodayQueue();
      const schedule = schedules.find(item => item.patient.id === patient.id && !["completed", "cancelled", "no_show"].includes(item.schedule.status));
      return { found: true as const, patient: { patientNo: patient.patientNo, fullName: patient.fullName }, schedule: schedule ? { id: schedule.schedule.id, scheduledAt: schedule.schedule.scheduledAt, projectName: schedule.project.name, status: schedule.schedule.status } : null };
    }),
    checkIn: publicProcedure.input(z.object({ payload: z.string().min(1) })).mutation(async ({ input }) => {
      const db = await requireDb();
      const token = normalizeQrPayload(input.payload);
      const patient = (await db.select().from(patients).where(and(eq(patients.qrToken, token), eq(patients.isActive, true))).limit(1))[0];
      if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "未识别到有效患者二维码。" });
      const queue = await getTodayQueue();
      const current = queue.find(item => item.patient.id === patient.id && ["scheduled", "checked_in"].includes(item.schedule.status));
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "该患者今日暂无待治疗排班。" });
      if (current.schedule.status === "scheduled") {
        await db.update(treatmentSchedules).set({ status: "checked_in", checkedInAt: new Date() }).where(eq(treatmentSchedules.id, current.schedule.id));
      }
      return { success: true, fullName: patient.fullName, scheduledAt: current.schedule.scheduledAt, projectName: current.project.name, alreadyCheckedIn: current.schedule.status === "checked_in" };
    }),
  }),

  schedules: router({
    list: protectedProcedure.input(z.object({ date: z.date() })).query(async ({ ctx, input }) => {
      const actor = await requireFeature(ctx.user, "schedules");
      const db = await requireDb();
      const conditions = [gte(treatmentSchedules.scheduledAt, startOfDay(input.date)), lt(treatmentSchedules.scheduledAt, endOfDay(input.date))];
      if (actor.staffRole === "doctor") conditions.push(eq(treatmentSchedules.doctorId, actor.id));
      return db.select({ schedule: treatmentSchedules, patient: patients, doctor: staffProfiles, project: treatmentProjects })
        .from(treatmentSchedules)
        .innerJoin(patients, eq(treatmentSchedules.patientId, patients.id))
        .innerJoin(staffProfiles, eq(treatmentSchedules.doctorId, staffProfiles.id))
        .innerJoin(treatmentProjects, eq(treatmentSchedules.treatmentProjectId, treatmentProjects.id))
        .where(and(...conditions)).orderBy(asc(treatmentSchedules.scheduledAt));
    }),
    create: protectedProcedure.input(scheduleInput).mutation(async ({ ctx, input }) => {
      const actor = await requireFeature(ctx.user, "schedules");
      if (actor.staffRole === "doctor" && actor.id !== input.doctorId) throw new TRPCError({ code: "FORBIDDEN", message: "医生只能为本人安排治疗。" });
      const db = await requireDb();
      const [patient, doctor, project] = await Promise.all([
        db.select().from(patients).where(and(eq(patients.id, input.patientId), eq(patients.isActive, true))).limit(1),
        db.select().from(staffProfiles).where(and(eq(staffProfiles.id, input.doctorId), eq(staffProfiles.staffRole, "doctor"), eq(staffProfiles.isActive, true))).limit(1),
        db.select().from(treatmentProjects).where(and(eq(treatmentProjects.id, input.treatmentProjectId), eq(treatmentProjects.isActive, true))).limit(1),
      ]);
      if (!patient[0] || !doctor[0] || !project[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "患者、医生或治疗项目无效。" });
      await assertNoDoctorConflict(input);
      await db.insert(treatmentSchedules).values({ ...input, notes: nullableText(input.notes), status: "scheduled" });
      return { success: true } as const;
    }),
    update: protectedProcedure.input(scheduleInput.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const actor = await requireFeature(ctx.user, "schedules");
      const current = await assertScheduleEditable(input.id, actor);
      if (["completed", "cancelled"].includes(current.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "已完成或已取消的排班不可修改。" });
      if (actor.staffRole === "doctor" && input.doctorId !== actor.id) throw new TRPCError({ code: "FORBIDDEN", message: "医生只能为本人调整排班。" });
      await assertNoDoctorConflict(input, input.id);
      const db = await requireDb();
      await db.update(treatmentSchedules).set({ ...input, notes: nullableText(input.notes) }).where(eq(treatmentSchedules.id, input.id));
      return { success: true } as const;
    }),
    cancel: protectedProcedure.input(z.object({ id: z.number().int().positive(), reason: z.string().trim().max(255).optional() })).mutation(async ({ ctx, input }) => {
      const actor = await requireFeature(ctx.user, "schedules");
      const current = await assertScheduleEditable(input.id, actor);
      if (current.status === "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "已完成治疗不可取消。" });
      const db = await requireDb();
      await db.update(treatmentSchedules).set({ status: "cancelled", cancellationReason: nullableText(input.reason) }).where(eq(treatmentSchedules.id, input.id));
      return { success: true } as const;
    }),
    callNext: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const actor = await requireFeature(ctx.user, "schedules");
      await assertScheduleEditable(input.id, actor);
      const db = await requireDb();
      await db.update(treatmentSchedules).set({ status: "called", calledAt: new Date() }).where(eq(treatmentSchedules.id, input.id));
      return { success: true } as const;
    }),
  }),

  pda: router({
    verify: protectedProcedure.input(z.object({ payload: z.string().min(1) })).query(async ({ ctx, input }) => {
      const actor = await requireFeature(ctx.user, "pda");
      const token = normalizeQrPayload(input.payload);
      const db = await requireDb();
      const patient = (await db.select().from(patients).where(eq(patients.qrToken, token)).limit(1))[0];
      if (!patient) throw new TRPCError({ code: "NOT_FOUND", message: "未识别到患者二维码。" });
      const queue = await getTodayQueue();
      const item = queue.find(row => row.patient.id === patient.id && ["checked_in", "called", "scheduled"].includes(row.schedule.status) && (actor.staffRole === "admin" || row.schedule.doctorId === actor.id));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "未找到可由当前医生执行的今日治疗。" });
      return { patient, schedule: item.schedule, project: item.project, doctor: item.doctor };
    }),
    complete: protectedProcedure.input(z.object({ scheduleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const actor = await requireFeature(ctx.user, "pda");
      const current = await assertScheduleEditable(input.scheduleId, actor);
      if (!["scheduled", "checked_in", "called"].includes(current.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "该排班当前不可核销。" });
      const db = await requireDb();
      await db.update(treatmentSchedules).set({ status: "completed", completedAt: new Date(), performerId: actor.id }).where(eq(treatmentSchedules.id, input.scheduleId));
      return { success: true, completedAt: new Date() };
    }),
  }),

  board: router({
    today: publicProcedure.query(async () => {
      const queue = await getTodayQueue();
      return queue.filter(item => item.schedule.status !== "cancelled").map(item => ({
        id: item.schedule.id,
        sequence: item.patient.patientNo.slice(-4),
        patientName: maskPatientName(item.patient.fullName),
        scheduledAt: item.schedule.scheduledAt,
        status: item.schedule.status,
        projectName: item.project.name,
      }));
    }),
  }),

  catalog: router({
    doctors: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx.user, "schedules");
      const db = await requireDb();
      return db.select({ profile: staffProfiles, user: users }).from(staffProfiles).innerJoin(users, eq(staffProfiles.userId, users.id)).where(and(eq(staffProfiles.staffRole, "doctor"), eq(staffProfiles.isActive, true))).orderBy(asc(users.name));
    }),
    projects: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx.user, "schedules");
      const db = await requireDb();
      return db.select().from(treatmentProjects).where(eq(treatmentProjects.isActive, true)).orderBy(asc(treatmentProjects.name));
    }),
    saveProject: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), code: z.string().trim().min(1).max(32), name: z.string().trim().min(1).max(100), durationMinutes: z.number().int().min(5).max(360), notes: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "data");
      const db = await requireDb();
      const values = { code: input.code.toUpperCase(), name: input.name, durationMinutes: input.durationMinutes, notes: nullableText(input.notes), isActive: true };
      if (input.id) await db.update(treatmentProjects).set(values).where(eq(treatmentProjects.id, input.id));
      else await db.insert(treatmentProjects).values(values);
      return { success: true } as const;
    }),
  }),

  analytics: router({
    overview: protectedProcedure.input(z.object({ period: z.enum(["day", "week", "month"]), date: z.date() })).query(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "analytics");
      const db = await requireDb();
      const { start, end } = dateRangeForPeriod(input.date, input.period);
      const rows = await db.select({ schedule: treatmentSchedules, doctor: staffProfiles, user: users, project: treatmentProjects })
        .from(treatmentSchedules)
        .innerJoin(staffProfiles, eq(treatmentSchedules.doctorId, staffProfiles.id))
        .innerJoin(users, eq(staffProfiles.userId, users.id))
        .innerJoin(treatmentProjects, eq(treatmentSchedules.treatmentProjectId, treatmentProjects.id))
        .where(and(gte(treatmentSchedules.completedAt, start), lt(treatmentSchedules.completedAt, end), eq(treatmentSchedules.status, "completed")));
      const volumes = aggregateVolumes(rows.map(row => ({ doctor: row.user.name ?? "未命名医生", project: row.project.name })));
      return {
        treatmentVisits: rows.length,
        treatmentProjectTotal: rows.length,
        ...volumes,
      };
    }),
  }),

  staff: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx.user, "roles");
      const db = await requireDb();
      return db.select({ profile: staffProfiles, user: users }).from(staffProfiles).innerJoin(users, eq(staffProfiles.userId, users.id)).orderBy(asc(staffProfiles.staffRole), asc(users.name));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(80), username: z.string().trim().min(3).max(64), password: z.string().min(8).max(128), employeeNo: z.string().trim().max(32).optional(), title: z.string().trim().max(64).optional(), staffRole: z.enum(["admin", "doctor", "frontdesk"]) })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "roles");
      const db = await requireDb();
      const username = input.username.toLowerCase();
      const exists = await db.select().from(staffProfiles).where(eq(staffProfiles.username, username)).limit(1);
      if (exists[0]) throw new TRPCError({ code: "CONFLICT", message: "该登录名已存在。" });
      await db.insert(users).values({ openId: `local:${username}`, name: input.name, loginMethod: "local", role: input.staffRole === "admin" ? "admin" : "user", lastSignedIn: new Date() });
      const createdUser = (await db.select().from(users).where(eq(users.openId, `local:${username}`)).limit(1))[0];
      if (!createdUser) throw new Error("创建人员账号失败。");
      await db.insert(staffProfiles).values({ userId: createdUser.id, username, passwordHash: await hashPassword(input.password), employeeNo: nullableText(input.employeeNo), title: nullableText(input.title), staffRole: input.staffRole, isActive: true });
      return { success: true } as const;
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), employeeNo: z.string().trim().max(32).optional().nullable(), title: z.string().trim().max(64).optional().nullable(), staffRole: z.enum(["admin", "doctor", "frontdesk"]), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "roles");
      const db = await requireDb();
      await db.update(staffProfiles).set({ employeeNo: nullableText(input.employeeNo), title: nullableText(input.title), staffRole: input.staffRole, isActive: input.isActive }).where(eq(staffProfiles.id, input.id));
      return { success: true } as const;
    }),
  }),

  dataExchange: router({
    importPatients: protectedProcedure.input(z.object({ rows: z.array(patientInput).min(1).max(500) })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "data");
      const db = await requireDb();
      const created: string[] = [];
      const failures: { row: number; reason: string }[] = [];
      const seen = new Set<string>();
      for (const [index, item] of Array.from(input.rows.entries())) {
        const invalidReason = validatePatientImportRow(item);
        if (invalidReason) { failures.push({ row: index + 2, reason: invalidReason }); continue; }
        const fingerprint = `${item.fullName.trim()}|${(item.mobile ?? "").trim()}|${(item.idNumber ?? "").trim()}`;
        if (seen.has(fingerprint)) { failures.push({ row: index + 2, reason: "文件内存在重复患者" }); continue; }
        seen.add(fingerprint);
        const duplicateConditions = [eq(patients.fullName, item.fullName.trim())];
        if (nullableText(item.idNumber)) duplicateConditions.push(eq(patients.idNumber, nullableText(item.idNumber)!));
        else if (nullableText(item.mobile)) duplicateConditions.push(eq(patients.mobile, nullableText(item.mobile)!));
        const existing = await db.select({ id: patients.id }).from(patients).where(and(...duplicateConditions)).limit(1);
        if (existing[0]) { failures.push({ row: index + 2, reason: "系统中已存在相同患者" }); continue; }
        const patientNo = `PT${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        await db.insert(patients).values({ patientNo, qrToken: crypto.randomUUID().replaceAll("-", ""), fullName: item.fullName, gender: item.gender, birthDate: item.birthDate ? new Date(item.birthDate) : null, mobile: nullableText(item.mobile), idNumber: nullableText(item.idNumber), address: nullableText(item.address), prescribedTotal: item.prescribedTotal, notes: nullableText(item.notes), isActive: true });
        created.push(item.fullName);
      }
      return { created: created.length, names: created, failures };
    }),
    importTreatments: protectedProcedure.input(z.object({ rows: z.array(treatmentImportInput).min(1).max(500) })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "data");
      const db = await requireDb();
      const failures: { row: number; reason: string }[] = [];
      let created = 0;
      for (const [index, row] of Array.from(input.rows.entries())) {
        const scheduledAt = new Date(row.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime())) { failures.push({ row: index + 2, reason: "排班时间无效" }); continue; }
        const [patient, project, doctor] = await Promise.all([
          db.select().from(patients).where(eq(patients.patientNo, row.patientNo)).limit(1),
          db.select().from(treatmentProjects).where(eq(treatmentProjects.code, row.projectCode.toUpperCase())).limit(1),
          db.select().from(staffProfiles).where(eq(staffProfiles.username, row.doctorUsername.toLowerCase())).limit(1),
        ]);
        if (!patient[0] || !project[0] || !doctor[0] || doctor[0].staffRole !== "doctor") {
          failures.push({ row: index + 2, reason: "患者编号、项目编码或医生账号不存在" });
          continue;
        }
        const duplicate = await db.select().from(treatmentSchedules).where(and(
          eq(treatmentSchedules.patientId, patient[0].id), eq(treatmentSchedules.doctorId, doctor[0].id),
          eq(treatmentSchedules.treatmentProjectId, project[0].id), eq(treatmentSchedules.scheduledAt, scheduledAt),
        )).limit(1);
        if (duplicate[0]) { failures.push({ row: index + 2, reason: "存在相同排班，未重复导入" }); continue; }
        const checkedInAt = row.checkedInAt ? new Date(row.checkedInAt) : null;
        const completedAt = row.completedAt ? new Date(row.completedAt) : row.status === "completed" ? scheduledAt : null;
        await db.insert(treatmentSchedules).values({
          patientId: patient[0].id, doctorId: doctor[0].id, treatmentProjectId: project[0].id,
          scheduledAt, durationMinutes: row.durationMinutes, status: row.status,
          checkedInAt: checkedInAt && !Number.isNaN(checkedInAt.getTime()) ? checkedInAt : null,
          completedAt: completedAt && !Number.isNaN(completedAt.getTime()) ? completedAt : null,
          performerId: row.status === "completed" ? doctor[0].id : null,
          notes: nullableText(row.notes),
        });
        created += 1;
      }
      return { created, failures };
    }),
    exportPatients: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx.user, "data");
      const db = await requireDb();
      const data = await db.select().from(patients).orderBy(desc(patients.createdAt));
      const sheet = XLSX.utils.json_to_sheet(data.map(row => ({ "患者编号": row.patientNo, "姓名": row.fullName, "性别": row.gender === "male" ? "男" : row.gender === "female" ? "女" : "未知", "联系电话": row.mobile ?? "", "身份证号": row.idNumber ?? "", "地址": row.address ?? "", "总治疗次数": row.prescribedTotal, "备注": row.notes ?? "", "状态": row.isActive ? "在治" : "停用" })));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "患者信息");
      const buffer = XLSX.write(book, { type: "base64", bookType: "xlsx" });
      return { filename: `患者信息_${new Date().toISOString().slice(0, 10)}.xlsx`, base64: buffer };
    }),
    exportTreatments: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx.user, "data");
      const db = await requireDb();
      const rows = await db.select({ schedule: treatmentSchedules, patient: patients, project: treatmentProjects, doctor: users, doctorProfile: staffProfiles })
        .from(treatmentSchedules).innerJoin(patients, eq(treatmentSchedules.patientId, patients.id)).innerJoin(treatmentProjects, eq(treatmentSchedules.treatmentProjectId, treatmentProjects.id)).innerJoin(staffProfiles, eq(treatmentSchedules.doctorId, staffProfiles.id)).innerJoin(users, eq(staffProfiles.userId, users.id)).orderBy(desc(treatmentSchedules.scheduledAt));
      const sheet = XLSX.utils.json_to_sheet(rows.map(row => ({ "患者编号": row.patient.patientNo, "患者姓名": row.patient.fullName, "治疗项目编码": row.project.code, "治疗项目": row.project.name, "医生账号": row.doctorProfile.username ?? "", "排班医生": row.doctor.name ?? "", "排班时间": row.schedule.scheduledAt.toISOString(), "状态": row.schedule.status, "时长分钟": row.schedule.durationMinutes, "报到时间": row.schedule.checkedInAt?.toISOString() ?? "", "完成时间": row.schedule.completedAt?.toISOString() ?? "", "备注": row.schedule.notes ?? "" })));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "治疗记录");
      return { filename: `治疗记录_${new Date().toISOString().slice(0, 10)}.xlsx`, base64: XLSX.write(book, { type: "base64", bookType: "xlsx" }) };
    }),
  }),

  backups: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await requireFeature(ctx.user, "backups");
      const db = await requireDb();
      const settings = (await db.select().from(backupSettings).limit(1))[0] ?? null;
      const records = await db.select().from(backupRecords).orderBy(desc(backupRecords.createdAt)).limit(100);
      return {
        settings: settings ?? {
          enabled: process.env.BACKUP_ENABLED !== "false",
          intervalHours: Number(process.env.BACKUP_INTERVAL_HOURS ?? 24),
          retentionDays: Number(process.env.BACKUP_RETENTION_DAYS ?? 30),
          lastRunAt: null,
        },
        directory: backupDirectory(),
        records,
      };
    }),
    updateSettings: protectedProcedure.input(z.object({ enabled: z.boolean(), intervalHours: z.number().int().min(1).max(168), retentionDays: z.number().int().min(1).max(3650) })).mutation(async ({ ctx, input }) => {
      await requireFeature(ctx.user, "backups");
      const db = await requireDb();
      await db.insert(backupSettings).values({ id: 1, ...input, updatedById: ctx.user.id }).onDuplicateKeyUpdate({ set: { ...input, updatedById: ctx.user.id } });
      return { success: true } as const;
    }),
    requestNow: protectedProcedure.mutation(async ({ ctx }) => {
      await requireFeature(ctx.user, "backups");
      await requestManualBackup();
      return { success: true, message: "已向备份服务提交立即执行请求，完成后将显示在备份列表中。" };
    }),
  }),
});

export type AppRouter = typeof appRouter;
