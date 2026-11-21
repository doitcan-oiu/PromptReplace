import { CircleAlert, CircleCheck, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StatusNotice({ notice, onDismiss }) {
  if (!notice) return null;
  const failed = notice.type === "error";
  const Icon = failed ? CircleAlert : CircleCheck;
  return <Alert variant={failed ? "destructive" : "default"} className={cn("mb-6 gap-x-3 pr-12", !failed && "border-emerald-200 bg-emerald-50/60 text-emerald-950")} role={failed ? "alert" : "status"}>
    <Icon aria-hidden="true" />
    <AlertDescription className={cn("text-sm leading-6", !failed && "text-emerald-950")}>{notice.message}</AlertDescription>
    <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-7" aria-label="关闭提示" onClick={onDismiss}><X className="size-4" /></Button>
  </Alert>;
}
