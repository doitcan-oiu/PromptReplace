import { useState } from "react";
import { LoaderCircle, Menu, RefreshCw, Save } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SaveState } from "@/components/shared/SaveState";
import { Sidebar } from "./Sidebar";
import { navigation } from "./navigation";

export function AppShell({ page, onNavigate, dirty, saved, busy, onSave, onReload, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = navigation.find(item => item.id === page) || navigation[0];
  function navigate(id) { onNavigate(id); setMobileOpen(false); }
  return <div className="min-h-svh">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-sidebar-border lg:block"><Sidebar page={page} onNavigate={onNavigate} onLogout={onLogout} busy={busy} /></aside>
    <div className="min-w-0 lg:pl-60">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"><div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3"><Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetTrigger asChild><Button variant="outline" size="icon" className="size-10 shrink-0 lg:hidden" aria-label="打开导航菜单"><Menu className="size-4" /></Button></SheetTrigger><SheetContent side="left" className="w-72 max-w-[calc(100vw-2rem)] p-0"><SheetTitle className="sr-only">导航菜单</SheetTitle><SheetDescription className="sr-only">选择替换规则、上游配置或替换预览。</SheetDescription><Sidebar page={page} onNavigate={navigate} onLogout={() => { setMobileOpen(false); onLogout(); }} busy={busy} /></SheetContent></Sheet><Breadcrumb className="hidden sm:block"><BreadcrumbList className="text-sm"><BreadcrumbItem>工作空间</BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{current.label}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb></div>
        <div className="flex shrink-0 items-center gap-2.5"><SaveState dirty={dirty} saved={saved} className="mr-1 hidden sm:inline-flex" /><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="size-10" disabled={busy} onClick={onReload} aria-label="重新加载配置"><RefreshCw className="size-4" /></Button></TooltipTrigger><TooltipContent>重新加载配置</TooltipContent></Tooltip><Button className="h-10 px-3.5 sm:px-4" disabled={busy || !dirty} onClick={onSave}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{busy ? "处理中" : "保存更改"}</Button></div>
      </div></header>
      <main className="mx-auto w-full max-w-[1800px] min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"><div className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 hidden text-xs font-medium tracking-wide text-muted-foreground lg:block">管理控制台</p><h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{current.label}</h1><p className="mt-2 text-sm leading-7 text-muted-foreground sm:text-base">{current.description}</p></div><SaveState dirty={dirty} saved={saved} className="sm:hidden" /></div>{children}<footer className="mt-7 text-xs leading-6 text-muted-foreground">{saved?.updatedAt ? `最近保存 ${new Date(saved.updatedAt).toLocaleString("zh-CN", { hour12: false })}` : "保存配置后，新请求立即生效。"}</footer></main>
    </div>
  </div>;
}
