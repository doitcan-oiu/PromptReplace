# PromptReplace

React + Radix UI + Tailwind CSS 管理页，Cloudflare Workers 代理与 D1 配置存储。

管理地址为 `https://你的-worker.workers.dev/admin/`，打开根地址也会进入管理页。客户端继续使用 `https://你的-worker.workers.dev/v1` 作为 OpenAI 兼容接口地址。

## 网页功能

- 表格展示替换规则，支持搜索，分页可选择每页 10、20 或 50 条。
- 通过弹窗添加和编辑规则，支持删除、启停及调整执行顺序。
- 用输入文本即时预览当前规则的替换结果。
- 设置上游基础地址和密钥，查看保存状态。
- 保存后立即用于后续请求。配置保存在 D1，代码重新部署会继续使用已保存的配置。
- 管理密码登录，登录状态使用 HttpOnly Cookie，有效期 8 小时。
- 在“AI 重写”页配置独立的 OpenAI 兼容接口、Key、模型、超时和 D1 缓存；可直接测试当前草稿的改写结果。

首次数据库迁移会将两条原有规则及七条 Chatbox 说明英文转中文规则写入 D1。规则按列表顺序进行区分大小写的文字替换，空的替换文字表示删除。管理页面会检查配置版本，多页面同时修改时提示重新加载，避免覆盖其他页面刚保存的内容。

## 首次部署

使用 Node.js 22.12 或更新版本。

```sh
npm install
npx wrangler login
npx wrangler d1 create prompt-replace
```

将创建命令返回的数据库 ID 填入 `wrangler.jsonc` 的 `d1_databases[0].database_id`，替换文件里的全零占位值。D1 绑定名保持 `DB`。

```sh
npm run db:remote
npm run deploy
npx wrangler secret put ADMIN_PASSWORD
```

最后一条命令输入独立的管理密码。也可以在 Cloudflare 控制台 Worker 的 Settings → Variables and Secrets 中设置 `ADMIN_PASSWORD` Secret。

打开 `/admin/`，登录后填写上游地址和密钥，编辑规则并点击保存。上游默认地址为 `http://104.168.101.204:8045/v1`。

上游密钥由服务端保存在 D1，管理接口仅返回是否设置密钥。网页保存时，密钥输入框留空会保留已保存值。需要清除时使用页面中的清除操作。`ADMIN_PASSWORD` 保存在 Worker Secret 中，修改管理密码后原登录 Cookie 会失效。

## 本地运行

```sh
npm install
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，设置 `ADMIN_PASSWORD`。上游地址、上游密钥和替换规则通过管理页保存到 D1。然后运行。

```sh
npm run dev
```

该命令依次构建管理页、应用本地 D1 迁移并启动 Worker。本地数据库保存在 `.wrangler/`，与线上 D1 分开。修改前端代码后重新运行 `npm run build`，刷新页面即可。

## 配置存储与升级

上游地址、上游密钥和替换规则统一保存在 D1。`wrangler.jsonc` 只配置 Worker、静态资源和 D1 绑定；`.dev.vars` 或 Worker Secret 中设置管理密码 `ADMIN_PASSWORD`。

`0002_initial_config.sql` 负责首次安装时写入默认地址及两条替换规则，上游密钥初始为空。已有配置记录时，该迁移会保留整条原记录。迁移完成后，请通过网页修改配置。

`0003_chatbox_chinese_replacements.sql` 添加七条 Chatbox 说明的中文替换，内容可在 `presets/chatbox-chinese.json` 查看。这些规则翻译记忆与运行时说明，保留 `save_memory` 等工具名称、`<memories>` 与 `<system-reminder>` 标签，以及实际模型名、会话开始时间和记忆内容。七条规则的替换文字均非空，规则在网页中可继续编辑、启停或删除。

该迁移按查找原文补齐缺少的规则，保留现有规则顺序、编号、启用状态和非空的自定义译文。相同查找原文的旧空替换会改成中文；此前已添加的整段记忆说明删除规则，以及已知四行结构的整段 Runtime 删除规则，也会改成对应的中文全文。Runtime 整段中已有的模型名和时间从匹配原文中保留，新增的标签替换规则适用于以后变化的模型名与会话时间。上游地址、密钥和无关规则不变；实际更新时配置版本递增，旧管理页面需重新加载后保存。

预置 JSON 用于查看和核对迁移内容，运行时始终读取 D1。迁移只应用一次，之后的规则调整通过网页保存，不会在每次请求时重新导入预置规则。

`0004_ai_system_rewrite.sql` 增加 AI 重写配置和模板缓存表。已有配置默认关闭 AI，原有接口、密钥及替换规则继续保留。应用迁移后打开“AI 重写”，填写实际模型服务的基础地址（例如 `https://api.example.com/v1`）和模型名称，测试结果后开启开关并点击“保存更改”。也支持填写完整的 `/chat/completions` 地址。AI Key 单独保存到 D1，留空会保留已存值，清除时需明确确认；无需鉴权的接口可不设置 Key。AI 请求不会沿用客户端或主上游的 Authorization。

### AI system 重写

开启后先执行现有普通替换，再对 JSON 中每条 `messages[role="system"].content` 进行 AI 改写。支持字符串，以及 `type="text"` / `type="input_text"` 的文本内容数组；非空的系统文本都会处理。AI 不改动用户消息、工具定义或请求参数，普通替换规则仍按原有范围执行。没有 system 的请求和非 JSON 请求维持原有转发方式。

重写器将说明文字改为含义一致的中文；已是中文的说明也要求同义改写。调用前会保护工具名称、代码、JSON 示例、标签、实际 `<memories>` 内容、模型名与时间等值，AI 只接收带占位符的模板。返回后检查标记的完整性、数量和顺序，再还原当前请求的数据。程序可以校验这些结构，不能保证模型对任意提示词都语义完全等价；重要提示词请先用页面的测试功能核对结果。

AI 重写为非流式 OpenAI Chat Completions 调用，返回内容应为 `{"rewritten":"..."}`。接口不应指向本代理自身，避免循环请求。主上游依然使用客户端原有的模型和流式参数，直接返回主上游的 Response。AI 错误、超时、输出不完整、占位符损坏或只返回原文时，程序返回带 `system_rewrite_*` 错误码及 `stage: "system_rewrite"` 的明确错误，不发送未经改写的原文。AI 开启时不支持压缩 JSON 正文，请发送未压缩的 JSON。

默认超时 90 秒，可设置 5–120 秒。D1 模板缓存默认启用、有效期 24 小时，可设置 1–720 小时。缓存键区分接口、模型、Key、模板及重写器版本；缓存保存带占位符的改写模板，动态值在当前请求中还原。同模板并发请求通过 D1 租约合并重写，避免同时调用多次 AI。关闭缓存时每个请求独立调用 AI。页面可查看缓存状态和清空缓存；保存新的接口、模型或 Key 后自动使用不同的缓存空间。

“测试 system 重写”使用当前草稿与已存 Key（如果未输入新 Key），无需先保存或启用；它只测试 AI 改写，不先应用普通替换规则。测试结果显示新生成或命中缓存，以及耗时。

已有版本升级时，运行以下命令。

```sh
npm run db:remote
npm run deploy
```

本地使用 `npm run db:local` 应用迁移。D1 中的空规则数组表示不执行普通文字替换；AI 关闭时直接透传正文，AI 开启时仍会重写 system。空上游密钥表示沿用客户端 Authorization。尚未保存上游地址或未绑定数据库时，代理会返回 503 并给出配置提示。

## 代理行为

- UTF-8 JSON 请求中只替换字符串值，字段名保持原值。替换字符串正确处理引号、换行和反斜杠，其余数字、空白及未命中字符串保留原始写法。
- UTF-8 `text/*` 请求直接替换文字。其他内容类型透传。AI 关闭时，压缩正文和无效 JSON 也透传；AI 开启时，压缩 JSON 返回 415，无效 JSON 或 UTF-8 返回 400。
- 按原方法、路径和查询参数转发，调整必要的传输请求头。上游基础地址以 `/v1` 结尾时，常见的 `/v1/chat/completions` 路径会保留单个 `/v1`。
- 使用已配置的上游密钥设置 Authorization。密钥为空时，沿用客户端 Authorization。
- 直接返回上游 Response，支持 SSE 流，保留上游状态、响应头和正文，包括 429、503、Retry-After 及重定向响应。每次只请求上游一次。
- `/admin/` 及其子路径供管理页使用，`/admin/api/` 为管理接口。

## 验证

```sh
npm run check
npm test
npm run build
npx wrangler deploy --dry-run
```

数据库结构位于 `migrations/0001_config.sql`。React 页面位于 `frontend/`，代理逻辑位于 `src/proxy.js`，管理接口位于 `src/admin.js`。
