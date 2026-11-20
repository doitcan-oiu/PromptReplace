import { useEffect, useRef, useState } from "react";
import { Switch } from "radix-ui";
import { Database, Eye, EyeOff, FlaskConical, RefreshCw, Sparkles, Trash2 } from "lucide-react";

export const AI_REWRITE_DEFAULTS = {
  enabled: false,
  baseUrl: "",
  model: "",
  timeoutSeconds: 90,
  cacheEnabled: true,
  cacheTtlHours: 24,
};

export function rewriteDraftFrom(config) {
  return Object.fromEntries(Object.entries(AI_REWRITE_DEFAULTS).map(([key, fallback]) => [key, config?.[key] ?? fallback]));
}

export function rewritePayload(settings, key, clearKey) {
  return { ...settings, ...(key !== "" ? { apiKey: key } : {}), clearApiKey: clearKey };
}

export function validateRewriteSettings(settings, requireConnection = false) {
  const required = requireConnection || settings.enabled;
  if (required || settings.baseUrl.trim()) {
    try {
      const url = new URL(settings.baseUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    } catch {
      return "请填写有效的 AI 接口地址，使用 HTTP 或 HTTPS，地址中请勿包含账号、查询参数或片段。";
    }
  }
  if (required && !settings.model.trim()) return "请填写 AI 重写模型名称。";
  if (!Number.isInteger(settings.timeoutSeconds) || settings.timeoutSeconds < 5 || settings.timeoutSeconds > 120) return "AI 重写超时请填写 5–120 之间的整数秒。";
  if (!Number.isInteger(settings.cacheTtlHours) || settings.cacheTtlHours < 1 || settings.cacheTtlHours > 720) return "缓存有效期请填写 1–720 之间的整数小时。";
  return "";
}

export default function RewriteSettings({
  settings, onChange, keyValue, onKeyChange, clearKey, onClearKeyChange,
  savedHasKey, busy, api, Button, ConfirmDialog, onError, onNotice, onActivityChange,
}) {
  const [showKey, setShowKey] = useState(false);
  const [clearKeyDialog, setClearKeyDialog] = useState(false);
  const [clearCacheDialog, setClearCacheDialog] = useState(false);
  const [cache, setCache] = useState(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewController = useRef(null);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const locked = busy || previewBusy || cacheBusy;

  useEffect(() => {
    onActivityChange?.(previewBusy || cacheBusy);
    return () => onActivityChange?.(false);
  }, [previewBusy, cacheBusy, onActivityChange]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setCacheLoading(true);
    api("/rewrite/cache", { signal: controller.signal })
      .then(value => { if (active) setCache(value); })
      .catch(error => { if (active && error.name !== "AbortError") errorHandler.current(error); })
      .finally(() => { if (active) setCacheLoading(false); });
    return () => { active = false; controller.abort(); previewController.current?.abort(); };
  }, [api]);

  useEffect(() => { setResult(null); }, [settings, keyValue, clearKey]);
  useEffect(() => { if (keyValue === "") setShowKey(false); }, [keyValue]);

  async function refreshCache() {
    setCacheLoading(true);
    try { setCache(await api("/rewrite/cache")); }
    catch (error) { onError(error); }
    finally { setCacheLoading(false); }
  }

  async function clearCache() {
    setClearCacheDialog(false);
    setCacheBusy(true);
    try {
      await api("/rewrite/cache", { method: "DELETE" });
      setCache({ entries: 0, pending: 0 });
      onNotice({ type: "success", message: "AI 重写缓存已清空。后续请求将重新生成改写结果。" });
    } catch (error) { onError(error); }
    finally { setCacheBusy(false); }
  }

  async function preview() {
    const error = validateRewriteSettings(settings, true);
    if (error) { onNotice({ type: "error", message: error }); return; }
    if (!text.trim()) { onNotice({ type: "error", message: "请先填写需要测试的 system 提示词。" }); return; }
    if (/[\r\n]/.test(keyValue)) { onNotice({ type: "error", message: "AI 接口密钥不能包含换行。" }); return; }
    previewController.current?.abort();
    const controller = new AbortController();
    previewController.current = controller;
    setPreviewBusy(true); setResult(null);
    try {
      const value = await api("/rewrite/preview", {
        method: "POST", signal: controller.signal,
        body: { text, aiRewrite: rewritePayload(settings, keyValue, clearKey) },
      });
      if (typeof value?.rewritten !== "string") throw new Error("AI 测试未返回有效的重写结果。");
      setResult(value);
      refreshCache();
    } catch (error) { if (error.name !== "AbortError") onError(error); }
    finally { if (!controller.signal.aborted) setPreviewBusy(false); }
  }

  return (
    <div className="space-y-5">
      <section className="card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-2.5 text-base font-medium text-slate-800"><Sparkles size={19} className="text-brand-600" />系统提示词重写</h2>
            <p className="mt-2 text-sm leading-7 text-slate-500">普通替换规则先执行，AI 随后仅重写 system 提示词。重写失败会返回错误，原文不会直接发送到上游。</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 pt-1">
            <label htmlFor="rewrite-enabled" className="text-sm text-slate-700">{settings.enabled ? "已启用" : "未启用"}</label>
            <Switch.Root id="rewrite-enabled" className="switch-root" checked={settings.enabled} disabled={locked} onCheckedChange={enabled => onChange({ enabled })} aria-label="启用 AI 重写"><Switch.Thumb className="switch-thumb" /></Switch.Root>
          </div>
        </div>

        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          <div>
            <label htmlFor="rewrite-url" className="field-label">AI 接口基础地址</label>
            <input id="rewrite-url" type="url" className="field" disabled={locked} value={settings.baseUrl} onChange={event => onChange({ baseUrl: event.target.value })} placeholder="https://api.example.com/v1" autoComplete="off" spellCheck={false} />
            <p className="mt-2 text-xs leading-6 text-slate-500">使用 OpenAI 兼容接口，与主上游独立配置。</p>
          </div>
          <div>
            <label htmlFor="rewrite-model" className="field-label">重写模型名称</label>
            <input id="rewrite-model" className="field" disabled={locked} value={settings.model} onChange={event => onChange({ model: event.target.value })} placeholder="填写接口支持的模型名称" autoComplete="off" spellCheck={false} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><label htmlFor="rewrite-key" className="field-label mb-0">AI 接口 API Key</label><span className="text-xs text-slate-500">{clearKey ? "保存后删除" : savedHasKey ? "已设置" : "未设置"}</span></div>
        <div className="relative mt-2">
          <input id="rewrite-key" type={showKey ? "text" : "password"} className="field pr-12" value={keyValue} disabled={locked} onChange={event => onKeyChange(event.target.value)} placeholder={savedHasKey ? "输入新密钥以替换已保存的密钥" : "输入 AI 接口密钥，无需鉴权的接口可留空"} autoComplete="new-password" spellCheck={false} />
          <button type="button" className="icon-button absolute top-2 right-2" disabled={locked} onClick={() => setShowKey(value => !value)} aria-label={showKey ? "隐藏新 AI 密钥" : "显示新 AI 密钥"}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs leading-6 text-slate-500">留空保留当前密钥，已保存的密钥不会回显，也不会沿用客户端或主上游密钥。</p>
          {savedHasKey && <button type="button" disabled={locked} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40" onClick={() => clearKey ? onClearKeyChange(false) : setClearKeyDialog(true)}>{clearKey ? "撤销删除 AI 密钥" : "删除已保存的 AI 密钥"}</button>}
        </div>

        <div className="mt-5 max-w-xs">
          <label htmlFor="rewrite-timeout" className="field-label">重写超时（秒）</label>
          <input id="rewrite-timeout" type="number" min={5} max={120} step={1} className="field" disabled={locked} value={settings.timeoutSeconds} onChange={event => onChange({ timeoutSeconds: event.target.value === "" ? "" : Number(event.target.value) })} />
          <p className="mt-2 text-xs leading-6 text-slate-500">填写 5–120 秒，超时后返回明确的重写错误。</p>
        </div>
        <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-6 text-slate-500">经保护的系统说明会发送给上述 AI 服务，实际记忆、工具名、标签和动态值会保留。配置更改后点击页面右上的“保存更改”生效。</p>
      </section>

      <section className="card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="flex items-center gap-2.5 text-base font-medium text-slate-800"><Database size={18} className="text-brand-600" />重写缓存</h2><p className="mt-2 text-sm leading-7 text-slate-500">缓存保存改写模板。命中后复用结果，并在当前请求中还原动态值。</p></div>
          <div className="flex items-center gap-3 pt-1"><label htmlFor="rewrite-cache-enabled" className="text-sm text-slate-700">启用 D1 缓存</label><Switch.Root id="rewrite-cache-enabled" className="switch-root" checked={settings.cacheEnabled} disabled={locked} onCheckedChange={cacheEnabled => onChange({ cacheEnabled })}><Switch.Thumb className="switch-thumb" /></Switch.Root></div>
        </div>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
          <div className="w-full max-w-xs"><label htmlFor="rewrite-cache-ttl" className="field-label">缓存有效期（小时）</label><input id="rewrite-cache-ttl" type="number" min={1} max={720} step={1} className="field" disabled={locked || !settings.cacheEnabled} value={settings.cacheTtlHours} onChange={event => onChange({ cacheTtlHours: event.target.value === "" ? "" : Number(event.target.value) })} /><p className="mt-2 text-xs leading-6 text-slate-500">填写 1–720 小时，启用缓存后生效。</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-xs tabular-nums text-slate-500" role="status">{cacheLoading ? "正在读取缓存" : cache ? `${cache.entries ?? 0} 条可用 · ${cache.pending ?? 0} 条处理中` : "缓存状态未加载"}</span>
            <Button icon={RefreshCw} busy={cacheLoading} disabled={locked || cacheLoading} onClick={refreshCache}>刷新状态</Button>
            <Button icon={Trash2} disabled={locked || cacheLoading || !cache} onClick={() => setClearCacheDialog(true)}>清空缓存</Button>
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="flex items-center gap-2.5 text-base font-medium text-slate-800"><FlaskConical size={18} className="text-brand-600" />测试 system 重写</h2><p className="mt-2 text-sm leading-7 text-slate-500">使用当前填写的 AI 配置测试，无需先保存或开启自动重写。</p></div>
          <Button variant="primary" icon={Sparkles} busy={previewBusy} disabled={locked} onClick={preview}>{previewBusy ? "正在重写" : "测试重写"}</Button>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div><label htmlFor="rewrite-preview-source" className="field-label">原始 system 提示词</label><textarea id="rewrite-preview-source" rows={9} className="field min-h-56 text-sm" disabled={locked} spellCheck={false} value={text} onChange={event => { setText(event.target.value); setResult(null); }} placeholder="粘贴需要测试的系统提示词" /></div>
          <div><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><label htmlFor="rewrite-preview-result" className="field-label mb-0">AI 重写结果</label>{result && <span className="text-xs tabular-nums text-slate-500" role="status">{result.cacheHit ? "命中缓存" : "新生成"}{Number.isFinite(result.durationMs) ? ` · ${(result.durationMs / 1000).toFixed(2)} 秒` : ""}</span>}</div><textarea id="rewrite-preview-result" rows={9} readOnly className="field min-h-56 bg-slate-50 text-sm" spellCheck={false} value={result?.rewritten || ""} placeholder="改写结果将显示在这里" /></div>
        </div>
      </section>

      <ConfirmDialog open={clearKeyDialog} onOpenChange={setClearKeyDialog} title="删除已保存的 AI 密钥？" description="保存更改后会清除 AI 接口密钥。清除后，重写请求将不发送 Authorization。" confirmLabel="标记删除" danger onConfirm={() => { onKeyChange(""); onClearKeyChange(true); setClearKeyDialog(false); }} />
      <ConfirmDialog open={clearCacheDialog} onOpenChange={setClearCacheDialog} title="清空 AI 重写缓存？" description="已缓存的改写模板将被清除。下次请求会重新调用 AI，接口配置和替换规则会保留。" confirmLabel="清空缓存" danger onConfirm={clearCache} />
    </div>
  );
}
