const SLOT_PATTERN = /__PR_SLOT_\d{4,}__/g;
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function jsonEnd(text, start) {
  const stack = [];
  let quoted = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === "\\") index++;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{" || character === "[") stack.push(character);
    else if (character === "}" || character === "]") {
      const opening = stack.pop();
      if (opening !== (character === "}" ? "{" : "[")) return null;
      if (!stack.length) {
        try { JSON.parse(text.slice(start, index + 1)); return index + 1; } catch { return null; }
      }
    }
  }
  return null;
}

export function prepareSystemTemplate(text, toolNames = [], protectedRanges = []) {
  if (typeof text !== "string") throw new TypeError("system 文本必须是字符串。");
  const spans = protectedRanges.map(([start, end]) => [start, end]);
  const addPattern = pattern => { for (const match of text.matchAll(pattern)) spans.push([match.index, match.index + match[0].length]); };
  addPattern(/<memories\b[^>]*>[\s\S]*?<\/memories\s*>/gi);
  addPattern(/<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder\s*>/gi);
  addPattern(/<FILE_PATH\b[^>]*>[\s\S]*?<\/FILE_PATH\s*>/gi);
  // Include unclosed fences as protected code rather than letting the model edit them.
  addPattern(/^[ \t]*(`{3,}|~{3,})[^\n]*(?:\n[\s\S]*?(?:^[ \t]*\1[^\n]*(?:\n|$)|(?![\s\S])))/gm);
  addPattern(/(`+)[^`\n]*?\1/g);
  addPattern(/"(?:\\[\s\S]|[^"\\])*"/g);
  addPattern(/(?<![A-Za-z0-9])'[^'\n]*'(?![A-Za-z0-9])/g);
  addPattern(/<\/?[A-Za-z][^>\n]*>/g);
  addPattern(/\b(?:https?|file):\/\/[^\s<>`]+/g);
  addPattern(/(?:\b[A-Za-z]:[\\/]|(?:~|\.\.?|\/Users|\/home|\/tmp|\/var|\/workspace)[\\/])[^\s<>`"']+/g);
  addPattern(/\b[A-Za-z_][A-Za-z0-9_]*_[A-Za-z0-9_]+\b/g);
  addPattern(/\b[A-Za-z_$][A-Za-z0-9_$]*(?=\s*\()/g);
  addPattern(/\b[A-Za-z0-9][A-Za-z0-9_-]{27,}\b/g);
  addPattern(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g);
  addPattern(/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g);
  addPattern(/\b\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\b/g);
  addPattern(/__PR_SLOT_[^\s]*/g);
  addPattern(/__PR_BOUNDARY_[a-f0-9]{32}_\d+__/g);
  for (const match of text.matchAll(/^(?:Current model|Conversation started|当前模型|会话开始时间)\s*[:：][ \t]*(.*)$/gm)) {
    const start = match.index + match[0].length - match[1].length;
    spans.push([start, start + match[1].length]);
  }
  for (const name of new Set(toolNames.filter(name => typeof name === "string" && name))) {
    addPattern(new RegExp(`(?<![A-Za-z0-9_$])${escapeRegex(name)}(?![A-Za-z0-9_$])`, "g"));
  }
  // Protect complete JSON examples, including their literals, even without code fences.
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== "{" && text[index] !== "[") continue;
    if (spans.some(([start, end]) => start <= index && index < end)) continue;
    const end = jsonEnd(text, index);
    if (end !== null) { spans.push([index, end]); index = end - 1; }
  }
  const merged = [];
  for (const [start, end] of spans.sort((a, b) => a[0] - b[0] || b[1] - a[1])) {
    if (start === end) continue;
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  const slots = [];
  const pieces = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    const token = `__PR_SLOT_${String(slots.length).padStart(4, "0")}__`;
    pieces.push(text.slice(cursor, start), token);
    slots.push({ token, value: text.slice(start, end) });
    cursor = end;
  }
  pieces.push(text.slice(cursor));
  return { template: pieces.join(""), slots, ranges: merged.map(range => [...range]) };
}

export function restoreSystemTemplate(rewritten, prepared) {
  if (typeof rewritten !== "string" || !rewritten.trim()) throw new TypeError("AI 返回了空的系统提示词。");
  const actual = [...rewritten.matchAll(SLOT_PATTERN)].map(match => match[0]);
  const expected = prepared.slots.map(slot => slot.token);
  if (actual.length !== expected.length || actual.some((token, index) => token !== expected[index])) {
    throw new TypeError("AI 改动了受保护内容的占位符或顺序。");
  }
  if (rewritten.replace(SLOT_PATTERN, "").includes("__PR_SLOT_")) throw new TypeError("AI 返回了未知的内容占位符。");
  const values = new Map(prepared.slots.map(slot => [slot.token, slot.value]));
  return rewritten.replace(SLOT_PATTERN, token => values.get(token));
}
