import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Brand } from "@/components/shared/Brand";
import { cn } from "@/lib/utils";
import { navigation } from "./navigation";

function NavTooltip({ label, collapsed, children }) {
  if (!collapsed) return children;
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side="right" sideOffset={12}>{label}</TooltipContent></Tooltip>;
}

export function Sidebar({ page, onNavigate, onLogout, busy, collapsed = false, onToggle, mobile = false }) {
  const compact = collapsed && !mobile;
  const toggleLabel = compact ? "展开侧栏" : "收起侧栏";
  const ToggleIcon = compact ? PanelLeftOpen : PanelLeftClose;
  return <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
    <div className={cn("flex h-14 shrink-0 items-center", compact ? "justify-center" : "px-3", mobile && "pr-9")}><Brand compact iconOnly={compact} /></div>
    {!mobile && <div className="px-2 pb-3"><NavTooltip label={toggleLabel} collapsed={compact}><Button variant="ghost" className={cn("h-9 w-full rounded-lg px-3 text-sm font-normal text-muted-foreground hover:bg-sidebar-accent", compact ? "justify-center px-0" : "justify-start gap-2.5")} onClick={onToggle} aria-label={toggleLabel} aria-expanded={!compact} aria-controls="desktop-navigation"><ToggleIcon className="size-[18px] shrink-0" strokeWidth={1.7} aria-hidden="true" />{!compact && <span>{toggleLabel}</span>}</Button></NavTooltip></div>}
    <nav id={mobile ? "mobile-navigation" : "desktop-navigation"} aria-label="主导航" className={cn("flex-1 space-y-1 px-2", mobile && "pt-3")}>{navigation.map(item => <NavTooltip key={item.id} label={item.label} collapsed={compact}><Button variant="ghost" className={cn("h-10 w-full rounded-lg text-sm hover:bg-sidebar-accent", compact ? "justify-center px-0" : "justify-start gap-2.5 px-3", page === item.id ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "font-normal text-muted-foreground")} onClick={() => onNavigate(item.id)} aria-label={item.label} aria-current={page === item.id ? "page" : undefined}><item.icon className="size-[18px] shrink-0" strokeWidth={1.7} aria-hidden="true" />{!compact && <span>{item.label}</span>}</Button></NavTooltip>)}</nav>
    <div className="p-2 pb-4"><NavTooltip label="退出登录" collapsed={compact}><Button variant="ghost" className={cn("h-10 w-full rounded-lg text-sm font-normal text-muted-foreground hover:bg-sidebar-accent", compact ? "justify-center px-0" : "justify-start gap-2.5 px-3")} disabled={busy} onClick={onLogout} aria-label="退出登录"><LogOut className="size-[18px] shrink-0" strokeWidth={1.7} aria-hidden="true" />{!compact && <span>退出登录</span>}</Button></NavTooltip></div>
  </div>;
}
