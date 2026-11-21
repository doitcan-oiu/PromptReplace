export function applyReplacements(text, rules) {
  let output = text;
  let count = 0;
  for (const rule of rules) {
    if (!rule.enabled || !rule.from) continue;
    const parts = output.split(rule.from);
    count += parts.length - 1;
    output = parts.join(rule.to);
  }
  return { output, count };
}
