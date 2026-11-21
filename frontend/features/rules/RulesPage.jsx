import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ListFilter, MoreHorizontal, Pencil, Plus, Search, SearchX, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import RuleDialog from "./RuleDialog.jsx";
import { getPaginationItems, getRulePage } from "./rules-model.js";

function MoveButton({ label, disabled, onClick, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 text-muted-foreground" disabled={disabled} onClick={onClick} aria-label={label}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function RulesPage({ rules, disabled, onChange, onCommit, onMove, onDelete }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const addButtonRef = useRef(null);
  const openingDialogRef = useRef(false);
  const hasFilters = query !== "" || status !== "all";
  const { filtered, visible, enabledCount, pageCount, currentPage, offset } = useMemo(() =>
    getRulePage(rules, { query, status, page, pageSize }), [rules, query, status, page, pageSize]);

  useEffect(() => { setPage(value => Math.min(value, pageCount)); }, [pageCount]);

  function resetFilters() {
    setQuery(""); setStatus("all"); setPage(1);
  }
  function addRule(event) {
    setEditor({ isNew: true, trigger: event.currentTarget, rule: { id: crypto.randomUUID(), from: "", to: "", enabled: true } });
  }
  function editRule(rule) {
    openingDialogRef.current = true;
    setEditor({ isNew: false, trigger: document.getElementById(`rule-actions-${rule.id}`), rule: { ...rule } });
  }
  function applyRule(rule) {
    onCommit(rule);
    if (editor.isNew) {
      setQuery(""); setStatus("all");
      setPage(Math.ceil((rules.length + 1) / pageSize));
    }
    setEditor(null);
  }

  return (
    <section aria-label="替换规则列表" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="search" aria-label="搜索规则" className="pl-9" placeholder="搜索原文或替换内容…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />
          </div>
          <Select value={status} onValueChange={value => { setStatus(value); setPage(1); }}>
            <SelectTrigger className="w-36" aria-label="按规则状态筛选"><ListFilter className="size-4 text-muted-foreground" aria-hidden="true" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="enabled">已启用</SelectItem><SelectItem value="disabled">已停用</SelectItem></SelectContent>
          </Select>
          {hasFilters && <Button type="button" variant="ghost" onClick={resetFilters}>清除筛选</Button>}
        </div>
        <Button ref={addButtonRef} type="button" disabled={disabled} onClick={addRule}><Plus className="size-4" aria-hidden="true" />添加规则</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>共 <span className="font-medium text-foreground tabular-nums">{rules.length}</span> 条规则</span>
        <span aria-hidden="true">·</span><span><span className="font-medium text-foreground tabular-nums">{enabledCount}</span> 条已启用</span>
        {hasFilters && <Badge variant="secondary" className="font-normal">{filtered.length} 条匹配</Badge>}
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border">
        {visible.length > 0 ? <Table className="min-w-[920px] table-fixed">
          <colgroup><col className="w-20" /><col className="w-32" /><col /><col /><col className="w-40" /></colgroup>
          <TableHeader className="bg-muted/40">
            <TableRow><TableHead className="pl-5">顺序</TableHead><TableHead>状态</TableHead><TableHead>查找原文</TableHead><TableHead>替换内容</TableHead><TableHead className="pr-5 text-right">操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(({ rule, index }) => (
              <TableRow key={rule.id} className={cn(!rule.enabled && "bg-muted/20")}>
                <TableCell className="py-5 pl-5 align-middle text-sm text-muted-foreground tabular-nums">{String(index + 1).padStart(2, "0")}</TableCell>
                <TableCell className="align-middle">
                  <div className="flex items-center gap-2.5"><Switch checked={rule.enabled} disabled={disabled} aria-label={`启用规则 ${index + 1}`} onCheckedChange={enabled => onChange(rule.id, { enabled })} /><span className="text-sm text-muted-foreground">{rule.enabled ? "启用" : "停用"}</span></div>
                </TableCell>
                <TableCell className="py-5 align-middle"><p className={cn("line-clamp-2 break-words whitespace-pre-wrap font-mono text-sm leading-6 [overflow-wrap:anywhere]", !rule.enabled && "text-muted-foreground")}>{rule.from}</p></TableCell>
                <TableCell className="py-5 align-middle">{rule.to ? <p className={cn("line-clamp-2 break-words whitespace-pre-wrap text-base leading-6 [overflow-wrap:anywhere]", !rule.enabled && "text-muted-foreground")}>{rule.to}</p> : <span className="text-sm text-muted-foreground">删除匹配内容</span>}</TableCell>
                <TableCell className="pr-4 align-middle">
                  <div className="flex items-center justify-end gap-0.5">
                    <MoveButton label={`上移规则 ${index + 1}`} disabled={disabled || index === 0} onClick={() => onMove(index, -1)}><ArrowUp className="size-4" aria-hidden="true" /></MoveButton>
                    <MoveButton label={`下移规则 ${index + 1}`} disabled={disabled || index === rules.length - 1} onClick={() => onMove(index, 1)}><ArrowDown className="size-4" aria-hidden="true" /></MoveButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button id={`rule-actions-${rule.id}`} type="button" variant="ghost" size="icon" className="size-9 shrink-0" disabled={disabled} aria-label={`规则 ${index + 1} 的更多操作`}><MoreHorizontal className="size-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (openingDialogRef.current) { event.preventDefault(); openingDialogRef.current = false; } }}>
                        <DropdownMenuItem onSelect={() => editRule(rule)}><Pencil className="size-4" aria-hidden="true" />编辑规则</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => { openingDialogRef.current = true; onDelete(rule.id); }}><Trash2 className="size-4" aria-hidden="true" />删除规则</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table> : (
          <div className="flex min-h-64 w-full flex-col items-center justify-center gap-3 px-5 py-10 text-center">
            <div className="flex size-11 items-center justify-center rounded-lg bg-muted"><SearchX className="size-5 text-muted-foreground" aria-hidden="true" /></div>
            <div className="max-w-sm space-y-1.5"><p className="text-base font-medium">{rules.length ? "没有找到匹配的规则" : "还没有替换规则"}</p><p className="text-sm leading-6 text-muted-foreground">{rules.length ? "试试其他关键词或规则状态。" : "添加第一条规则，填写需要查找和替换的文字。"}</p></div>
            {rules.length ? <Button type="button" variant="outline" onClick={resetFilters}>清除筛选</Button> : <Button type="button" variant="outline" disabled={disabled} onClick={addRule}><Plus className="size-4" aria-hidden="true" />添加规则</Button>}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 pt-1">
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">{filtered.length ? `第 ${offset + 1}–${offset + visible.length} 条，共 ${filtered.length} 条` : "共 0 条"}</p>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
          <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">每页</span><Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); setPage(1); }}><SelectTrigger className="w-20" aria-label="每页显示条数"><SelectValue /></SelectTrigger><SelectContent>{[10, 20, 50].map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent></Select></div>
          <nav aria-label="规则分页" className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="size-9" aria-label="上一页" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="size-4" aria-hidden="true" /></Button>
            {getPaginationItems(currentPage, pageCount).map(item => typeof item === "number"
              ? <Button key={item} type="button" variant={item === currentPage ? "default" : "ghost"} className="size-9 px-0 tabular-nums" aria-label={`第 ${item} 页`} aria-current={item === currentPage ? "page" : undefined} onClick={() => setPage(item)}>{item}</Button>
              : <span key={item} className="px-1 text-sm text-muted-foreground">…</span>)}
            <Button type="button" variant="outline" size="icon" className="size-9" aria-label="下一页" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight className="size-4" aria-hidden="true" /></Button>
          </nav>
        </div>
      </div>
      {editor && <RuleDialog key={editor.rule.id} rule={editor.rule} isNew={editor.isNew} disabled={disabled} trigger={editor.trigger} fallbackRef={addButtonRef} onClose={() => setEditor(null)} onApply={applyRule} />}
    </section>
  );
}
