import { useRef, useState } from "react";
import { ListFilter, Loader2, RefreshCw, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import InterceptionDetailDialog from "./InterceptionDetailDialog.jsx";
import InterceptionsTable from "./InterceptionsTable.jsx";
import { formatNumber } from "./interception-utils.js";
import { useInterceptions } from "./useInterceptions.js";

export default function InterceptionsPage({ active, onUnauthorized }) {
  const list = useInterceptions(active, onUnauthorized);
  const [selected, setSelected] = useState(null);
  const refreshRef = useRef(null);
  const loading = list.loading || list.searching;
  const summary = list.data?.summary;
  return (
    <section className="min-w-0 space-y-5" aria-label="拦截记录管理">
      <dl className="grid grid-cols-3 gap-3 border-b pb-5 sm:gap-4">
        {[['已保存提示词', summary?.unique], ['累计关联次数', summary?.hits], ['待排查', summary?.pending]].map(([label, value]) => <div key={label} className="space-y-1"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-2xl font-semibold tracking-tight tabular-nums">{formatNumber(value)}</dd></div>)}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input type="search" maxLength={500} aria-label="搜索拦截记录" className="pl-9" value={list.query} onChange={event => list.setQuery(event.target.value)} placeholder="搜索原文、转发文本、模型或备注…" /></div>
          <Select value={list.status} onValueChange={list.changeStatus}><SelectTrigger className="w-36" aria-label="按排查状态筛选"><ListFilter className="size-4 text-muted-foreground" aria-hidden="true" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="pending">待排查</SelectItem><SelectItem value="reviewed">已排查</SelectItem></SelectContent></Select>
          {(list.query || list.status !== "all") && <Button type="button" variant="ghost" onClick={list.clearFilters}>清除筛选</Button>}
        </div>
        <Button ref={refreshRef} type="button" variant="outline" disabled={loading} onClick={list.refresh}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />刷新</Button>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">同一份实际转发文本会合并记录。一条 HTTP 429 响应可关联多条 system，因此关联次数不等于请求数。</p>
      {list.error && <Alert variant="destructive"><AlertTitle>记录加载失败</AlertTitle><AlertDescription className="space-y-3"><p>{list.error}</p>{list.data && <p>当前显示上次成功加载的记录。</p>}<Button type="button" variant="outline" size="sm" disabled={loading} onClick={list.refresh}>重新加载</Button></AlertDescription></Alert>}
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{list.data ? "正在更新记录…" : "正在加载记录…"}</p>}
      {list.data && <InterceptionsTable data={list.data} loading={loading} hasFilters={list.hasFilters} pageSize={list.pageSize} onPageSizeChange={list.changePageSize} onPageChange={list.setPage} onClearFilters={list.clearFilters} onOpen={(item, trigger) => setSelected({ id: item.id, trigger })} />}
      {selected && <InterceptionDetailDialog key={selected.id} id={selected.id} active={active} trigger={selected.trigger} fallbackRef={refreshRef} onUnauthorized={onUnauthorized} onClose={() => setSelected(null)} onUpdated={list.refresh} onDeleted={() => { setSelected(null); list.refresh(); }} />}
    </section>
  );
}
