import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export default function RuleDialog({ rule, isNew, disabled, trigger, fallbackRef, onClose, onApply }) {
  const [value, setValue] = useState(() => ({ ...rule }));
  const [error, setError] = useState("");
  const fromRef = useRef(null);
  const fieldId = useId();

  function submit(event) {
    event.preventDefault();
    if (!value.from) {
      setError("请填写需要匹配的原文。");
      fromRef.current?.focus();
      return;
    }
    onApply(value);
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] overflow-y-auto rounded-lg sm:max-w-2xl"
        onInteractOutside={event => event.preventDefault()}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const target = trigger?.isConnected ? trigger : fallbackRef.current;
          target?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{isNew ? "添加替换规则" : "编辑替换规则"}</DialogTitle>
          <DialogDescription>精确匹配原文，按规则顺序替换为指定内容。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label htmlFor={`${fieldId}-from`}>查找原文</Label>
              <span className="text-sm text-muted-foreground">必填 · 区分大小写</span>
            </div>
            <Textarea
              id={`${fieldId}-from`}
              ref={fromRef}
              autoFocus
              rows={5}
              className="min-h-36 font-mono text-sm leading-6"
              spellCheck={false}
              value={value.from}
              disabled={disabled}
              onChange={event => { setValue(current => ({ ...current, from: event.target.value })); setError(""); }}
              placeholder="输入需要替换的完整文字"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${fieldId}-error` : undefined}
            />
            {error && <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label htmlFor={`${fieldId}-to`}>替换内容</Label>
              <span className="text-sm text-muted-foreground">留空表示删除匹配文字</span>
            </div>
            <Textarea
              id={`${fieldId}-to`}
              rows={5}
              className="min-h-36 font-mono text-sm leading-6"
              spellCheck={false}
              value={value.to}
              disabled={disabled}
              onChange={event => setValue(current => ({ ...current, to: event.target.value }))}
              placeholder="输入替换后的文字"
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-enabled`}>启用这条规则</Label>
              <p className="text-sm text-muted-foreground">停用后，将跳过这条规则。</p>
            </div>
            <Switch id={`${fieldId}-enabled`} checked={value.enabled} disabled={disabled} onCheckedChange={enabled => setValue(current => ({ ...current, enabled }))} />
          </div>
          <DialogFooter className="gap-3 sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">保存页面更改后生效。</p>
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
              <Button type="submit" disabled={disabled}>{isNew ? "添加到列表" : "应用修改"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
