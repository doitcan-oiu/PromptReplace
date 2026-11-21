import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, Clock3, Copy, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatNumber, formatTime } from "./interception-utils.js";
import { useInterceptionDetail } from "./useInterceptions.js";

function PromptText({ label, value, characters, truncated, onCopy }) {
  const fieldRef = useRef(null);
  const fieldId = useId();
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2"><Label htmlFor={fieldId}>{label}</Label><span className="text-sm text-muted-foreground tabular-nums">{formatNumber(characters)} 字符</span>{truncated && <Badge variant="outline">已截断</Badge>}</div>
        <Button type="button" size="sm" variant="outline" onClick={() => onCopy(value, fieldRef.current)}><Copy className="size-4" aria-hidden="true" />{truncated ? "复制已保存部分" : "复制全文"}</Button>
      </div>
      <Textarea id={fieldId} ref={fieldRef} readOnly value={value || ""} rows={10} className="max-h-96 min-h-56 resize-y font-mono text-sm leading-6" aria-label={label} spellCheck={false} />
      {truncated && <p className="text-sm leading-6 text-muted-foreground">文本超过保存上限，仅展示和复制已保存的部分；记录哈希仍根据完整的实际转发文本计算。</p>}
    </section>
  );
}

export default function InterceptionDetailDialog({ id, active, trigger, fallbackRef, onClose, onUnauthorized, onUpdated, onDeleted }) {
  const deletedRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const record = useInterceptionDetail(id, active, onUnauthorized, onUpdated, () => { deletedRef.current = true; onDeleted(); });
  const { detail, loading, loadError, actionError, busy } = record;
  const [draft, setDraft] = useState({ note: "", baseline: "", initialized: false });
  const [confirmation, setConfirmation] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const deleteButtonRef = useRef(null);
  const confirmationFocusRef = useRef(null);
  const dirty = draft.initialized && draft.note !== draft.baseline;
  const noteLength = [...draft.note].length;
  useEffect(() => () => { activeRef.current = false; }, []);

  useEffect(() => {
    if (!detail) return;
    const note = detail.note || "";
    setDraft(current => ({ initialized: true, baseline: note, note: !current.initialized || current.note === current.baseline ? note : current.note }));
  }, [detail?.note, detail?.id]);
  useEffect(() => { if (!active) { setConfirmation(null); setFeedback(null); } }, [active]);
  useEffect(() => {
    if (!dirty) return;
    const listener = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);

  function requestClose() {
    if (busy || confirmation) return;
    if (dirty) { confirmationFocusRef.current = document.getElementById(`interception-note-${id}`); setConfirmation("discard"); }
    else onClose();
  }
  async function copyText(value, field) {
    try {
      await navigator.clipboard.writeText(value || "");
      if (activeRef.current) setFeedback({ error: false, message: "已复制文本框中的全部内容。" });
    } catch {
      if (!activeRef.current) return;
      field?.focus(); field?.select();
      setFeedback({ error: true, message: "浏览器无法自动复制，请在文本框中全选后复制。" });
    }
  }
  async function saveNote(event) {
    event.preventDefault();
    if (busy || !dirty || noteLength > 2000) return;
    const note = draft.note;
    const result = await record.save({ note }, "note");
    if (result && activeRef.current) {
      setDraft({ initialized: true, note: result.note || "", baseline: result.note || "" });
      setFeedback({ error: false, message: "备注已保存。" });
    }
  }
  async function changeStatus() {
    if (!detail || busy) return;
    const status = detail.status === "reviewed" ? "pending" : "reviewed";
    const result = await record.save({ status }, "status");
    if (result && activeRef.current) setFeedback({ error: false, message: status === "reviewed" ? "已标记为已排查。" : "已恢复为待排查。" });
  }
  const sameText = detail && !detail.originalTruncated && !detail.forwardedTruncated && detail.originalText === detail.forwardedText;

  return (
    <Dialog open={active} onOpenChange={open => !open && requestClose()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] overflow-y-auto rounded-lg sm:max-w-6xl"
        onInteractOutside={event => event.preventDefault()}
        onEscapeKeyDown={event => { if (busy || confirmation) event.preventDefault(); }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (!activeRef.current) return;
          const target = !deletedRef.current && trigger?.isConnected ? trigger : fallbackRef.current;
          target?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>提示词详情</DialogTitle>
          <DialogDescription>记录与上游 HTTP 429 相关的 system 文本，供后续排查。</DialogDescription>
        </DialogHeader>
        {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{detail ? "正在更新详情…" : "正在加载详情…"}</p>}
        {loadError && <Alert variant="destructive"><AlertTitle>详情加载失败</AlertTitle><AlertDescription className="space-y-3"><p>{loadError}</p>{detail && <p>当前显示上次成功加载的内容。</p>}<Button type="button" variant="outline" size="sm" disabled={Boolean(busy) || loading} onClick={record.retry}><RefreshCw className="size-4" aria-hidden="true" />重试</Button></AlertDescription></Alert>}
        {actionError && confirmation !== "delete" && <Alert variant="destructive"><AlertTitle>操作未完成</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert>}
        {feedback && <p role={feedback.error ? "alert" : "status"} className={cn("text-sm", feedback.error ? "text-destructive" : "text-muted-foreground")}>{feedback.message}</p>}

        {detail && <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2"><Badge variant={detail.status === "reviewed" ? "secondary" : "outline"}>{detail.status === "reviewed" ? "已排查" : "待排查"}</Badge><Badge variant="secondary">{detail.hitCount > 1 ? `重复关联 ${formatNumber(detail.hitCount)} 次` : "已保存"}</Badge></div>
            <Button type="button" variant="outline" disabled={Boolean(busy) || loading} onClick={changeStatus}>{busy === "status" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : detail.status === "reviewed" ? <Clock3 className="size-4" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}{detail.status === "reviewed" ? "恢复待排查" : "标记已排查"}</Button>
          </div>
          <dl className="grid min-w-0 gap-x-6 gap-y-4 rounded-lg border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-muted-foreground">累计关联次数</dt><dd className="mt-1 tabular-nums">{formatNumber(detail.hitCount)}</dd></div>
            <div><dt className="text-muted-foreground">首次记录</dt><dd className="mt-1 break-words tabular-nums">{formatTime(detail.firstSeenAt)}</dd></div>
            <div><dt className="text-muted-foreground">最近触发</dt><dd className="mt-1 break-words tabular-nums">{formatTime(detail.lastSeenAt)}</dd></div>
            <div><dt className="text-muted-foreground">最近模型</dt><dd className="mt-1 break-all">{detail.lastModel || "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-muted-foreground">最近请求路径</dt><dd className="mt-1 break-all font-mono">{detail.lastPath || "—"}</dd></div>
            <div className="min-w-0 sm:col-span-2 lg:col-span-3"><dt className="text-muted-foreground">完整转发文本的 SHA-256</dt><dd className="mt-1 break-all font-mono leading-6">{detail.id}</dd></div>
          </dl>
          <div className={cn("grid min-w-0 gap-5", !sameText && "lg:grid-cols-2")}>
            <PromptText label="实际转发的 system 文本" value={detail.forwardedText} characters={detail.characters} truncated={detail.forwardedTruncated} onCopy={copyText} />
            {!sameText && <PromptText label="最近一次原始 system 文本" value={detail.originalText} characters={detail.originalCharacters} truncated={detail.originalTruncated} onCopy={copyText} />}
          </div>
          {sameText && <p className="text-sm text-muted-foreground">最近一次原文与实际转发文本一致。</p>}
          <Separator />
          <form onSubmit={saveNote} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><Label htmlFor={`interception-note-${id}`}>排查备注</Label><span className={cn("text-sm tabular-nums", noteLength > 2000 ? "text-destructive" : "text-muted-foreground")}>{noteLength} / 2000</span></div>
            <Textarea id={`interception-note-${id}`} rows={3} value={draft.note} maxLength={4000} aria-invalid={noteLength > 2000} disabled={Boolean(busy) || loading} onChange={event => { setDraft(current => ({ ...current, note: event.target.value })); setFeedback(null); }} placeholder="记录你的排查结果或后续处理…" className="min-h-24 resize-y" />
            {noteLength > 2000 && <p role="alert" className="text-sm text-destructive">备注最多 2000 个字符，请精简后再保存。</p>}
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">点击“保存备注”后生效，状态修改会即时保存。</p><div className="flex flex-wrap items-center gap-2">{dirty && <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={() => setDraft(current => ({ ...current, note: current.baseline }))}>撤销修改</Button>}<Button type="submit" disabled={!dirty || noteLength > 2000 || Boolean(busy) || loading}>{busy === "note" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}保存备注</Button></div></div>
          </form>
          <Separator />
        </>}

        <DialogFooter className="flex-col gap-3 sm:flex-row sm:justify-between">
          {detail ? <Button ref={deleteButtonRef} type="button" variant="ghost" className="justify-start px-0 text-destructive hover:text-destructive" disabled={Boolean(busy) || loading} onClick={() => { record.clearActionError(); confirmationFocusRef.current = deleteButtonRef.current; setConfirmation("delete"); }}><Trash2 className="size-4" aria-hidden="true" />删除记录</Button> : <span />}
          <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={requestClose}>关闭详情</Button>
        </DialogFooter>

        <AlertDialog open={active && confirmation !== null} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}>
          <AlertDialogContent className="z-[70] max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] overflow-y-auto rounded-lg" onCloseAutoFocus={event => { event.preventDefault(); if (activeRef.current) confirmationFocusRef.current?.focus(); }}>
            <AlertDialogHeader><AlertDialogTitle>{confirmation === "delete" ? "删除这条记录？" : "放弃未保存的备注？"}</AlertDialogTitle><AlertDialogDescription>{confirmation === "delete" ? "这条提示词记录、累计次数和备注将被删除，此操作无法撤销。" : "你刚才填写的备注尚未保存。放弃后将关闭详情。"}</AlertDialogDescription></AlertDialogHeader>
            {confirmation === "delete" && actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
            <AlertDialogFooter><AlertDialogCancel disabled={Boolean(busy)}>{confirmation === "delete" ? "取消" : "继续编辑"}</AlertDialogCancel><AlertDialogAction className={cn(confirmation === "delete" && "bg-destructive text-destructive-foreground hover:bg-destructive/90")} disabled={Boolean(busy)} onClick={event => { event.preventDefault(); if (confirmation === "delete") record.remove(); else onClose(); }}>{busy === "deleting" && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}{confirmation === "delete" ? "删除记录" : "放弃并关闭"}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
