import { useEffect, useMemo, useState } from "react";
import { Dialog, Tabs } from "radix-ui";
import RulesTable from "./RulesTable.jsx";
import {
  AlertCircle, Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, FlaskConical, House, KeyRound,
  Loader2, LogOut, RefreshCw, Replace, Server, X,
} from "lucide-react";

async function api(path, options = {}) {
  const response = await fetch(`/admin/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: options.body === undefined ? options.headers : { "content-type": "application/json", ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `请求失败（HTTP ${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function Button({ children, icon: Icon, variant = "secondary", busy = false, className = "", ...props }) {
  return (
    <button type="button" className={`btn btn-${variant} ${className}`} {...props}>
      {busy ? <Loader2 size={17} className="animate-spin" /> : Icon ? <Icon size={17} /> : null}
      {children}
    </button>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><Replace size={19} strokeWidth={1.8} /></div>
      <span>PromptReplace</span>
    </div>
  );
}

function Notice({ notice, onDismiss }) {
  if (!notice) return null;
  const error = notice.type === "error";
  return (
    <div role={error ? "alert" : "status"} className={`mb-6 flex items-start gap-3 rounded-lg border p-3.5 text-sm leading-6 ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      {error ? <AlertCircle size={18} className="mt-0.5 shrink-0" /> : <Check size={18} className="mt-0.5 shrink-0" />}
      <span className="flex-1">{notice.message}</span>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="关闭提示" className="rounded p-1 opacity-60 hover:opacity-100"><X size={15} /></button>}
    </div>
  );
}

function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, danger = false }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl outline-none">
          <Dialog.Title className="pr-7 text-lg font-semibold text-slate-900">{title}</Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-7 text-slate-500">{description}</Dialog.Description>
          <Dialog.Close className="icon-button absolute top-4 right-4" aria-label="关闭对话框"><X size={18} /></Dialog.Close>
          <div className="mt-7 flex justify-end gap-2"><Dialog.Close asChild><Button>取消</Button></Dialog.Close><Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Login({ configured, onLogin }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await onLogin(password); } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-10 flex justify-center"><Brand /></div>
        <section className="card p-7 sm:p-9">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><KeyRound size={22} strokeWidth={1.7} /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">登录管理页</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">使用管理密码编辑替换规则和上游配置。</p>
          {!configured ? <div role="alert" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">请先在 Worker 中设置 ADMIN_PASSWORD Secret，再重新加载页面。<Button className="mt-3 w-full" onClick={() => window.location.reload()} icon={RefreshCw}>重新加载</Button></div> : (
            <form onSubmit={submit} className="mt-7">
              <label className="field-label" htmlFor="admin-password">管理密码</label>
              <input id="admin-password" type="password" autoComplete="current-password" required autoFocus disabled={busy} className="field" value={password} onChange={event => setPassword(event.target.value)} placeholder="输入管理密码" />
              {error && <p role="alert" className="mt-3 text-sm leading-6 text-red-600">{error}</p>}
              <Button variant="primary" type="submit" busy={busy} disabled={busy} className="mt-6 w-full">{busy ? "正在登录" : "登录"}</Button>
            </form>
          )}
        </section>
        <p className="mt-6 text-center text-xs leading-6 text-slate-500">会话仅用于管理配置</p>
      </div>
    </main>
  );
}

function Preview({ rules }) {
  const [text, setText] = useState("");
  const result = useMemo(() => {
    let output = text;
    let count = 0;
    for (const rule of rules) {
      if (!rule.enabled || !rule.from) continue;
      const parts = output.split(rule.from);
      count += parts.length - 1;
      output = parts.join(rule.to);
    }
    return { output, count };
  }, [text, rules]);
  return (
    <details className="preview-section group">
      <summary className="preview-summary"><span className="flex items-center gap-2.5"><FlaskConical size={16} strokeWidth={1.7} />替换预览</span><ChevronDown size={16} className="text-slate-500 transition group-open:rotate-180" /></summary>
      <div className="pt-5">
        <p className="mb-5 text-sm leading-6 text-slate-500">使用当前页面的启用规则进行本地预览。</p>
        <div className="grid gap-5 lg:grid-cols-2">
          <div><label htmlFor="preview-input" className="field-label">原始文本</label><textarea id="preview-input" className="field min-h-36 text-sm" rows={5} value={text} onChange={event => setText(event.target.value)} placeholder="粘贴一段文本，检查替换效果" spellCheck={false} /></div>
          <div><div className="mb-2 flex justify-between gap-3"><label htmlFor="preview-output" className="text-sm font-medium text-slate-700">替换结果</label><span className="text-xs text-slate-500">匹配 {result.count} 处</span></div><textarea id="preview-output" className="field min-h-36 bg-slate-50 text-sm" rows={5} readOnly value={result.output} placeholder="替换结果将显示在这里" /></div>
        </div>
      </div>
    </details>
  );
}

function draftFrom(config) {
  return { upstreamBaseUrl: config.upstreamBaseUrl, rules: config.rules.map(rule => ({ ...rule })) };
}

function Dashboard({ initialConfig, onLogout, onExpired }) {
  const [saved, setSaved] = useState(initialConfig);
  const [draft, setDraft] = useState(() => draftFrom(initialConfig));
  const [tab, setTab] = useState("rules");
  const [upstreamKey, setUpstreamKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [clearKeyDialog, setClearKeyDialog] = useState(false);
  const [reloadDialog, setReloadDialog] = useState(false);
  const [logoutDialog, setLogoutDialog] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(saved)) || upstreamKey !== "" || clearKey;

  useEffect(() => {
    if (!dirty) return;
    const listener = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);

  function report(error) {
    if (error.status === 401) { onExpired(); return; }
    setNotice({ type: "error", message: error.status === 409 ? "配置已在另一页面更新。请先重新加载最新配置，再保存更改。" : error.message });
  }
  function applyConfig(config) {
    setSaved(config); setDraft(draftFrom(config)); setUpstreamKey(""); setClearKey(false); setShowKey(false);
  }
  async function save() {
    const empty = draft.rules.find(rule => !rule.from);
    if (empty) {
      setTab("rules"); setNotice({ type: "error", message: "请填写每条规则的查找原文。替换内容可以留空。" });
      return;
    }
    try {
      const url = new URL(draft.upstreamBaseUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    } catch {
      setTab("upstream"); setNotice({ type: "error", message: "请填写有效的 HTTP 或 HTTPS 上游地址，地址中请勿包含账号、查询参数或片段。" }); return;
    }
    setBusy(true); setNotice(null);
    try {
      const config = await api("/config", { method: "PUT", body: { ...draft, revision: saved.revision, ...(upstreamKey !== "" ? { upstreamApiKey: upstreamKey } : {}), clearUpstreamKey: clearKey } });
      applyConfig(config); setNotice({ type: "success", message: "配置已保存，新请求将使用当前设置。" });
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  async function reload() {
    setReloadDialog(false); setBusy(true); setNotice(null);
    try { applyConfig(await api("/config")); setNotice({ type: "success", message: "已加载最新配置。" }); } catch (error) { report(error); } finally { setBusy(false); }
  }
  async function logout() {
    setLogoutDialog(false); setBusy(true);
    try { await onLogout(); } catch (error) { report(error); setBusy(false); }
  }
  function changeRule(id, changes) {
    setDraft(value => ({ ...value, rules: value.rules.map(rule => rule.id === id ? { ...rule, ...changes } : rule) }));
  }
  function commitRule(rule) {
    setDraft(value => ({
      ...value,
      rules: value.rules.some(current => current.id === rule.id)
        ? value.rules.map(current => current.id === rule.id ? rule : current)
        : [...value.rules, rule],
    }));
  }
  function moveRule(index, direction) {
    setDraft(value => {
      const destination = index + direction;
      if (destination < 0 || destination >= value.rules.length) return value;
      const rules = [...value.rules];
      [rules[index], rules[destination]] = [rules[destination], rules[index]];
      return { ...value, rules };
    });
  }
  async function copyProxy() {
    try { await navigator.clipboard.writeText(window.location.origin + "/v1"); setNotice({ type: "success", message: "代理接口地址已复制。" }); }
    catch { setNotice({ type: "error", message: "浏览器无法复制，请直接选中接口地址复制。" }); }
  }

  return (
    <Tabs.Root value={tab} onValueChange={setTab} className="min-h-screen">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <Brand />
          <Tabs.List aria-label="管理栏目" className="app-navigation">
            <Tabs.Trigger value="rules" className="nav-item">替换规则</Tabs.Trigger>
            <Tabs.Trigger value="upstream" className="nav-item">上游配置</Tabs.Trigger>
          </Tabs.List>
          <div className="app-account">
            <button type="button" className="logout-button" disabled={busy} onClick={() => dirty ? setLogoutDialog(true) : logout()}><LogOut size={15} /><span>退出登录</span></button>
          </div>
        </div>
      </header>
      <main className="app-main">
        <div className="app-content">
          <div className="app-breadcrumb"><House size={14} strokeWidth={1.7} /><span>控制台</span><ChevronRight size={13} /><span>{tab === "rules" ? "替换规则" : "上游配置"}</span></div>
          <header className="app-header">
            <div>
              <div className="flex items-center gap-3"><h1 className="page-title">{tab === "rules" ? "替换规则" : "上游配置"}</h1>{tab === "rules" && <span className="rule-count">{draft.rules.length}</span>}</div>
              <p className="page-description">{tab === "rules" ? "管理请求正文中的文字替换，按规则顺序执行。" : "设置替换后请求转发到的接口。"}</p>
            </div>
            <div className="page-actions">
              <span className={`save-state ${dirty ? "is-dirty" : ""}`}><span className="save-state-dot" />{dirty ? "有未保存的更改" : saved.updatedAt ? "已保存" : "使用初始配置"}</span>
              <button type="button" className="btn btn-secondary reload-button" title="重新加载配置" aria-label="重新加载配置" disabled={busy} onClick={() => dirty ? setReloadDialog(true) : reload()}><RefreshCw size={16} /></button>
              <Button icon={Check} variant="primary" disabled={busy || !dirty} busy={busy} onClick={save}>{busy ? "处理中" : "保存更改"}</Button>
            </div>
          </header>

          <Notice notice={notice} onDismiss={() => setNotice(null)} />

          <Tabs.Content value="rules" className="outline-none">
            <RulesTable rules={draft.rules} disabled={busy} onChange={changeRule} onCommit={commitRule} onMove={moveRule} onDelete={setDeleteId} />
            <Preview rules={draft.rules} />
          </Tabs.Content>

          <Tabs.Content value="upstream" className="upstream-content space-y-5 outline-none">
            <section className="card p-5 sm:p-7"><div className="mb-6 flex items-center gap-3"><div className="rounded-lg bg-brand-50 p-2 text-brand-600"><Server size={19} /></div><h2 className="font-semibold text-slate-800">上游接口</h2></div>
              <label htmlFor="upstream-url" className="field-label">接口基础地址</label><input id="upstream-url" type="url" className="field" value={draft.upstreamBaseUrl} onChange={event => setDraft(value => ({ ...value, upstreamBaseUrl: event.target.value }))} disabled={busy} placeholder="https://api.example.com/v1" autoComplete="off" spellCheck={false} />
              <p className="mt-2 text-xs leading-6 text-slate-500">支持 HTTP 和 HTTPS。可以包含 /v1 等路径前缀。</p>
              <div className="mt-7 flex items-center justify-between gap-3"><label htmlFor="upstream-key" className="field-label mb-0">上游 API Key</label><span className="text-xs text-slate-500">{clearKey ? "保存后删除" : saved.hasUpstreamKey ? "已设置" : "未设置"}</span></div>
              <div className="relative mt-2"><input id="upstream-key" type={showKey ? "text" : "password"} className="field pr-12" autoComplete="new-password" spellCheck={false} disabled={busy} value={upstreamKey} onChange={event => { setUpstreamKey(event.target.value); setClearKey(false); }} placeholder={saved.hasUpstreamKey ? "输入新密钥以替换已保存的密钥" : "输入上游 API Key"} /><button type="button" className="icon-button absolute top-2 right-2" disabled={busy} onClick={() => setShowKey(value => !value)} aria-label={showKey ? "隐藏新密钥" : "显示新密钥"}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs leading-6 text-slate-500">留空会保留当前密钥，已保存的密钥不会在页面回显。</p>{saved.hasUpstreamKey && <button type="button" className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40" disabled={busy} onClick={() => clearKey ? setClearKey(false) : setClearKeyDialog(true)}>{clearKey ? "撤销删除密钥" : "删除已保存的密钥"}</button>}</div>
            </section>
            <section className="card p-5 sm:p-7"><h2 className="font-semibold text-slate-800">客户端接口地址</h2><p className="mt-2 text-sm leading-6 text-slate-500">将此地址填写到客户端的 OpenAI 兼容接口配置中。</p><div className="mt-5 flex flex-wrap gap-2"><input aria-label="客户端接口地址" readOnly value={window.location.origin + "/v1"} className="field min-w-0 flex-1 bg-slate-50 font-mono text-sm" /><Button icon={Copy} onClick={copyProxy}>复制</Button></div></section>
          </Tabs.Content>

          <footer className="app-footer"><span>{saved.updatedAt ? `最近保存 ${new Date(saved.updatedAt).toLocaleString("zh-CN", { hour12: false })}` : "保存后，新请求将读取 D1 中的配置。"}</span></footer>
        </div>
      </main>

      <ConfirmDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)} title="删除这条规则？" description="规则会从当前编辑列表移除，保存更改后生效。" confirmLabel="删除规则" danger onConfirm={() => { setDraft(value => ({ ...value, rules: value.rules.filter(rule => rule.id !== deleteId) })); setDeleteId(null); }} />
      <ConfirmDialog open={clearKeyDialog} onOpenChange={setClearKeyDialog} title="删除已保存的密钥？" description="保存更改后会清除上游密钥。之后转发请求将沿用客户端提供的 Authorization。" confirmLabel="标记删除" danger onConfirm={() => { setClearKey(true); setUpstreamKey(""); setClearKeyDialog(false); }} />
      <ConfirmDialog open={reloadDialog} onOpenChange={setReloadDialog} title="重新加载配置？" description="当前未保存的更改会被最新配置替换。" confirmLabel="重新加载" onConfirm={reload} />
      <ConfirmDialog open={logoutDialog} onOpenChange={setLogoutDialog} title="放弃更改并退出？" description="当前页面还有未保存的更改，退出后需要重新编辑。" confirmLabel="退出登录" onConfirm={logout} />
    </Tabs.Root>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true); setLoadError("");
    try {
      const current = await api("/session");
      setSession(current);
      if (current.authenticated) setConfig(await api("/config"));
    } catch (error) {
      if (error.status === 401) { setSession({ authenticated: false, configured: true }); setConfig(null); }
      else setLoadError(error.message);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function login(password) {
    await api("/login", { method: "POST", body: { password } });
    await load();
  }
  async function logout() {
    await api("/logout", { method: "POST", body: {} });
    setSession(value => ({ ...value, authenticated: false })); setConfig(null);
  }
  function expired() { setSession(value => ({ ...value, authenticated: false })); setConfig(null); }

  if (loading) return <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-5"><Brand /><div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={17} className="animate-spin" />正在加载配置</div></div>;
  if (loadError) return <main className="flex min-h-screen items-center justify-center p-5"><div className="card w-full max-w-md p-7"><Brand /><h1 className="mt-7 text-xl font-semibold">暂时无法加载配置</h1><p role="alert" className="mt-3 text-sm leading-7 text-slate-500">{loadError}</p><div className="mt-6 flex gap-2"><Button icon={RefreshCw} onClick={load}>重新加载</Button>{session?.authenticated && <Button variant="quiet" onClick={logout}>退出登录</Button>}</div></div></main>;
  if (!session?.authenticated) return <Login configured={session?.configured} onLogin={login} />;
  if (!config) return null;
  return <Dashboard initialConfig={config} onLogout={logout} onExpired={expired} />;
}
