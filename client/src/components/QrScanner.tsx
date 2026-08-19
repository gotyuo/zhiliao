import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Keyboard, ScanLine, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

type QrScannerProps = {
  onResult: (payload: string) => void;
  label?: string;
  autoStart?: boolean;
};

export default function QrScanner({ onResult, label = "扫描患者二维码", autoStart = false }: QrScannerProps) {
  const id = useId().replace(/:/g, "");
  const scannerRef = useRef<{ clear: () => Promise<void> } | null>(null);
  const [active, setActive] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");

  const stop = async () => {
    try { await scannerRef.current?.clear(); } catch { /* 已释放或未初始化摄像头 */ }
    scannerRef.current = null;
    setActive(false);
  };

  const start = async () => {
    setError("");
    setActive(true);
    try {
      const { Html5QrcodeScanner } = await import("html5-qrcode");
      const scanner = new Html5QrcodeScanner(id, { fps: 10, qrbox: { width: 230, height: 230 }, rememberLastUsedCamera: true }, false);
      scannerRef.current = scanner;
      scanner.render(async value => { await stop(); onResult(value); }, () => undefined);
    } catch {
      setError("无法启用摄像头。请检查浏览器授权，或使用下方扫码枪/手动输入方式。");
      setActive(false);
    }
  };

  useEffect(() => {
    if (autoStart) void start();
    return () => { void stop(); };
    // 组件仅在挂载时按需初始化摄像头，避免重复占用设备。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="rounded-2xl border border-[#dbe7e3] bg-[#fbfdfc] p-4">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="h-9 w-9 grid place-items-center rounded-xl bg-[#e3f0eb] text-[#0f625a]"><ScanLine className="h-4 w-4" /></span><p className="font-medium text-[#204947]">{label}</p></div>{active ? <Button size="sm" variant="outline" onClick={() => void stop()}><X className="h-4 w-4" />停止</Button> : <Button size="sm" onClick={() => void start()} className="bg-[#0e5a55] hover:bg-[#084842]"><Camera className="h-4 w-4" />启用摄像头</Button>}</div>
    {active && <div id={id} className="mt-4 overflow-hidden rounded-xl [&_video]:rounded-xl [&_img]:hidden" />}
    {error && <p className="mt-3 text-sm leading-6 text-destructive">{error}</p>}
    <div className="mt-4 flex gap-2"><div className="relative flex-1"><Keyboard className="absolute h-4 w-4 left-3 top-1/2 -translate-y-1/2 text-[#78908a]" /><Input className="pl-9" value={manual} onChange={event => setManual(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && manual.trim()) onResult(manual); }} placeholder="扫码枪输入后按回车，或粘贴二维码内容" /></div><Button variant="outline" onClick={() => manual.trim() && onResult(manual)}>确认</Button></div>
  </div>;
}
