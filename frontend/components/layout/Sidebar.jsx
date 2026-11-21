import { LogOut, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Brand } from "@/components/shared/Brand";
import { navigation } from "./navigation";

export function Sidebar({ page, onNavigate, onLogout, busy }) {
  return <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
    <div className="px-5 pb-6 pt-6"><Brand /></div><Separator />
    <div className="flex-1 px-3 py-6"><p className="mb-3 px-3 text-xs font-medium text-muted-foreground">工作空间</p><nav aria-label="主导航" className="space-y-1.5">{navigation.map(item => <Button key={item.id} variant={page === item.id ? "secondary" : "ghost"} className={`h-11 w-full justify-start gap-3 rounded-lg px-3 text-sm ${page === item.id ? "font-medium text-foreground" : "font-normal text-muted-foreground"}`} onClick={() => onNavigate(item.id)} aria-current={page === item.id ? "page" : undefined}><item.icon className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />{item.label}</Button>)}</nav></div>
    <div className="px-4 pb-4"><div className="mb-4 flex items-start gap-3 rounded-lg bg-muted/50 p-3.5"><SlidersHorizontal className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.7} aria-hidden="true" /><div><p className="text-sm font-medium">按顺序替换</p><p className="mt-1 text-xs leading-5 text-muted-foreground">编辑完成后保存，新请求立即生效。</p></div></div><Separator className="mb-3" /><Button variant="ghost" className="h-10 w-full justify-start gap-3 text-sm font-normal text-muted-foreground" disabled={busy} onClick={onLogout}><LogOut className="size-4" aria-hidden="true" />退出登录</Button></div>
  </div>;
}
