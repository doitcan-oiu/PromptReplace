import { Check, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function SaveState({ dirty, saved, className }) {
  const Icon = dirty ? Circle : Check;
  return <Badge variant="outline" className={cn("gap-1.5 whitespace-nowrap bg-card px-2.5 py-1 text-xs font-normal", dirty ? "border-amber-200 bg-amber-50 text-amber-800" : "text-muted-foreground", className)} aria-live="polite">
    <Icon className={cn("size-3.5", dirty && "fill-current stroke-0 size-1.5 mr-1")} aria-hidden="true" />
    {dirty ? "有未保存的更改" : saved?.updatedAt ? "配置已保存" : "配置尚未保存"}
  </Badge>;
}
