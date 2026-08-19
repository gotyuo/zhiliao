import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  BarChart3, CalendarDays, ChevronRight, DatabaseBackup, FileSpreadsheet, LayoutDashboard,
  LogOut, Menu, MonitorUp, ScanLine, ShieldCheck, Stethoscope, Users, X,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

type StaffRole = "admin" | "doctor" | "frontdesk";

const allNavigation = [
  { label: "运营总览", path: "/", icon: LayoutDashboard, roles: ["admin", "doctor", "frontdesk"] },
  { label: "患者管理", path: "/patients", icon: Users, roles: ["admin", "doctor", "frontdesk"] },
  { label: "治疗排班", path: "/schedules", icon: CalendarDays, roles: ["admin", "doctor", "frontdesk"] },
  { label: "PDA治疗核销", path: "/pda", icon: ScanLine, roles: ["admin", "doctor"] },
  { label: "候诊大屏", path: "/board", icon: MonitorUp, roles: ["admin", "doctor", "frontdesk"] },
  { label: "历史统计", path: "/analytics", icon: BarChart3, roles: ["admin", "doctor"] },
  { label: "Excel数据", path: "/data", icon: FileSpreadsheet, roles: ["admin"] },
  { label: "备份管理", path: "/backups", icon: DatabaseBackup, roles: ["admin"] },
  { label: "人员与权限", path: "/staff", icon: ShieldCheck, roles: ["admin"] },
] as const;

function LocalLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.localLogin.useMutation({ onSuccess: () => window.location.reload() });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ username, password });
  };
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.2fr_0.8fr] bg-[#f6f8f8]">
      <section className="relative overflow-hidden bg-[#0e3b3b] px-8 py-10 lg:px-16 flex flex-col justify-between text-white">
        <div className="absolute inset-0 opacity-80 clinic-grid" />
        <div className="relative flex items-center gap-3 text-sm tracking-[0.2em] text-[#b7d6ce]"><span className="h-8 w-8 rounded-xl bg-[#c9a45c] flex items-center justify-center"><Stethoscope className="h-4 w-4 text-[#173d3d]" /></span>PAIN CARE OS</div>
        <div className="relative max-w-xl">
          <p className="text-[#c9a45c] tracking-[0.16em] text-xs mb-5">PATIENT TREATMENT MANAGEMENT</p>
          <h1 className="text-4xl lg:text-6xl font-serif leading-[1.08]">让每一次治疗，都有清晰而从容的秩序。</h1>
          <p className="mt-8 text-[#b7d6ce] max-w-md leading-7">疼痛门诊患者治疗系统，将报到、排班、治疗核销与运营洞察纳入同一处专业工作台。</p>
        </div>
        <p className="relative text-xs text-[#8fb6ad]">医疗数据仅限经授权人员访问 · 请妥善保管登录凭证</p>
      </section>
      <section className="flex items-center justify-center p-6 lg:p-12">
        <form onSubmit={submit} className="w-full max-w-md rounded-[2rem] bg-white p-8 lg:p-10 shadow-[0_24px_80px_rgba(20,55,55,0.12)] border border-[#e7eeeb]">
          <p className="text-[#b48a42] text-xs tracking-[0.18em] font-semibold">WELCOME BACK</p>
          <h2 className="mt-3 text-3xl text-[#193b3b] font-serif">进入治疗工作台</h2>
          <p className="mt-3 text-sm text-[#6a7c7b] leading-6">使用本地部署账号登录，或通过组织账户进行安全登录。</p>
          <div className="mt-8 space-y-4">
            <label className="block text-sm font-medium text-[#315755]">账号<Input className="mt-2 h-12 rounded-xl" value={username} onChange={event => setUsername(event.target.value)} placeholder="请输入账号" autoComplete="username" /></label>
            <label className="block text-sm font-medium text-[#315755]">密码<Input className="mt-2 h-12 rounded-xl" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="请输入密码" autoComplete="current-password" /></label>
            {login.error && <p className="text-sm text-destructive">{login.error.message}</p>}
            <Button className="h-12 w-full rounded-xl bg-[#0e5a55] hover:bg-[#084842]" disabled={login.isPending}>{login.isPending ? "正在验证…" : "安全登录"}<ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="relative my-7 h-px bg-[#e7eeeb]"><span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-white px-3 text-xs text-muted-foreground">或</span></div>
          <Button type="button" variant="outline" onClick={() => startLogin()} className="h-11 w-full rounded-xl border-[#b9cfca] text-[#0e5a55]">使用组织账户登录</Button>
        </form>
      </section>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const session = trpc.clinic.session.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const role = (session.data?.profile.staffRole ?? (user?.role === "admin" ? "admin" : "frontdesk")) as StaffRole;
  const navigation = useMemo(() => allNavigation.filter(item => (item.roles as readonly StaffRole[]).includes(role)), [role]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (loading) return <div className="min-h-screen bg-[#f6f8f8]" />;
  if (!user) return <LocalLogin />;
  const side = (
    <aside className="w-[270px] h-full bg-[#103f3e] text-white flex flex-col shadow-2xl">
      <div className="p-7 pb-6 border-b border-white/10">
        <div className="flex items-center gap-3"><span className="h-10 w-10 rounded-2xl bg-[#cba45d] flex items-center justify-center"><Stethoscope className="h-5 w-5 text-[#103f3e]" /></span><div><p className="font-serif text-lg leading-none">疼痛门诊</p><p className="mt-1 text-[10px] tracking-[0.18em] text-[#a9cbc3]">TREATMENT SYSTEM</p></div></div>
      </div>
      <nav className="p-4 space-y-1 flex-1">
        <p className="px-3 pt-2 pb-3 text-[10px] tracking-[0.16em] text-[#80aaa1]">CLINICAL WORKSPACE</p>
        {navigation.map(item => {
          const active = item.path === "/" ? location === "/" : location.startsWith(item.path);
          return <button key={item.path} onClick={() => { setLocation(item.path); setMobileOpen(false); }} className={`w-full h-11 px-3 rounded-xl flex items-center gap-3 text-sm transition-all ${active ? "bg-[#e9f1ed] text-[#174644] shadow-sm" : "text-[#d3e4df] hover:bg-white/10"}`}><item.icon className="h-4 w-4" /><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#c39a51]" />}</button>;
        })}
      </nav>
      <div className="m-4 rounded-2xl bg-white/8 p-3"><div className="flex items-center gap-3"><Avatar className="h-9 w-9"><AvatarFallback className="bg-[#cba45d] text-[#174644]">{user.name?.slice(0, 1) ?? "用"}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="text-sm truncate">{user.name ?? "未命名用户"}</p><p className="text-xs text-[#9ec1b8] mt-0.5">{role === "admin" ? "管理员" : role === "doctor" ? "医生" : "前台"}</p></div><button onClick={logout} className="text-[#a9cbc3] hover:text-white" title="退出登录"><LogOut className="h-4 w-4" /></button></div></div>
    </aside>
  );
  return <div className="min-h-screen bg-[#f4f7f6] text-[#183d3c] flex">
    <div className="hidden lg:block fixed inset-y-0 left-0 z-30">{side}</div>
    {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><div className="absolute inset-0 bg-[#082c2c]/50" onClick={() => setMobileOpen(false)} /><div className="relative h-full">{side}<button onClick={() => setMobileOpen(false)} className="absolute top-5 left-[285px] text-white"><X /></button></div></div>}
    <main className="lg:ml-[270px] flex-1 min-w-0"><header className="h-[72px] px-5 lg:px-9 flex items-center justify-between border-b border-[#e0e9e5] bg-[#f9fbfa]/85 backdrop-blur sticky top-0 z-20"><div className="flex items-center gap-3"><button className="lg:hidden p-2 rounded-xl border border-[#d6e4df]" onClick={() => setMobileOpen(true)}><Menu className="h-4 w-4" /></button><div><p className="text-sm font-medium">{navigation.find(item => item.path === (location === "/" ? "/" : `/${location.split("/")[1]}`))?.label ?? "治疗工作台"}</p><p className="text-xs text-[#788d88] mt-0.5">{clock.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}</p></div></div><div className="hidden sm:flex items-center gap-3 text-xs text-[#6c827d]"><span className="h-2 w-2 rounded-full bg-[#44a27f]" />系统运行正常<span className="h-5 w-px bg-[#d7e4df]" />{clock.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</div></header><div className="p-5 lg:p-9">{children}</div></main>
  </div>;
}
