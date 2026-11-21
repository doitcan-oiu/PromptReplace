import { ChevronLeft, ChevronRight, Inbox, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatTime, pageItems } from "./interception-utils.js";

export default function InterceptionsTable({ data, loading, hasFilters, pageSize, onPageSizeChange, onPageChange, onClearFilters, onOpen }) {
  const page = Math.max(1, Math.min(data.page || 1, data.pageCount || 1));
  const pageCount = Math.max(1, data.pageCount || 1);
  const offset = (page - 1) * pageSize;
  return (
    <div className="min-w-0 space-y-4" aria-busy={loading}>
      <div className="min-w-0 overflow-hidden rounded-lg border">
        {data.items.length ? <Table className="min-w-[1020px] table-fixed">
          <colgroup><col /><col className="w-44" /><col className="w-28" /><col className="w-48" /><col className="w-28" /><col className="w-24" /></colgroup>
          <TableHeader className="bg-muted/40"><TableRow><TableHead className="pl-5">提示词摘要</TableHead><TableHead>最近模型</TableHead><TableHead className="text-right">关联次数</TableHead><TableHead>最近触发</TableHead><TableHead>状态</TableHead><TableHead className="pr-5 text-right">操作</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.items.map(item => <TableRow key={item.id}>
              <TableCell className="py-4 pl-5"><p className="line-clamp-2 break-words whitespace-pre-wrap font-mono text-sm leading-6 [overflow-wrap:anywhere]">{item.preview || "（空 system 文本）"}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{item.id.slice(0, 12)}…</span><Badge variant={item.hitCount > 1 ? "secondary" : "outline"} className="font-normal">{item.hitCount > 1 ? "重复关联" : "已保存"}</Badge>{item.forwardedTruncated && <Badge variant="outline" className="font-normal">文本已截断</Badge>}</div></TableCell>
              <TableCell className="align-middle"><p className="line-clamp-2 break-all text-sm">{item.lastModel || "—"}</p></TableCell>
              <TableCell className="text-right align-middle tabular-nums">{formatNumber(item.hitCount)}</TableCell>
              <TableCell className="align-middle text-sm text-muted-foreground tabular-nums">{formatTime(item.lastSeenAt)}</TableCell>
              <TableCell className="align-middle"><Badge variant={item.status === "reviewed" ? "secondary" : "outline"} className="font-normal">{item.status === "reviewed" ? "已排查" : "待排查"}</Badge></TableCell>
              <TableCell className="pr-4 text-right align-middle"><Button type="button" variant="ghost" size="sm" onClick={event => onOpen(item, event.currentTarget)} aria-label={`查看提示词 ${item.id.slice(0, 12)}`}>查看</Button></TableCell>
            </TableRow>)}
          </TableBody>
        </Table> : <div className="flex min-h-64 w-full flex-col items-center justify-center gap-3 px-5 py-10 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-muted">{hasFilters ? <SearchX className="size-5 text-muted-foreground" aria-hidden="true" /> : <Inbox className="size-5 text-muted-foreground" aria-hidden="true" />}</div>
          <div className="max-w-md space-y-1.5"><p className="font-medium">{hasFilters ? "没有找到匹配的记录" : "暂无拦截记录"}</p><p className="text-sm leading-6 text-muted-foreground">{hasFilters ? "试试其他关键词或排查状态。" : "上游返回 HTTP 429 时，会自动记录请求中的 system 文本。"}</p></div>
          {hasFilters && <Button type="button" variant="outline" onClick={onClearFilters}>清除筛选</Button>}
        </div>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">{data.items.length ? `第 ${offset + 1}–${offset + data.items.length} 条，共 ${formatNumber(data.total)} 条` : `共 ${formatNumber(data.total)} 条`}</p>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
          <div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">每页</span><Select value={String(pageSize)} onValueChange={onPageSizeChange} disabled={loading}><SelectTrigger className="w-20" aria-label="拦截记录每页显示条数"><SelectValue /></SelectTrigger><SelectContent>{[10, 20, 50].map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent></Select></div>
          <nav className="flex min-w-0 max-w-full flex-wrap items-center gap-1" aria-label="拦截记录分页">
            <Button type="button" variant="outline" size="icon" className="size-9" aria-label="上一页拦截记录" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft className="size-4" aria-hidden="true" /></Button>
            {pageItems(page, pageCount).map(item => typeof item === "number" ? <Button key={item} type="button" variant={item === page ? "default" : "ghost"} className="size-9 px-0 tabular-nums" aria-label={`拦截记录第 ${item} 页`} aria-current={item === page ? "page" : undefined} disabled={loading} onClick={() => onPageChange(item)}>{item}</Button> : <span key={item} className="px-1 text-sm text-muted-foreground">…</span>)}
            <Button type="button" variant="outline" size="icon" className="size-9" aria-label="下一页拦截记录" disabled={loading || page >= pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight className="size-4" aria-hidden="true" /></Button>
          </nav>
        </div>
      </div>
    </div>
  );
}
