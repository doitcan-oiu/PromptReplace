import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

function draftFrom(config) {
  return { upstreamBaseUrl: config.upstreamBaseUrl, rules: config.rules.map(rule => ({ ...rule })) };
}

const confirmations = {
  reload: { title: "重新加载配置？", description: "当前未保存的更改会被最新配置替换。", confirmLabel: "重新加载" },
  logout: { title: "放弃更改并退出？", description: "当前页面还有未保存的更改，退出后需要重新编辑。", confirmLabel: "退出登录" },
  clearKey: { title: "清除已保存的密钥？", description: "保存更改后会清除上游密钥。之后转发请求将沿用客户端提供的 Authorization。", confirmLabel: "标记清除", danger: true },
  deleteRule: { title: "删除这条规则？", description: "规则会从当前编辑列表移除，保存更改后生效。", confirmLabel: "删除规则", danger: true },
};

export function useProxyConfig() {
  const [session, setSession] = useState(null);
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [page, setPage] = useState("rules");
  const [upstreamKey, setUpstreamKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const operation = useRef(false);
  const loadController = useRef(null);
  const dirty = Boolean(saved && draft && (JSON.stringify(draft) !== JSON.stringify(draftFrom(saved)) || upstreamKey !== "" || clearKey));

  const applyConfig = useCallback(config => {
    setSaved(config);
    setDraft(draftFrom(config));
    setUpstreamKey("");
    setClearKey(false);
  }, []);

  const expire = useCallback(() => {
    setSession({ authenticated: false, configured: true });
    setSaved(null); setDraft(null); setUpstreamKey(""); setClearKey(false);
    setNotice(null); setConfirmation(null); setLoadError("");
    setAuthNotice("登录已过期，请重新登录。");
  }, []);

  const report = useCallback(error => {
    if (error.status === 401) { expire(); return; }
    setNotice({ type: "error", message: error.status === 409
      ? "配置已在另一页面更新。请重新加载最新配置，再保存更改。"
      : error.message || "操作失败，请稍后重试。" });
  }, [expire]);

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true); setLoadError("");
    try {
      const current = await api("/session", { signal: controller.signal });
      setSession(current);
      if (current.authenticated) applyConfig(await api("/config", { signal: controller.signal }));
      else { setSaved(null); setDraft(null); }
    } catch (error) {
      if (error.name === "AbortError") return;
      if (error.status === 401) expire();
      else setLoadError(error.message);
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [applyConfig, expire]);

  useEffect(() => { load(); return () => loadController.current?.abort(); }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const listener = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);

  async function perform(action) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setNotice(null);
    try { await action(); }
    catch (error) { report(error); }
    finally { operation.current = false; setBusy(false); }
  }

  async function login(password) {
    await api("/login", { method: "POST", body: { password } });
    setAuthNotice("");
    await load();
  }

  async function save() {
    if (!saved || !draft || operation.current) return;
    if (draft.rules.some(rule => !rule.from)) {
      setPage("rules"); setNotice({ type: "error", message: "请填写每条规则的查找原文。替换内容可以留空。" }); return;
    }
    try {
      const url = new URL(draft.upstreamBaseUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    } catch {
      setPage("upstream"); setNotice({ type: "error", message: "请填写有效的 HTTP 或 HTTPS 上游地址，地址中请勿包含账号、查询参数或片段。" }); return;
    }
    await perform(async () => {
      applyConfig(await api("/config", { method: "PUT", body: {
        ...draft, revision: saved.revision,
        ...(upstreamKey !== "" ? { upstreamApiKey: upstreamKey } : {}), clearUpstreamKey: clearKey,
      } }));
      setNotice({ type: "success", message: "配置已保存，新请求将使用当前设置。" });
    });
  }

  async function reload() {
    setConfirmation(null);
    await perform(async () => {
      applyConfig(await api("/config"));
      setNotice({ type: "success", message: "已重新加载最新配置。" });
    });
  }

  async function logout() {
    setConfirmation(null);
    await perform(async () => {
      await api("/logout", { method: "POST", body: {} });
      setSession(current => ({ ...current, authenticated: false }));
      setSaved(null); setDraft(null); setUpstreamKey(""); setClearKey(false); setAuthNotice(""); setLoadError("");
    });
  }

  function commitRule(rule) {
    setDraft(current => ({ ...current, rules: current.rules.some(item => item.id === rule.id)
      ? current.rules.map(item => item.id === rule.id ? rule : item)
      : [...current.rules, rule] }));
  }

  function moveRule(index, direction) {
    setDraft(current => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.rules.length) return current;
      const rules = [...current.rules];
      [rules[index], rules[destination]] = [rules[destination], rules[index]];
      return { ...current, rules };
    });
  }

  async function confirmAction() {
    if (!confirmation) return;
    const action = confirmation;
    setConfirmation(null);
    if (action.type === "reload") await reload();
    if (action.type === "logout") await logout();
    if (action.type === "clearKey") { setClearKey(true); setUpstreamKey(""); }
    if (action.type === "deleteRule") setDraft(current => ({ ...current, rules: current.rules.filter(rule => rule.id !== action.id) }));
  }

  async function copyProxy() {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/v1");
      setNotice({ type: "success", message: "客户端接口地址已复制。" });
    } catch { setNotice({ type: "error", message: "浏览器无法复制，请直接选中接口地址复制。" }); }
  }

  return {
    session, saved, draft, loading, loadError, authNotice, page, setPage, upstreamKey, clearKey, busy, dirty, notice,
    phase: loading ? "loading" : loadError ? "error" : !session?.authenticated ? "login" : !saved || !draft ? "loading" : "ready",
    load, login, save, copyProxy,
    dismissNotice: () => setNotice(null),
    setBaseUrl: value => setDraft(current => ({ ...current, upstreamBaseUrl: value })),
    setKey: value => { setUpstreamKey(value); setClearKey(false); },
    undoClearKey: () => setClearKey(false),
    changeRule: (id, changes) => setDraft(current => ({ ...current, rules: current.rules.map(rule => rule.id === id ? { ...rule, ...changes } : rule) })),
    commitRule, moveRule,
    requestDeleteRule: id => setConfirmation({ type: "deleteRule", id }),
    requestClearKey: () => setConfirmation({ type: "clearKey" }),
    requestReload: () => { if (!busy) dirty ? setConfirmation({ type: "reload" }) : reload(); },
    requestLogout: () => { if (!busy) dirty ? setConfirmation({ type: "logout" }) : logout(); },
    confirmation: confirmation ? { ...confirmations[confirmation.type], open: true } : { open: false },
    closeConfirmation: () => setConfirmation(null),
    confirmAction,
  };
}
