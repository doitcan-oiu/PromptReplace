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
        <Dialog.Content className="dialog-panel" onInteractOutside={event => event.preventDefault()} onCloseAutoFocus={event => {
          event.preventDefault();
          const target = trigger?.isConnected ? trigger : fallbackRef.current;
          target?.focus();
        }}>
          <div className="dialog-header">
            <Dialog.Title className="pr-8 text-xl font-medium tracking-tight text-slate-900">{isNew ? "添加替换规则" : "编辑替换规则"}</Dialog.Title>
            <Dialog.Description className="mt-2 text-[13px] leading-6 text-slate-500">规则按列表顺序执行，替换内容留空表示删除匹配文字。</Dialog.Description>
            <Dialog.Close className="icon-button absolute top-4 right-4" aria-label="关闭规则弹窗"><X size={18} /></Dialog.Close>
          </div>
          <form onSubmit={submit}>
            <div className="dialog-fields">
              <div>
                <div className="dialog-field-heading"><label className="field-label mb-0" htmlFor="rule-from">查找原文</label><span>必填 · 区分大小写</span></div>
                <textarea id="rule-from" autoFocus rows={4} className="field min-h-28 font-mono text-[13px]" spellCheck={false} value={value.from} onChange={event => { setValue(current => ({ ...current, from: event.target.value })); setError(""); }} placeholder="输入需要替换的文字" aria-invalid={Boolean(error)} aria-describedby={error ? "rule-error" : undefined} />
                {error && <p id="rule-error" role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
              </div>
              <div>
                <div className="dialog-field-heading"><label className="field-label mb-0" htmlFor="rule-to">替换内容</label><span>留空表示删除匹配文字</span></div>
                <textarea id="rule-to" rows={4} className="field min-h-28 font-mono text-[13px]" spellCheck={false} value={value.to} onChange={event => setValue(current => ({ ...current, to: event.target.value }))} placeholder="输入替换后的文字，留空则删除" />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <label htmlFor="rule-enabled" className="cursor-pointer text-[13px] text-slate-700">启用这条规则</label>
                <Switch.Root id="rule-enabled" className="switch-root" checked={value.enabled} onCheckedChange={enabled => setValue(current => ({ ...current, enabled }))}><Switch.Thumb className="switch-thumb" /></Switch.Root>
              </div>
            </div>
            <div className="dialog-footer">
              <p className="text-xs leading-6 text-slate-500">加入列表后，保存更改即可生效。</p>
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
    <section aria-label="替换规则列表">
      <div className="card overflow-hidden">
        <div className="rules-toolbar">
          <div className="rules-search">
            <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" size={16} />
            <input aria-label="搜索规则" className="field pl-9 pr-9 text-[13px]" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="搜索原文或替换内容…" />
            {query && <button type="button" aria-label="清空搜索" className="icon-button absolute top-1/2 right-1 -translate-y-1/2" onClick={() => { setQuery(""); setPage(1); }}><X size={15} /></button>}
          </div>
          <div className="rules-toolbar-actions">
            <p className="enabled-count"><span>{enabledCount}</span> 条已启用</p>
            <button ref={addButtonRef} type="button" className="btn btn-secondary" disabled={disabled} onClick={addRule}><Plus size={16} />添加规则</button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="rule-table">
            <colgroup><col className="w-[7%]" /><col className="w-[8%]" /><col className="w-[31%]" /><col className="w-[33%]" /><col className="w-[21%]" /></colgroup>
            <thead><tr><th scope="col">顺序</th><th scope="col">启用</th><th scope="col">查找原文</th><th scope="col">替换内容</th><th scope="col" className="text-right">操作</th></tr></thead>
            <tbody>
              {visible.map(({ rule, index }) => (
                <tr key={rule.id} className={rule.enabled ? "" : "bg-slate-50/50"}>
                  <td className="text-xs tabular-nums text-slate-500">{String(index + 1).padStart(2, "0")}</td>
                  <td><Switch.Root className="switch-root" checked={rule.enabled} disabled={disabled} aria-label={`启用规则 ${index + 1}`} onCheckedChange={enabled => onChange(rule.id, { enabled })}><Switch.Thumb className="switch-thumb" /></Switch.Root></td>
                  <td><p title={rule.from} className={`line-clamp-2 break-words whitespace-pre-wrap font-mono text-[13px] leading-6 ${rule.enabled ? "text-slate-800" : "text-slate-500"}`}>{rule.from}</p></td>
                  <td>{rule.to ? <p title={rule.to} className={`line-clamp-2 break-words whitespace-pre-wrap text-[13px] leading-6 ${rule.enabled ? "text-slate-600" : "text-slate-500"}`}>{rule.to}</p> : <span className="text-xs italic text-slate-500">删除匹配内容</span>}</td>
                  <td><div className="flex justify-end gap-0.5">
                    <button type="button" className="icon-button text-brand-600 hover:bg-brand-50 hover:text-brand-700" title="编辑规则" aria-label={`编辑规则 ${index + 1}`} disabled={disabled} onClick={event => setEditor({ isNew: false, trigger: event.currentTarget, rule: { ...rule } })}><Pencil size={16} /></button>
                    <button type="button" className="icon-button" title="上移规则" aria-label={`上移规则 ${index + 1}`} disabled={disabled || index === 0} onClick={() => onMove(index, -1)}><ChevronUp size={16} /></button>
                    <button type="button" className="icon-button" title="下移规则" aria-label={`下移规则 ${index + 1}`} disabled={disabled || index === rules.length - 1} onClick={() => onMove(index, 1)}><ChevronDown size={16} /></button>
                    <button type="button" className="icon-button hover:bg-red-50 hover:text-red-600" title="删除规则" aria-label={`删除规则 ${index + 1}`} disabled={disabled} onClick={() => onDelete(rule.id)}><Trash2 size={16} /></button>
                  </div></td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={5}><div className="flex min-h-48 flex-col items-center justify-center px-4 py-10 text-center"><Search size={24} strokeWidth={1.5} className="mb-3 text-slate-300" /><p className="font-medium text-slate-700">{query ? "没有找到匹配的规则" : "还没有替换规则"}</p><p className="mt-1.5 text-sm text-slate-500">{query ? "试试其他关键词，或清空搜索。" : "点击“添加规则”，填写需要替换的文字。"}</p></div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="rules-pagination">
          <p className="text-xs tabular-nums text-slate-500" aria-live="polite">{filtered.length ? `第 ${offset + 1}–${offset + visible.length} 条，共 ${filtered.length} 条` : "共 0 条"}{query ? "匹配规则" : ""}</p>
          <div className="pagination-controls">
            <label htmlFor="rules-page-size" className="sr-only">每页显示条数</label>
            <div className="relative mr-2">
              <select id="rules-page-size" className="page-size-select" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
                {[10, 20, 50].map(size => <option key={size} value={size}>{size} 条 / 页</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-slate-500" />
            </div>
            <nav aria-label="规则分页" className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
            <button type="button" className="pagination-button" aria-label="上一页" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17} /></button>
            {pageNumbers(currentPage, pageCount).map(item => typeof item === "number"
              ? <button key={item} type="button" className="pagination-button" aria-label={`第 ${item} 页`} aria-current={item === currentPage ? "page" : undefined} onClick={() => setPage(item)}>{item}</button>
              : <span key={item} className="px-1 text-sm text-slate-500">…</span>)}
            <button type="button" className="pagination-button" aria-label="下一页" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17} /></button>
            </nav>
          </div>
        </div>
      </div>
      {editor && <RuleDialog key={editor.rule.id} rule={editor.rule} isNew={editor.isNew} trigger={editor.trigger} fallbackRef={addButtonRef} onClose={() => setEditor(null)} onApply={applyRule} />}
    </section>
  );
}
