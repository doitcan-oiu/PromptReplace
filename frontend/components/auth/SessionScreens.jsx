import { CircleAlert, LoaderCircle, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brand } from "@/components/shared/Brand";

export function LoadingScreen() {
  return <main className="flex min-h-svh flex-col items-center justify-center gap-7 px-4" role="status"><Brand /><div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在读取配置</div></main>;
}

export function LoadErrorScreen({ message, authenticated, busy, onReload, onLogout }) {
  return <main className="flex min-h-svh items-center justify-center px-4 py-12"><div className="w-full max-w-md"><Brand className="mb-8 justify-center" /><Card className="rounded-2xl shadow-sm"><CardContent className="space-y-5 pt-7"><CircleAlert className="size-7 text-muted-foreground" aria-hidden="true" /><div><h1 className="text-xl font-semibold">暂时无法加载配置</h1><p className="mt-2 break-words text-sm leading-7 text-muted-foreground" role="alert">{message}</p></div><div className="flex flex-wrap gap-2"><Button onClick={onReload} disabled={busy}><RefreshCw className="size-4" />重新加载</Button>{authenticated && <Button variant="outline" onClick={onLogout} disabled={busy}><LogOut className="size-4" />退出登录</Button>}</div></CardContent></Card></div></main>;
}
