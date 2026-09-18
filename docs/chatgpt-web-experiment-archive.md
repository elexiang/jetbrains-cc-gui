# ChatGPT Web 实验归档（2026-09-18）

用户决定暂停使用 ChatGPT 普通聊天额度进行代码开发。此分支仅保留实验，
不进入个人主线发行包，也不代表可安全使用或已完成真实账号验收。

上游源码固定为 miuuyy/codex-chatgpt-web v5.0.8，MIT，
提交 00aab23eb78a0d35ab575ff14044e29c0f80e711。
本分支同时保存早期 fake proxy、原生登录尝试、网页迁移代码和测试，供后续梳理。
依赖及 Bun 二进制未提交；重建说明见 ai-bridge/chatgpt-web/UPSTREAM.md。

## 恢复开发前必须处理

- 浏览器 storageState 和 Tunnel runtime key 明文落盘；Windows ACL 未收紧。
- Windows 登录导出未调用域名过滤函数，可能连同第三方登录站点会话一起保存。
- 客户端只覆盖 openai_base_url，未强制选定独立 model_provider；不能据此保证
  所有请求都进入网页服务。服务端拒绝普通模型的测试不等于端到端额度证明。
- MCP 具备命令执行和文件修改能力，需验证外层权限与 Windows 命名管道边界。
- 尚未完成真实账号登录后的出站流量、全部依赖和二进制安全审计。
- 0.5.6.4 ZIP 的 SHA-256 为
  563955a6a7533cd30af3d21947fba6cf1f34975c83c88bfcc113632e89fbb7cd；
  1840bc7bc3d6f78e0209a3c7a428ca86ec8ba04d2ddebc8752af24de8ffa77bc
  是其中 ai-bridge.zip 的哈希，之前交付说明混淆了二者。

尚未验证完整网页改代码链路及实际额度归属。旧文档中的成功或无回退表述，
应以本归档的限制为准。不得将个人登录信息、浏览器目录或 key 提交到仓库。
