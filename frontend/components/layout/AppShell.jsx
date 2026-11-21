import { useState } from "react";
import { LoaderCircle, Menu, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SaveState } from "@/components/shared/SaveState";
import { cn } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { navigation } from "./navigation";

export function AppShell({ page, onNavigate, dirty, saved, busy, onSave, onReload, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const current = navigation.find(item => item.id === page) || navigation[0];
  const isConfigPage = page !== "interceptions";
  function navigate(id) { onNavigate(id); setMobileOpen(false); }
  return <div className="min-h-svh">
    <aside className={cn("fixed inset-y-0 left-0 z-30 hidden border-r border-sidebar-border lg:block", collapsed ? "w-16" : "w-[184px]")}><Sidebar page={page} onNavigate={onNavigate} onLogout={onLogout} busy={busy} collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} /></aside>
    <div className={cn("min-w-0", collapsed ? "lg:pl-16" : "lg:pl-[184px]")}>
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"><div className="flex h-14 items-center justify-between gap-2 px-4 sm:px-6 lg:px-7">
        <div className="flex min-w-0 items-center gap-2"><Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="size-9 shrink-0 lg:hidden" aria-label="打开导航菜单"><Menu className="size-[18px]" /></Button></SheetTrigger><SheetContent side="left" className="w-[208px] max-w-[calc(100vw-2rem)] p-0 shadow-none"><SheetTitle className="sr-only">导航菜单</SheetTitle><SheetDescription className="sr-only">选择替换规则、拦截管理或上游配置。</SheetDescription><Sidebar mobile page={page} onNavigate={navigate} onLogout={() => { setMobileOpen(false); onLogout(); }} busy={busy} /></SheetContent></Sheet><span className="truncate text-sm font-medium">{current.label}</span></div>
        <div className="flex shrink-0 items-center gap-2">{(isConfigPage || dirty) && <SaveState dirty={dirty} saved={saved} className="mr-1 hidden sm:inline-flex" />}{isConfigPage && <><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-9" disabled={busy} onClick={onReload} aria-label="重新加载配置"><RefreshCw className="size-4" /></Button></TooltipTrigger><TooltipContent>重新加载配置</TooltipContent></Tooltip><Button className="h-9 px-3 text-sm sm:px-3.5" disabled={busy || !dirty} onClick={onSave}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{busy ? "处理中" : "保存更改"}</Button></>}</div>
      </div></header>
      <main className="mx-auto w-full max-w-[1800px] min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-7"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight">{current.label}</h1><p className="mt-1.5 text-sm leading-6 text-muted-foreground">{current.description}</p></div>{(isConfigPage || dirty) && <SaveState dirty={dirty} saved={saved} className="sm:hidden" />}</div>{children}{isConfigPage && <footer className="mt-6 text-xs leading-6 text-muted-foreground">{saved?.updatedAt ? `最近保存 ${new Date(saved.updatedAt).toLocaleString("zh-CN", { hour12: false })}` : "保存配置后，新请求立即生效。"}</footer>}</main>
    </div>
  </div>;
}
