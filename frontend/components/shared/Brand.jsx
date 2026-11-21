import { Replace } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className, compact = false, iconOnly = false }) {
  return <div className={cn("flex items-center", compact ? "gap-2" : "gap-3", className)} aria-label={iconOnly ? "PromptReplace" : undefined}>
    <span className={cn("flex shrink-0 items-center justify-center", compact ? "size-8 rounded-lg text-foreground" : "size-10 rounded-xl bg-primary text-primary-foreground")}><Replace className={compact ? "size-[22px]" : "size-5"} strokeWidth={1.8} aria-hidden="true" /></span>
    {!iconOnly && <span className="min-w-0"><span className={cn("block font-semibold tracking-tight", compact ? "text-[13px]" : "text-base")}>PromptReplace</span>{!compact && <span className="mt-0.5 block text-xs text-muted-foreground">请求文本替换</span>}</span>}
  </div>;
}
