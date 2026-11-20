// Locate only system text tokens. Other JSON tokens keep their exact spelling.
class JsonTokens {
  constructor(text) { this.text = text; this.index = 0; }
  space() { while (/\s/.test(this.text[this.index] || "") && this.index < this.text.length) this.index++; }
  string() {
    const start = this.index++;
    while (this.index < this.text.length) {
      const character = this.text[this.index++];
      if (character === "\\") this.index++;
      else if (character === '"') return { type: "string", start, end: this.index };
    }
    throw new SyntaxError("Unterminated JSON string");
  }
  value() {
    this.space();
    const start = this.index;
    const character = this.text[this.index];
    if (character === '"') return this.string();
    if (character === "{") {
      this.index++;
      const properties = new Map();
      this.space();
      while (this.text[this.index] !== "}") {
        if (this.text[this.index] !== '"') throw new SyntaxError("Invalid JSON property");
        const key = this.string();
        this.space();
        if (this.text[this.index++] !== ":") throw new SyntaxError("Missing JSON colon");
        properties.set(this.decode(key), this.value());
        this.space();
        if (this.text[this.index] !== ",") break;
        this.index++;
        this.space();
      }
      if (this.text[this.index++] !== "}") throw new SyntaxError("Invalid JSON object");
      return { type: "object", properties, start, end: this.index };
    }
    if (character === "[") {
      this.index++;
      const items = [];
      this.space();
      while (this.text[this.index] !== "]") {
        items.push(this.value());
        this.space();
        if (this.text[this.index] !== ",") break;
        this.index++;
      }
      if (this.text[this.index++] !== "]") throw new SyntaxError("Invalid JSON array");
      return { type: "array", items, start, end: this.index };
    }
    const scalar = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(this.text.slice(this.index));
    if (!scalar) throw new SyntaxError("Invalid JSON value");
    this.index += scalar[0].length;
    return { type: "scalar", start, end: this.index };
  }
  decode(node) { return node?.type === "string" ? JSON.parse(this.text.slice(node.start, node.end)) : undefined; }
}

export function findSystemTextGroups(text) {
  // Validate separately so permissive token-location logic never accepts malformed input.
  JSON.parse(text);
  const parser = new JsonTokens(text);
  const root = parser.value();
  const messages = root.type === "object" && root.properties.get("messages");
  if (!messages || messages.type !== "array") return [];
  const groups = [];
  for (const message of messages.items) {
    if (message.type !== "object" || parser.decode(message.properties.get("role")) !== "system") continue;
    const tokens = [];
    const add = node => {
      if (node?.type !== "string") throw new TypeError("system 的文本内容必须是字符串。");
      tokens.push({ start: node.start, end: node.end, value: parser.decode(node) });
    };
    const content = message.properties.get("content");
    if (!content) continue;
    if (content.type === "string") { add(content); groups.push(tokens); continue; }
    if (content.type === "scalar" && text.slice(content.start, content.end) === "null") continue;
    if (content.type !== "array") throw new TypeError("system content 必须是字符串或文本内容数组。");
    for (const part of content.items) {
      if (part.type === "string") { add(part); continue; }
      if (part.type !== "object") throw new TypeError("system 内容数组包含无法重写的项目。");
      const type = parser.decode(part.properties.get("type"));
      if (type === "text" || type === "input_text") add(part.properties.get("text"));
      else if (!["image_url", "input_image", "image", "audio", "input_audio", "video", "video_url"].includes(type)) {
        throw new TypeError("system 内容数组包含不支持的文本结构。");
      }
    }
    if (tokens.length) groups.push(tokens);
  }
  return groups;
}

export function findSystemTextTokens(text) { return findSystemTextGroups(text).flat(); }

export function applyStringPatches(text, patches) {
  const sorted = [...patches].sort((left, right) => left.start - right.start);
  const parts = [];
  let cursor = 0;
  for (const patch of sorted) {
    if (patch.start < cursor) throw new TypeError("Overlapping JSON string patches");
    parts.push(text.slice(cursor, patch.start), JSON.stringify(patch.value));
    cursor = patch.end;
  }
  parts.push(text.slice(cursor));
  return parts.join("");
}
