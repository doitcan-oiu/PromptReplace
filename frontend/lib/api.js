export async function api(path, options = {}) {
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
    error.code = data?.error?.code;
    throw error;
  }
  return data;
}
