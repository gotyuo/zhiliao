export const staffRoles = ["admin", "doctor", "frontdesk"] as const;
export type StaffRole = (typeof staffRoles)[number];

export const scheduleStatuses = ["scheduled", "checked_in", "called", "completed", "cancelled", "no_show"] as const;
export type ScheduleStatus = (typeof scheduleStatuses)[number];

export const roleLabels: Record<StaffRole, string> = {
  admin: "管理员",
  doctor: "医生",
  frontdesk: "前台",
};

export function normalizeQrPayload(payload: string) {
  const compact = payload.trim();
  if (compact.startsWith("PTMS:")) return compact.slice(5);
  const urlToken = compact.match(/[?&]token=([A-Za-z0-9_-]+)/)?.[1];
  return urlToken ?? compact;
}

