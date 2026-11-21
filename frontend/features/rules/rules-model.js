export function getPaginationItems(current, total) {
  const pages = [...new Set([1, total, current - 1, current, current + 1])]
    .filter(page => page >= 1 && page <= total)
    .sort((left, right) => left - right);
  return pages.flatMap((page, index) => index > 0 && page - pages[index - 1] > 1 ? [`gap-${page}`, page] : [page]);
}

export function getRulePage(rules, { query = "", status = "all", page = 1, pageSize = 10 } = {}) {
  const needle = query.toLocaleLowerCase();
  const filtered = rules.map((rule, index) => ({ rule, index })).filter(({ rule }) =>
    (status === "all" || rule.enabled === (status === "enabled")) &&
    (rule.from.toLocaleLowerCase().includes(needle) || rule.to.toLocaleLowerCase().includes(needle)));
  const limit = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / limit));
  const currentPage = Math.max(1, Math.min(Number.isInteger(page) ? page : 1, pageCount));
  const offset = (currentPage - 1) * limit;
  return {
    filtered,
    visible: filtered.slice(offset, offset + limit),
    enabledCount: rules.filter(rule => rule.enabled).length,
    pageCount,
    currentPage,
    offset,
  };
}
