# PromptReplace

React + shadcn/ui + Tailwind CSS 管理页，Cloudflare Workers 代理与 D1 配置存储。按已保存规则查找替换请求中的文字，然后转发至上游，直接返回上游响应。

管理地址为 `https://你的-worker.workers.dev/admin/`，打开根地址也会进入管理页。客户端继续使用 `https://你的-worker.workers.dev/v1` 作为 OpenAI 兼容接口地址。

## 网页功能

- 表格展示替换规则，支持搜索，分页可选择每页 10、20 或 50 条。
- 通过弹窗添加和编辑规则，支持删除、启停及调整执行顺序。
- 紧凑图标导航默认宽 64px，可展开查看名称，手机使用抽屉导航。
- “拦截管理”自动收集上游 HTTP 429 请求的 system 文本，支持搜索、分页、查看原文、复制、备注、标记已排查和删除记录。
- 设置上游基础地址和密钥，查看保存状态。
- 保存后立即用于后续请求。配置保存在 D1，代码重新部署会继续使用已保存的配置。
- 管理密码登录，登录状态使用 HttpOnly Cookie，有效期 8 小时。

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

上游密钥由服务端保存在 D1，管理接口仅返回是否设置密钥。网页保存时，密钥输入框留空会保留已保存值。需要清除时使用页面中的清除操作。`ADMIN_PASSWORD` 可保存在 Worker Secret 中，修改管理密码后原登录 Cookie 会失效。

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

上游地址、上游密钥和替换规则统一保存在 D1。`wrangler.jsonc` 配置 Worker、静态资源和 D1 绑定；本地在 `.dev.vars` 设置管理密码 `ADMIN_PASSWORD`，线上可使用 Worker Secret，已有的管理密码配置可继续使用。

`0002_initial_config.sql` 负责首次安装时写入默认地址及两条替换规则，上游密钥初始为空。已有配置记录时，该迁移会保留整条原记录。迁移完成后，请通过网页修改配置。

`0003_chatbox_chinese_replacements.sql` 添加七条 Chatbox 说明的中文替换，内容可在 `presets/chatbox-chinese.json` 查看。这些规则翻译记忆与运行时说明，保留 `save_memory` 等工具名称、`<memories>` 与 `<system-reminder>` 标签，以及实际模型名、会话开始时间和记忆内容。七条规则的替换文字均非空，规则在网页中可继续编辑、启停或删除。

该迁移按查找原文补齐缺少的规则，保留现有规则顺序、编号、启用状态和非空的自定义译文。相同查找原文的旧空替换会改成中文；此前已添加的整段记忆说明删除规则，以及已知四行结构的整段 Runtime 删除规则，也会改成对应的中文全文。Runtime 整段中已有的模型名和时间从匹配原文中保留，新增的标签替换规则适用于以后变化的模型名与会话时间。上游地址、密钥和无关规则不变；实际更新时配置版本递增，旧管理页面需重新加载后保存。

预置 JSON 用于查看和核对迁移内容，运行时始终读取 D1。迁移只应用一次，之后的规则调整通过网页保存，不会在每次请求时重新导入预置规则。

`0004_ai_system_rewrite.sql` 作为已发布的历史迁移保留。`0005_remove_ai_system_rewrite.sql` 移除旧的 AI 配置字段及模板缓存表，保留上游地址、上游密钥、规则、配置版本和更新时间。程序只执行普通文字替换，管理接口也不再提供 AI 配置、测试或缓存功能。

`0006_interceptions.sql` 新增 429 关联记录表，不改动已保存的替换规则、上游地址和密钥。先应用该迁移，再部署新版 Worker。

已有版本升级时，先应用远程 D1 迁移，再部署。此前尚未执行 `0004` 的数据库也使用同一命令，Wrangler 会按顺序补齐未执行的迁移，不要跳过或删除历史迁移文件。

```sh
npm run db:remote
npm run deploy
```

`npm run db:remote` 对应 `wrangler d1 migrations apply DB --remote`。请确认使用原来的 D1 数据库绑定，保留已保存的配置。升级后刷新管理页面。

本地使用 `npm run db:local` 应用迁移。D1 中的空规则数组表示直接透传正文，空上游密钥表示沿用客户端 Authorization。尚未保存上游地址或未绑定数据库时，代理会返回 503 并给出配置提示。

## 拦截管理

代理收到上游实际 HTTP 429 后，收集有效、未压缩 JSON 请求的 `messages` 中 `role: "system"` 的文本。字符串内容和 `text` / `input_text` 分片均支持。每条 system 消息单独记录，同一请求内相同的 system 只计一次。HTTP 503、HTTP 200 的 SSE 内嵌错误、没有 system 的请求以及无法解析的正文不会生成记录。

去重键是实际转发给上游的完整 system 文本的 SHA-256，区分空白和大小写，不区分模型。相同内容重复返回 429 时，只递增原记录次数并更新最近时间、最近模型和最近一次替换前原文，保留首次时间、排查状态及备注。一次请求包含多个不同 system 时，各记录分别累计关联次数，所以页面的累计关联次数不等于 HTTP 请求总数。

详情同时显示实际转发内容与最近一次替换前原文，便于核对替换规则的作用。只保存 system 文本和模型、路径、时间等关联信息，不保存用户消息、工具定义或鉴权请求头。为符合 D1 单行大小限制，每列文本最多保留 850 KiB UTF-8 内容；超出时明确标记截断并显示原始字符数，去重仍使用完整内容。

非空 system 被普通替换规则全部删成空文本时，仍保留原文与空转发文本供排查；原文及转发内容均为空白的消息跳过。

记录通过 `ctx.waitUntil` 后台写入。写入失败会输出通用服务日志，不改变上游 429 响应；响应正文、状态码、响应头和 SSE 转发方式保持原样。列表使用管理页登录认证，排查状态、备注和删除操作独立即时保存，顶部配置保存按钮只用于规则与上游配置。

## 代理行为

- UTF-8 JSON 请求中只替换字符串值，字段名保持原值。替换字符串正确处理引号、换行和反斜杠，其余数字、空白及未命中字符串保留原始写法。
- UTF-8 `text/*` 请求直接替换文字。其他内容类型、压缩正文和无效 JSON 透传。
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

数据库结构及升级脚本位于 `migrations/`。React 页面位于 `frontend/`，代理逻辑位于 `src/proxy.js`，429 记录逻辑位于 `src/interceptions.js`，管理接口位于 `src/admin.js`。
