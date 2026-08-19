import type { StaffRole } from "../shared/clinic";

export const permissions = {
  dashboard: ["admin", "doctor", "frontdesk"],
  patients: ["admin", "doctor", "frontdesk"],
  schedules: ["admin", "doctor", "frontdesk"],
  pda: ["admin", "doctor"],
  board: ["admin", "doctor", "frontdesk"],
  analytics: ["admin", "doctor"],
  data: ["admin"],
  backups: ["admin"],
  roles: ["admin"],
} as const satisfies Record<string, readonly StaffRole[]>;

export function hasPermission(role: StaffRole, feature: keyof typeof permissions) {
  return (permissions[feature] as readonly StaffRole[]).includes(role);
}

export function dateRangeForPeriod(anchor: Date, period: "day" | "week" | "month") {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  if (period === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === "month") start.setDate(1);
  const end = new Date(start);
  if (period === "day") end.setDate(end.getDate() + 1);
  if (period === "week") end.setDate(end.getDate() + 7);
  if (period === "month") end.setMonth(end.getMonth() + 1);
  return { start, end };
}

export function timeSlotsOverlap(startA: Date, durationA: number, startB: Date, durationB: number) {
  const endA = startA.getTime() + durationA * 60_000;
  const endB = startB.getTime() + durationB * 60_000;
  return startA.getTime() < endB && startB.getTime() < endA;
}

export function validatePatientImportRow(row: { fullName?: string; prescribedTotal?: number }) {
  if (!row.fullName?.trim()) return "患者姓名不能为空";
  if (!Number.isInteger(row.prescribedTotal) || (row.prescribedTotal ?? 0) < 0) return "总治疗次数必须为非负整数";
  return null;
}

export function aggregateVolumes(items: { doctor: string; project: string }[]) {
  const doctor = new Map<string, number>();
  const project = new Map<string, number>();
  items.forEach(item => {
    doctor.set(item.doctor, (doctor.get(item.doctor) ?? 0) + 1);
    project.set(item.project, (project.get(item.project) ?? 0) + 1);
  });
  return {
    doctorVolumes: Array.from(doctor.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    projectVolumes: Array.from(project.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}
