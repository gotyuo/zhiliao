import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, ShieldCheck, Stethoscope, UserCog, type LucideIcon } from "lucide-react";
import { FormEvent, useState } from "react";

const roleLabels: Record<string, string> = { admin: "管理员", doctor: "医生", frontdesk: "前台" };
const roleCards: { name: string; description: string; icon: LucideIcon }[] = [
  { name: "管理员", description: "系统、人员、数据与备份管理", icon: ShieldCheck },
  { name: "医生", description: "本人排班、治疗核销与统计", icon: Stethoscope },
  { name: "前台", description: "患者、报到与治疗排班", icon: UserCog },
];

export default function StaffPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", password: "", employeeNo: "", title: "", staffRole: "doctor" as "admin" | "doctor" | "frontdesk" });
  const staff = trpc.staff.list.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.staff.create.useMutation({ onSuccess: () => { setOpen(false); utils.staff.list.invalidate(); } });
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate(form); };
  return <DashboardLayout>
    <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[#ad8240] text-xs font-semibold tracking-[0.16em]">ROLE BASED ACCESS</p><h1 className="mt-2 text-3xl font-serif">人员与权限</h1><p className="mt-2 text-sm text-[#71847f]">管理员、医生与前台按工作职责访问相应功能和数据。</p></div><Button className="rounded-xl bg-[#0e5a55] hover:bg-[#084842]" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />新增人员</Button></section>
    <section className="mt-6 grid gap-4 md:grid-cols-3">{roleCards.map(item => { const Icon = item.icon; return <Card key={item.name} className="rounded-2xl border-[#e0ebe6] shadow-none"><CardContent className="p-5"><Icon className="h-5 w-5 text-[#1b6c62]" /><p className="mt-4 font-serif text-xl">{item.name}</p><p className="mt-1 text-sm text-[#778c86]">{item.description}</p></CardContent></Card>; })}</section>
    <Card className="mt-6 rounded-2xl border-[#e0ebe6] shadow-none"><CardContent className="p-5 overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="bg-[#f4f8f6] text-[#778d87]"><tr><th className="p-3 text-left">姓名</th><th className="p-3 text-left">登录账号</th><th className="p-3 text-left">工号/职称</th><th className="p-3 text-left">角色</th><th className="p-3 text-left">状态</th></tr></thead><tbody className="divide-y divide-[#edf3f0]">{staff.data?.map(item => <tr key={item.profile.id}><td className="p-3 font-medium">{item.user.name ?? "未命名"}</td><td className="p-3 text-[#687e78]">{item.profile.username ?? "组织账户"}</td><td className="p-3 text-[#687e78]">{item.profile.employeeNo ?? "—"}{item.profile.title ? ` · ${item.profile.title}` : ""}</td><td className="p-3"><Badge variant="outline">{roleLabels[item.profile.staffRole]}</Badge></td><td className="p-3"><span className={item.profile.isActive ? "text-[#167262]" : "text-[#a45a52]"}>{item.profile.isActive ? "启用" : "停用"}</span></td></tr>)}{!staff.data?.length && <tr><td colSpan={5} className="p-12 text-center text-[#82958f]">暂无本地人员账号。Docker 部署后可先使用初始化管理员创建医生和前台账号。</td></tr>}</tbody></table></CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>新增本地人员账号</DialogTitle></DialogHeader><form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}><label className="text-sm font-medium">姓名<Input className="mt-2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label><label className="text-sm font-medium">登录账号<Input className="mt-2" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required /></label><label className="text-sm font-medium">初始密码<Input className="mt-2" type="password" minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></label><label className="text-sm font-medium">角色<Select value={form.staffRole} onValueChange={(value: "admin" | "doctor" | "frontdesk") => setForm({ ...form, staffRole: value })}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">管理员</SelectItem><SelectItem value="doctor">医生</SelectItem><SelectItem value="frontdesk">前台</SelectItem></SelectContent></Select></label><label className="text-sm font-medium">工号<Input className="mt-2" value={form.employeeNo} onChange={e => setForm({ ...form, employeeNo: e.target.value })} /></label><label className="text-sm font-medium">职称<Input className="mt-2" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>{create.error && <p className="sm:col-span-2 text-sm text-destructive">{create.error.message}</p>}<Button className="sm:col-span-2 bg-[#0e5a55] hover:bg-[#084842]" disabled={create.isPending}>创建人员账号</Button></form></DialogContent></Dialog>
  </DashboardLayout>;
}
