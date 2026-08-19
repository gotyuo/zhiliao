import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { CalendarPlus, CheckCircle2, Clock3, MonitorUp, ScanLine, Users } from "lucide-react";
import { Link } from "wouter";

const statusText: Record<string, string> = { scheduled: "待报到", checked_in: "已报到", called: "叫号中", completed: "已完成", cancelled: "已取消", no_show: "爽约" };

export default function Home() {
  const dashboard = trpc.clinic.dashboard.useQuery();
  const session = trpc.clinic.session.useQuery();
  const cards = [
    { label: "今日排班", value: dashboard.data?.total ?? 0, note: "包含待报到与已报到患者", icon: CalendarPlus, tone: "bg-[#e3f1eb] text-[#0f6159]" },
    { label: "已完成治疗", value: dashboard.data?.completed ?? 0, note: "本日已核销治疗人次", icon: CheckCircle2, tone: "bg-[#f7eddb] text-[#a16e20]" },
    { label: "候诊队列", value: dashboard.data?.pending ?? 0, note: "尚未完成的治疗排班", icon: Users, tone: "bg-[#e5eef5] text-[#33709a]" },
  ];
  return <DashboardLayout>
    <section className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-[#ad8240] text-xs font-semibold tracking-[0.16em]">TODAY AT A GLANCE</p><h1 className="mt-2 text-3xl font-serif text-[#183f3d]">早上好，{session.data?.user.name ?? "工作人员"}</h1><p className="mt-2 text-sm text-[#71847f]">患者治疗流程状态已汇总至本日工作台。</p></div><div className="flex flex-wrap gap-3"><Link href="/schedules"><Button className="rounded-xl bg-[#0e5a55] hover:bg-[#084842]"><CalendarPlus className="h-4 w-4" />安排治疗</Button></Link><Link href="/pda"><Button variant="outline" className="rounded-xl border-[#bed3cc] text-[#145c56]"><ScanLine className="h-4 w-4" />PDA核销</Button></Link><Link href="/board"><Button variant="outline" className="rounded-xl border-[#bed3cc]"><MonitorUp className="h-4 w-4" />候诊大屏</Button></Link></div></section>
    <section className="grid gap-4 md:grid-cols-3">{cards.map(card => <Card key={card.label} className="rounded-2xl border-[#e0ebe6] shadow-none"><CardContent className="p-5"><div className="flex justify-between"><div><p className="text-sm text-[#607772]">{card.label}</p>{dashboard.isLoading ? <Skeleton className="mt-3 h-9 w-16" /> : <p className="mt-2 text-4xl font-serif text-[#1d4a47]">{card.value}</p>}<p className="mt-3 text-xs text-[#8aa099]">{card.note}</p></div><span className={`h-11 w-11 rounded-2xl grid place-items-center ${card.tone}`}><card.icon className="h-5 w-5" /></span></div></CardContent></Card>)}</section>
    <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]"><Card className="rounded-2xl border-[#e0ebe6] shadow-none overflow-hidden"><CardContent className="p-0"><div className="p-5 flex items-center justify-between border-b border-[#e8f0ed]"><div><h2 className="font-serif text-xl">本日治疗节奏</h2><p className="text-sm mt-1 text-[#778d86]">实时反映排班、报到和核销状态</p></div><Link href="/schedules" className="text-sm text-[#0f665d] hover:underline">查看排班</Link></div><div className="divide-y divide-[#edf3f0]">{dashboard.isLoading && <div className="p-5"><Skeleton className="h-14 w-full" /></div>}{!dashboard.isLoading && dashboard.data?.next ? <div className="p-5 flex items-center gap-4"><span className="h-11 w-11 shrink-0 rounded-full bg-[#e6f1ec] grid place-items-center text-[#0e6259]"><Clock3 className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-medium">下一位：{dashboard.data.next.patient.fullName}</p><p className="text-sm text-[#768a84] mt-1">{dashboard.data.next.project.name} · {dashboard.data.next.schedule.scheduledAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</p></div><Badge className="bg-[#f7ebd3] text-[#8b611c] hover:bg-[#f7ebd3]">{statusText[dashboard.data.next.schedule.status]}</Badge></div> : !dashboard.isLoading ? <div className="p-10 text-center text-sm text-[#81948f]">今日暂未安排待执行治疗。</div> : null}</div></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-[#153f3d] text-white overflow-hidden relative"><div className="absolute inset-0 clinic-grid opacity-40" /><CardContent className="relative p-6 h-full flex flex-col"><span className="h-10 w-10 rounded-xl bg-[#cda75d] text-[#153f3d] grid place-items-center"><Clock3 className="h-5 w-5" /></span><p className="mt-7 text-[#c5ddd6] text-xs tracking-[0.16em]">TODAY’S CHECK-IN</p><p className="mt-2 text-5xl font-serif">{dashboard.data?.checkedIn ?? 0}<span className="text-lg ml-2 text-[#c4d9d3]">人已报到</span></p><p className="mt-4 text-sm leading-6 text-[#adc8c1]">患者报到后，前台可在排班中执行叫号；医生可通过 PDA 核销记录实际完成时间。</p><Link href="/kiosk" className="mt-auto pt-7"><Button variant="secondary" className="w-full rounded-xl bg-white text-[#15504b] hover:bg-[#e8f1ed]">打开自助报到终端</Button></Link></CardContent></Card>
    </section>
  </DashboardLayout>;
}
