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

首次数据库迁移会将两条英文转中文规则写入 D1。规则按列表顺序进行区分大小写的文字替换，空的替换文字表示删除。管理页面会检查配置版本，多页面同时修改时提示重新加载，避免覆盖其他页面刚保存的内容。

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

已有版本升级时，运行以下命令。

```sh
npm run db:remote
npm run deploy
```

本地使用 `npm run db:local` 应用迁移。D1 中的空规则数组表示直接透传正文，空上游密钥表示沿用客户端 Authorization。尚未保存上游地址或未绑定数据库时，代理会返回 503 并给出配置提示。

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

数据库结构位于 `migrations/0001_config.sql`。React 页面位于 `frontend/`，代理逻辑位于 `src/proxy.js`，管理接口位于 `src/admin.js`。
