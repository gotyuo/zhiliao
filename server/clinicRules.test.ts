import { describe, expect, it } from "vitest";
import { normalizeQrPayload } from "../shared/clinic";
import { aggregateVolumes, dateRangeForPeriod, hasPermission, timeSlotsOverlap, validatePatientImportRow } from "./clinicRules";

describe("医疗治疗业务规则", () => {
  it("仅允许医生和管理员执行 PDA 治疗核销", () => {
    expect(hasPermission("doctor", "pda")).toBe(true);
    expect(hasPermission("admin", "pda")).toBe(true);
    expect(hasPermission("frontdesk", "pda")).toBe(false);
  });

  it("可从标准二维码载荷或 URL 读取患者令牌", () => {
    expect(normalizeQrPayload("PTMS:token_123")).toBe("token_123");
    expect(normalizeQrPayload("https://example.test/checkin?token=token_456")).toBe("token_456");
  });

  it("日统计范围从当天零点开始且在次日零点结束", () => {
    const { start, end } = dateRangeForPeriod(new Date("2026-08-19T14:30:00"), "day");
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(start.getDate() + 1);
  });

  it("识别同一医生治疗时间重叠，允许首尾相接的排班", () => {
    const atNine = new Date("2026-08-19T09:00:00");
    expect(timeSlotsOverlap(atNine, 30, new Date("2026-08-19T09:20:00"), 30)).toBe(true);
    expect(timeSlotsOverlap(atNine, 30, new Date("2026-08-19T09:30:00"), 30)).toBe(false);
  });

  it("拒绝缺少姓名或治疗次数不合法的患者导入行", () => {
    expect(validatePatientImportRow({ fullName: "", prescribedTotal: 2 })).toBe("患者姓名不能为空");
    expect(validatePatientImportRow({ fullName: "王某", prescribedTotal: -1 })).toBe("总治疗次数必须为非负整数");
    expect(validatePatientImportRow({ fullName: "王某", prescribedTotal: 2 })).toBeNull();
  });

  it("按医生及治疗项目汇总实际治疗量", () => {
    const result = aggregateVolumes([{ doctor: "李医生", project: "物理治疗" }, { doctor: "李医生", project: "物理治疗" }, { doctor: "张医生", project: "针刺治疗" }]);
    expect(result.doctorVolumes[0]).toEqual({ name: "李医生", count: 2 });
    expect(result.projectVolumes[0]).toEqual({ name: "物理治疗", count: 2 });
  });
});
