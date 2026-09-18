# ChatGPT 网页方案：账号准备入口

上游版本：miuuyy/codex-chatgpt-web v5.0.8。
这份说明用于安装包中的 ChatGPT Web 设置页；插件会自己启动上游运行时，不需要另装
Codex Web GPT launcher。

1. 在插件设置 → Codex 提供商 → **ChatGPT Chat** 点击“登录与设置 / Setup”。
   点击“打开网页登录”，在弹出的专用浏览器中登录 ChatGPT；看到聊天输入框后关闭窗口，
   等待状态变为已验证。外部浏览器或 Codex 中已有的登录不会自动转移到这里。
2. 在设置页中创建 Tunnel 和所需的 API key，填入 Tunnel ID 与 key，点击“保存并连接
   Tunnel”。首次连接会从上游固定版本下载 tunnel-client 并校验 SHA-256；不要把 key
   发到聊天里。
   - Tunnel：https://platform.openai.com/settings/organization/tunnels
   - API key：https://platform.openai.com/settings/organization/api-keys
4. 打开 ChatGPT 的应用设置，启用 **Developer Mode**，创建新连接器：
   - 名称必须为 **Codex Native2**。
   - 选择刚创建的 Tunnel。
   - Authentication：**None**。
   - 按上游要求设置 **Allow all actions**。此连接器提供本地工具访问，工具实际执行
     仍受外层 Codex 权限控制。
   - 设置入口：https://chatgpt.com/#settings/Plugins
5. 回到设置页确认“网页登录：已验证”“Tunnel：已连接”，选择网页模型并保存；然后在
   CC GUI 中启用 ChatGPT Chat，**新建会话**后发送一个小型代码修改任务。

安装包不会运行上游的 **Install models / Repair Codex setup**，也不会改写本机 Codex
路由；ChatGPT Web 的 localhost Responses 请求和本地 token 只在当前插件进程生效。

只有 `chatgpt-web/*` 模型会走网页路径；普通 GPT 模型不会从该设置页转发到 Codex。

原版说明：https://github.com/miuuyy/codex-chatgpt-web/blob/v5.0.8/TROUBLESHOOTING.md
