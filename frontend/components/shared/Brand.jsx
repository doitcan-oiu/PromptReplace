import { Replace } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className }) {
  return <div className={cn("flex items-center gap-3", className)}>
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Replace className="size-5" strokeWidth={1.8} aria-hidden="true" /></span>
    <span className="min-w-0"><span className="block text-base font-semibold tracking-tight">PromptReplace</span><span className="mt-0.5 block text-xs text-muted-foreground">请求文本替换</span></span>
  </div>;
}
