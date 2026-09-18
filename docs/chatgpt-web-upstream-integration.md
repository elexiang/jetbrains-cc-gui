# ChatGPT 普通聊天接入：上游核查记录

核查日期：2026-09-18。目标是使用 ChatGPT Web 普通聊天执行代码任务；现有
`__chatgpt_chat__` → Codex 原生登录实现不满足目标，不能作为验收通过的版本。

## 采用的上游

- 仓库：https://github.com/miuuyy/codex-chatgpt-web
- 初始 main 核查提交：`e0904bc82001f06e06e7f85f564ce760c92bfd79`。
- 已将参考源码固定到发布 `v5.0.8`，对应提交
  `00aab23eb78a0d35ab575ff14044e29c0f80e711`，并重新核查模型路由分支。
- MIT 许可证；移植源代码时必须保留版权及许可证，并核查其第三方依赖声明。
- 本地参考源码：`C:/Users/Administrator/.codex/worktrees/7cb1/codex-chatgpt-web-reference`。

## 源码确认的接入合同

1. `src/server.ts` 提供 `/v1/responses`、`/v1/responses/compact` 和 `/healthz`。
2. `responseRequest` 和 `compactRequest` 对非 `chatgpt-web/*` 模型执行
   `forwardNativeCodexRequest`。仅把请求指向它的 localhost 服务不能保证走网页。
3. `src/chatgpt-web-models.ts` 定义网页模型及固定推理档位；必须使用该服务实际发布、
   账户实际支持的模型 ID，不能沿用插件中的普通 GPT 模型 ID。
4. `browser-only` 模式没有本地工具。完整修改代码需要 `full` 模式，通过
   `Codex Native2` 连接器和 OpenAI tunnel 将工具调用送回本地 Codex harness。
5. 上游还有原生搜索、图像接口转发。严格限定普通聊天额度时，需要明确阻断这些
   原生转发路径，不能默认把上游全部端点开放给插件。
6. 独立浏览器登录不是 `.codex/auth.json` 中的 Codex OAuth 登录。
   本次检查本机尚无 `.codex-chatgpt-web/config.json`。

## 当前实现与验收

已将 v5.0.8 的 MIT 源码直接 vendored 到插件的 `ai-bridge/chatgpt-web/upstream`，
由插件自己的 Java 生命周期启动 Bun 运行时；不安装上游桌面 launcher，也不修改
`~/.codex/config.toml` 或 `~/.codex/auth.json`。插件侧增加了登录/Tunnel 设置页、网页模型
选择、请求边界校验和本地回环 token。

完整代码修改链路为：ChatGPT Web 独立浏览器登录 → 上游网页适配器 → ChatGPT Native2
连接器回调本地 MCP Tunnel → CC GUI 本地工具执行。只有 `chatgpt-web/*` 模型进入这条路由，
普通 GPT/Codex 模型和原生搜索、图像、计算机工具不会从该入口转发。

验收必须同时满足：网页中可确认任务实际发送；测试目录中发生预期的文件修改；
记录实际网页模型和路由；同账号其他 Codex/Work 任务停止时，对照用量记录。
百分比不变可能只是四舍五入或更新延迟，不能单独作为没有扣费的证明。
日志不得记录 token、cookie、tunnel key 或原始凭据。

上游 `docs/release-validation.md` 明确说明 CI 不证明账户登录、MCP 或完整任务成功。
其 Windows v3.0.0 维护者实测记录不能替代本机 v5.0.8 的验证。

## 本次状态

源码移植、许可证保留、Windows x64 Bun 运行时、Java 生命周期、设置入口和本地
Responses 边界已完成；已通过 Java 编译、运行时启动、网页模型策略和“普通 GPT 被拒绝”
测试。真实 ChatGPT 账号登录、Tunnel/Native2 连接器和实际代码修改仍需在安装包中由账号
本人完成，这三项属于外部账号状态，不能由离线构建替代。实际网页任务仍应以 ChatGPT
网页侧会话/用量页面和测试目录文件变更做最终验收。
