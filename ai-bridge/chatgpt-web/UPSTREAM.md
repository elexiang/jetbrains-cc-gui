# Vendored source

Source: https://github.com/miuuyy/codex-chatgpt-web
Release: v5.0.8
Commit: 00aab23eb78a0d35ab575ff14044e29c0f80e711
License: MIT (see upstream/LICENSE and upstream/LICENSES).

The upstream src tree is imported unchanged. CC GUI's runtime.ts invokes its
Responses handlers, browser login and MCP broker directly. It does not execute
upstream setup or install a global Codex route. Native model passthrough endpoints
are not exposed. Runtime and dependencies are built locally from pinned sources.

Windows x64 build: install Bun 1.4.0; run `bun install --production
--frozen-lockfile --ignore-scripts` in upstream; place Bun in runtime/bun.exe.
Node modules and the Bun runtime are packaged with the plugin, not committed.
