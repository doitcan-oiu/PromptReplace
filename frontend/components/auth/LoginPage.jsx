import { useState } from "react";
import { CircleAlert, LoaderCircle, LogIn, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/shared/Brand";

export function LoginPage({ configured, authNotice, onLogin, onReload }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onLogin(password); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <main className="flex min-h-svh items-center justify-center px-4 py-12 sm:px-6"><div className="w-full max-w-[440px]">
    <Brand className="mb-9 justify-center" />
    <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-sm">
      <CardHeader className="px-7 pb-6 pt-8 sm:px-8"><CardTitle className="text-2xl font-semibold tracking-tight">登录管理控制台</CardTitle><CardDescription className="mt-1 text-sm leading-6">管理替换规则与上游接口配置。</CardDescription></CardHeader>
      <CardContent className="px-7 pb-8 sm:px-8">
        {authNotice && <Alert className="mb-5"><CircleAlert aria-hidden="true" /><AlertDescription>{authNotice}</AlertDescription></Alert>}
        {!configured ? <div className="space-y-5"><Alert><CircleAlert aria-hidden="true" /><AlertDescription className="text-sm leading-7">尚未配置管理密码。请在 Worker 环境中设置 <code className="rounded bg-muted px-1 py-0.5 text-xs">ADMIN_PASSWORD</code>，然后重新加载。</AlertDescription></Alert><Button variant="outline" onClick={onReload} className="h-11 w-full"><RefreshCw className="size-4" />重新加载</Button></div> : <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2.5"><Label htmlFor="admin-password">管理密码</Label><Input id="admin-password" type="password" autoComplete="current-password" required autoFocus disabled={busy} className="h-11" value={password} onChange={event => { setPassword(event.target.value); setError(""); }} placeholder="请输入管理密码" /></div>
          {error && <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertDescription className="text-sm leading-6">{error}</AlertDescription></Alert>}
          <Button type="submit" disabled={busy} className="h-11 w-full">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}{busy ? "正在登录" : "登录控制台"}</Button>
        </form>}
      </CardContent>
      <CardFooter className="justify-center border-t bg-muted/30 px-6 py-4"><p className="text-xs leading-6 text-muted-foreground">登录状态仅用于管理配置</p></CardFooter>
    </Card>
  </div></main>;
}
