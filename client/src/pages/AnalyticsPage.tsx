import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BarChart3, ClipboardList, UsersRound, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Metric = { label: string; value: number; note: string; icon: LucideIcon };
export default function AnalyticsPage() {
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [date, setDate] = useState(() => new Date());
  const report = trpc.analytics.overview.useQuery({ period, date });
  const metrics: Metric[] = [
    { label: "治疗人次", value: report.data?.treatmentVisits ?? 0, note: "已完成治疗", icon: UsersRound },
    { label: "治疗项目总数", value: report.data?.treatmentProjectTotal ?? 0, note: "已完成项目量", icon: ClipboardList },
    { label: "医生数量", value: report.data?.doctorVolumes.length ?? 0, note: "产生治疗量的医生", icon: BarChart3 },
  ];
  return <DashboardLayout>
    <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-[#ad8240] text-xs font-semibold tracking-[0.16em]">HISTORICAL INSIGHTS</p><h1 className="mt-2 text-3xl font-serif">历史统计报表</h1><p className="mt-2 text-sm text-[#71847f]">按日、周、月审阅治疗量、治疗项目和各医生治疗量。</p></div><div className="flex items-center gap-2"><div className="rounded-xl bg-[#eaf2ee] p-1">{(["day", "week", "month"] as const).map(item => <Button key={item} size="sm" variant={period === item ? "default" : "ghost"} className={period === item ? "bg-[#0e5a55] hover:bg-[#084842]" : ""} onClick={() => setPeriod(item)}>{{ day: "日", week: "周", month: "月" }[item]}</Button>)}</div><input type="date" className="h-9 rounded-lg border border-[#d7e6e0] bg-white px-3 text-sm" value={date.toISOString().slice(0, 10)} onChange={event => setDate(new Date(`${event.target.value}T00:00:00`))} /></div></section>
    <section className="mt-6 grid gap-4 md:grid-cols-3">{metrics.map(metric => { const Icon = metric.icon; return <Card key={metric.label} className="rounded-2xl border-[#e0ebe6] shadow-none"><CardContent className="p-5 flex items-start justify-between"><div><p className="text-sm text-[#728780]">{metric.label}</p><p className="mt-2 text-3xl font-serif">{metric.value}</p><p className="mt-2 text-xs text-[#8ca09a]">{metric.note}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e6f1eb] text-[#12645c]"><Icon className="h-5 w-5" /></span></CardContent></Card>; })}</section>
    <section className="mt-6 grid gap-6 xl:grid-cols-2"><Card className="rounded-2xl border-[#e0ebe6] shadow-none"><CardContent className="p-5"><h2 className="font-serif text-xl">医生治疗量</h2><p className="mt-1 text-sm text-[#798e87]">按实际完成治疗统计</p><div className="mt-5 h-[300px]">{report.data?.doctorVolumes.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={report.data.doctorVolumes}><CartesianGrid vertical={false} stroke="#e6eeea" /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: "#f0f6f3" }} /><Bar dataKey="count" name="治疗量" fill="#19736a" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="h-full grid place-items-center text-sm text-[#869a94]">当前周期暂无已完成治疗数据。</div>}</div></CardContent></Card><Card className="rounded-2xl border-[#e0ebe6] shadow-none"><CardContent className="p-5"><h2 className="font-serif text-xl">治疗项目构成</h2><p className="mt-1 text-sm text-[#798e87]">以已完成项目为统计口径</p><div className="mt-5 space-y-4">{report.data?.projectVolumes.map(item => <div key={item.name}><div className="flex justify-between text-sm"><span>{item.name}</span><span className="font-medium">{item.count} 次</span></div><div className="mt-2 h-2 rounded-full bg-[#edf3f0]"><div className="h-full rounded-full bg-[#d1a75f]" style={{ width: `${Math.max(8, Math.round((item.count / Math.max(report.data.treatmentVisits, 1)) * 100))}%` }} /></div></div>)}{!report.data?.projectVolumes.length && <div className="py-20 text-center text-sm text-[#869a94]">当前周期暂无已完成治疗数据。</div>}</div></CardContent></Card></section>
  </DashboardLayout>;
}
