import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Switch } from "radix-ui";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, Plus, Search, Trash2, X } from "lucide-react";

function pageNumbers(current, total) {
  const pages = [...new Set([1, total, current - 1, current, current + 1])]
    .filter(page => page >= 1 && page <= total)
    .sort((left, right) => left - right);
  return pages.flatMap((page, index) => index > 0 && page - pages[index - 1] > 1
    ? [`gap-${page}`, page]
    : [page]);
}

function RuleDialog({ rule, isNew, trigger, fallbackRef, onClose, onApply }) {
  const [value, setValue] = useState(() => ({ ...rule }));
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    if (!value.from) {
      setError("请填写需要匹配的原文。");
      document.getElementById("rule-from")?.focus();
      return;
    }
    onApply(value);
  }

  return (
    <Dialog.Root open onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[3px]" />
        <Dialog.Content className="dialog-panel max-w-2xl" onInteractOutside={event => event.preventDefault()} onCloseAutoFocus={event => {
          event.preventDefault();
          const target = trigger?.isConnected ? trigger : fallbackRef.current;
          target?.focus();
        }}>
          <div className="border-b border-slate-100 px-6 py-5 sm:px-7">
            <Dialog.Title className="pr-8 text-xl font-semibold tracking-tight text-slate-900">{isNew ? "添加替换规则" : "编辑替换规则"}</Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm leading-6 text-slate-500">规则按列表顺序执行，替换内容留空表示删除匹配文字。</Dialog.Description>
            <Dialog.Close className="icon-button absolute top-4 right-4" aria-label="关闭规则弹窗"><X size={18} /></Dialog.Close>
          </div>
          <form onSubmit={submit}>
            <div className="space-y-5 px-6 py-6 sm:px-7">
              <div>
                <label className="field-label" htmlFor="rule-from">查找原文</label>
                <textarea id="rule-from" autoFocus rows={4} className="field min-h-28 font-mono text-sm" spellCheck={false} value={value.from} onChange={event => { setValue(current => ({ ...current, from: event.target.value })); setError(""); }} placeholder="输入需要替换的文字" aria-invalid={Boolean(error)} aria-describedby={error ? "rule-error" : undefined} />
                {error && <p id="rule-error" role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
              </div>
              <div>
                <label className="field-label" htmlFor="rule-to">替换内容</label>
                <textarea id="rule-to" rows={4} className="field min-h-28 font-mono text-sm" spellCheck={false} value={value.to} onChange={event => setValue(current => ({ ...current, to: event.target.value }))} placeholder="输入替换后的文字，留空则删除" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3.5">
                <label htmlFor="rule-enabled" className="cursor-pointer text-sm font-medium text-slate-700">启用这条规则</label>
                <Switch.Root id="rule-enabled" className="switch-root" checked={value.enabled} onCheckedChange={enabled => setValue(current => ({ ...current, enabled }))}><Switch.Thumb className="switch-thumb" /></Switch.Root>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:px-7">
              <p className="text-sm text-slate-500">加入列表后，点击页面的“保存更改”生效。</p>
              <div className="ml-auto flex gap-2">
                <Dialog.Close className="btn btn-secondary">取消</Dialog.Close>
                <button className="btn btn-primary" type="submit">{isNew ? "添加到列表" : "应用修改"}</button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function RulesTable({ rules, disabled, onChange, onCommit, onMove, onDelete }) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const addButtonRef = useRef(null);
  const enabledCount = rules.filter(rule => rule.enabled).length;
  const filtered = useMemo(() => {
    const needle = query.toLocaleLowerCase();
    return rules.map((rule, index) => ({ rule, index })).filter(({ rule }) =>
      rule.from.toLocaleLowerCase().includes(needle) || rule.to.toLocaleLowerCase().includes(needle));
  }, [rules, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * pageSize;
  const visible = filtered.slice(offset, offset + pageSize);

  useEffect(() => { setPage(value => Math.min(value, pageCount)); }, [pageCount]);

  function addRule(event) {
    setEditor({ isNew: true, trigger: event.currentTarget, rule: { id: crypto.randomUUID(), from: "", to: "", enabled: true } });
  }
  function applyRule(rule) {
    onCommit(rule);
    if (editor.isNew) {
      setQuery("");
      setPage(Math.ceil((rules.length + 1) / pageSize));
    }
    setEditor(null);
  }

  return (
    <section aria-label="替换规则列表" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-500"><span className="font-semibold text-slate-900">{rules.length}</span> 条规则<span className="mx-2 text-slate-300">/</span><span className="font-medium text-slate-700">{enabledCount}</span> 条已启用</p>
        <button ref={addButtonRef} type="button" className="btn btn-primary" disabled={disabled} onClick={addRule}><Plus size={17} />添加规则</button>
      </div>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={17} />
            <input aria-label="搜索规则" className="field py-2 pl-9 pr-9 text-sm" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="搜索查找原文或替换内容" />
            {query && <button type="button" aria-label="清空搜索" className="icon-button absolute top-1/2 right-1 -translate-y-1/2" onClick={() => { setQuery(""); setPage(1); }}><X size={15} /></button>}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <label htmlFor="rules-page-size">每页</label>
            <div className="relative">
              <select id="rules-page-size" className="field appearance-none py-2 pr-9 text-sm" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
                {[10, 20, 50].map(size => <option key={size} value={size}>{size} 条</option>)}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>
        <div className="table-scroll">
          <table className="rule-table w-full min-w-[860px] table-fixed text-left">
            <colgroup><col className="w-16" /><col className="w-32" /><col /><col /><col className="w-44" /></colgroup>
            <thead><tr><th scope="col">顺序</th><th scope="col">状态</th><th scope="col">查找原文</th><th scope="col">替换内容</th><th scope="col" className="text-right">操作</th></tr></thead>
            <tbody>
              {visible.map(({ rule, index }) => (
                <tr key={rule.id} className={rule.enabled ? "" : "bg-slate-50/50"}>
                  <td className="text-sm tabular-nums text-slate-400">{index + 1}</td>
                  <td><div className="flex items-center gap-2"><Switch.Root className="switch-root" checked={rule.enabled} disabled={disabled} aria-label={`启用规则 ${index + 1}`} onCheckedChange={enabled => onChange(rule.id, { enabled })}><Switch.Thumb className="switch-thumb" /></Switch.Root><span className={`text-sm ${rule.enabled ? "text-slate-700" : "text-slate-400"}`}>{rule.enabled ? "启用" : "停用"}</span></div></td>
                  <td><p title={rule.from} className={`line-clamp-2 break-all whitespace-pre-wrap font-mono text-sm leading-6 ${rule.enabled ? "text-slate-800" : "text-slate-400"}`}>{rule.from}</p></td>
                  <td>{rule.to ? <p title={rule.to} className={`line-clamp-2 break-all whitespace-pre-wrap font-mono text-sm leading-6 ${rule.enabled ? "text-slate-600" : "text-slate-400"}`}>{rule.to}</p> : <span className="text-sm italic text-slate-400">删除匹配内容</span>}</td>
                  <td><div className="flex justify-end gap-0.5">
                    <button type="button" className="icon-button text-brand-600 hover:bg-brand-50 hover:text-brand-700" title="编辑规则" aria-label={`编辑规则 ${index + 1}`} disabled={disabled} onClick={event => setEditor({ isNew: false, trigger: event.currentTarget, rule: { ...rule } })}><Pencil size={16} /></button>
                    <button type="button" className="icon-button" title="上移规则" aria-label={`上移规则 ${index + 1}`} disabled={disabled || index === 0} onClick={() => onMove(index, -1)}><ChevronUp size={16} /></button>
                    <button type="button" className="icon-button" title="下移规则" aria-label={`下移规则 ${index + 1}`} disabled={disabled || index === rules.length - 1} onClick={() => onMove(index, 1)}><ChevronDown size={16} /></button>
                    <button type="button" className="icon-button hover:bg-red-50 hover:text-red-600" title="删除规则" aria-label={`删除规则 ${index + 1}`} disabled={disabled} onClick={() => onDelete(rule.id)}><Trash2 size={16} /></button>
                  </div></td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={5}><div className="flex min-h-48 flex-col items-center justify-center px-4 py-10 text-center"><Search size={24} strokeWidth={1.5} className="mb-3 text-slate-300" /><p className="font-medium text-slate-700">{query ? "没有找到匹配的规则" : "还没有替换规则"}</p><p className="mt-1.5 text-sm text-slate-400">{query ? "试试其他关键词，或清空搜索。" : "点击“添加规则”，填写需要替换的文字。"}</p></div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/40 px-5 py-4">
          <p className="text-sm tabular-nums text-slate-500" aria-live="polite">{filtered.length ? `第 ${offset + 1}–${offset + visible.length} 条，共 ${filtered.length} 条` : "共 0 条"}{query ? "匹配规则" : ""}</p>
          <nav aria-label="规则分页" className="flex items-center gap-1">
            <button type="button" className="pagination-button" aria-label="上一页" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>
            {pageNumbers(currentPage, pageCount).map(item => typeof item === "number"
              ? <button key={item} type="button" className="pagination-button" aria-label={`第 ${item} 页`} aria-current={item === currentPage ? "page" : undefined} onClick={() => setPage(item)}>{item}</button>
              : <span key={item} className="px-1 text-sm text-slate-400">…</span>)}
            <button type="button" className="pagination-button" aria-label="下一页" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button>
          </nav>
        </div>
      </div>
      {editor && <RuleDialog key={editor.rule.id} rule={editor.rule} isNew={editor.isNew} trigger={editor.trigger} fallbackRef={addButtonRef} onClose={() => setEditor(null)} onApply={applyRule} />}
    </section>
  );
}
