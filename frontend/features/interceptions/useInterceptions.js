import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export function useInterceptions(active, onUnauthorized) {
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const unauthorizedRef = useRef(onUnauthorized);
  const activeRef = useRef(active);
  activeRef.current = active;
  unauthorizedRef.current = onUnauthorized;

  useEffect(() => {
    if (!active || query === committedQuery) return;
    const timer = setTimeout(() => { setCommittedQuery(query); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [active, query, committedQuery]);

  useEffect(() => {
    if (!active) { setLoading(false); return; }
    const controller = new AbortController();
    let current = true;
    const parameters = new URLSearchParams({ page: String(page), pageSize: String(pageSize), q: committedQuery, status });
    setLoading(true); setError("");
    api(`/interceptions?${parameters}`, { signal: controller.signal }).then(result => {
      if (!current || controller.signal.aborted || !activeRef.current) return;
      const canonicalPage = Math.max(1, Math.min(result.page || page, Math.max(1, result.pageCount || 1)));
      if (canonicalPage !== page && result.items.length === 0 && result.total > 0) { setPage(canonicalPage); return; }
      setData(result);
      if (canonicalPage !== page) setPage(canonicalPage);
    }).catch(failure => {
      if (!current || controller.signal.aborted || !activeRef.current) return;
      if (failure.status === 401) unauthorizedRef.current?.();
      else setError(failure.message || "暂时无法加载拦截记录，请重试。");
    }).finally(() => { if (current && !controller.signal.aborted) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [active, committedQuery, status, page, pageSize, version]);

  const refresh = useCallback(() => setVersion(value => value + 1), []);
  function clearFilters() { setQuery(""); setCommittedQuery(""); setStatus("all"); setPage(1); }
  function changeStatus(value) { setStatus(value); setCommittedQuery(query); setPage(1); }
  function changePageSize(value) { setPageSize(Number(value)); setCommittedQuery(query); setPage(1); }
  return { data, loading, error, query, setQuery, status, changeStatus, pageSize, changePageSize, setPage, clearFilters, refresh, searching: query !== committedQuery, hasFilters: committedQuery !== "" || status !== "all" };
}

export function useInterceptionDetail(id, active, onUnauthorized, onUpdated, onDeleted) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(null);
  const [version, setVersion] = useState(0);
  const callbacks = useRef({ onUnauthorized, onUpdated, onDeleted });
  callbacks.current = { onUnauthorized, onUpdated, onDeleted };
  const mutationRef = useRef(null);
  const liveRef = useRef(false);
  liveRef.current = active;
  const busyRef = useRef(false);

  useEffect(() => {
    liveRef.current = active;
    if (!active) { setLoading(false); setBusy(null); busyRef.current = false; return; }
    const controller = new AbortController();
    let current = true;
    setLoading(true); setLoadError("");
    api(`/interceptions/${encodeURIComponent(id)}`, { signal: controller.signal }).then(result => {
      if (current && !controller.signal.aborted) setDetail(result);
    }).catch(failure => {
      if (!current || controller.signal.aborted) return;
      if (failure.status === 401) callbacks.current.onUnauthorized?.();
      else setLoadError(failure.status === 404 ? "这条记录已不存在，请关闭详情并刷新列表。" : failure.message || "暂时无法加载提示词详情。");
    }).finally(() => { if (current && !controller.signal.aborted) setLoading(false); });
    return () => {
      current = false; liveRef.current = false; controller.abort();
      mutationRef.current?.abort(); mutationRef.current = null; busyRef.current = false;
    };
  }, [id, active, version]);

  async function mutate(method, body, kind) {
    if (!liveRef.current || busyRef.current) return null;
    const controller = new AbortController();
    mutationRef.current = controller; busyRef.current = true;
    setBusy(kind); setActionError("");
    try {
      const result = await api(`/interceptions/${encodeURIComponent(id)}`, { method, body, signal: controller.signal });
      if (!liveRef.current || controller.signal.aborted || mutationRef.current !== controller) return null;
      if (method === "DELETE") callbacks.current.onDeleted?.();
      else { setDetail(result); callbacks.current.onUpdated?.(); }
      return result;
    } catch (failure) {
      if (!liveRef.current || controller.signal.aborted || mutationRef.current !== controller) return null;
      if (failure.status === 401) callbacks.current.onUnauthorized?.();
      else setActionError(failure.message || "操作未完成，请重试。");
      return null;
    } finally {
      if (liveRef.current && !controller.signal.aborted && mutationRef.current === controller) {
        mutationRef.current = null; busyRef.current = false; setBusy(null);
      }
    }
  }

  return {
    detail, loading, loadError, actionError, busy,
    retry: () => { if (!busyRef.current) setVersion(value => value + 1); },
    clearActionError: () => setActionError(""),
    save: (patch, kind = "saving") => mutate("PATCH", patch, kind),
    remove: () => mutate("DELETE", undefined, "deleting"),
  };
}
