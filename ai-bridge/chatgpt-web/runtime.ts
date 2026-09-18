/** CC GUI host for the unmodified MIT-licensed codex-chatgpt-web runtime. */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { defaultConfig, loadConfig, saveConfig, getConfigDir, getConfigPath, atomicWriteFile } from './upstream/src/config';
import { loginToChatGpt, browserLoginStateExists } from './upstream/src/browser-login';
import { responseRequest, compactRequest } from './upstream/src/server';
import { TurnBroker, closeTurnBrokers } from './upstream/src/adapters/chatgpt-web/turn-broker';
import { closeChatGptBrowserWorkers } from './upstream/src/adapters/chatgpt-web/browser-worker';
import { runChatGptMcpMain } from './upstream/src/adapters/chatgpt-web/mcp-main';
import { installTunnelClient, createTunnelConfig, installRuntimeKeyBytes, connectTunnel, stopTunnel, waitForTunnelReady } from './upstream/src/tunnel';
import { validateWebRequest, webModels } from './policy';

// This value is owned by this integration; never share another launcher's profile.
process.env.CODEX_CHATGPT_WEB_HOME = process.env.CCGUI_CHATGPT_WEB_HOME
  || join(homedir(), '.codemoss', 'chatgpt-web');
process.env.CODEX_CHATGPT_WEB_BUN = process.execPath;
delete process.env.CODEX_CHATGPT_WEB_LAUNCHER;
const command = process.argv[2] || 'serve';
if (command === 'mcp') {
  await runChatGptMcpMain(process.argv.slice(3));
} else {
  await main();
}

async function main() {
  let config;
  if (existsSync(getConfigPath())) {
    try {
      config = loadConfig();
    } catch (error) {
      // Older POC runs could persist full mode before a Tunnel existed. Repair
      // only that narrow state so login remains possible; reject other corrupt
      // or incompatible configurations instead of silently changing them.
      const raw = JSON.parse(readFileSync(getConfigPath(), 'utf8')) as Record<string, any>;
      if (raw.mode !== 'full' || raw.tunnel) throw error;
      raw.mode = 'browser-only';
      atomicWriteFile(getConfigPath(), JSON.stringify(raw, null, 2) + '\n');
      config = loadConfig();
    }
  } else {
    config = defaultConfig('browser-only');
    const candidates = [config.chromeExecutablePath,
      join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(process.env.LOCALAPPDATA || homedir(), 'Google', 'Chrome', 'Application', 'chrome.exe')];
    config.chromeExecutablePath = candidates.find(path => existsSync(path)) || candidates[0]!;
  }
  config.runtimeCommand = [process.execPath, import.meta.path];
  config.browserHost = 'managed-chrome';
  config.browserInteractionMode = 'automatic';
  config.autoApproveToolCalls = false;

  if (command === 'login') {
    config.mode = config.tunnel ? 'full' : 'browser-only';
    saveConfig(config);
    const result = await loginToChatGpt(config);
    config.solAvailable = result.solAvailable;
    config.extraHighAvailable = result.extraHighAvailable;
    config.proAvailable = result.proAvailable;
    saveConfig(config);
    return;
  }
  if (command === 'connect') {
    const input = JSON.parse(await Bun.stdin.text());
    // Validate before saving the credential or downloading the tunnel client.
    if (!/^tunnel_[a-f0-9]{32}$/.test(input.tunnelId || '')) throw new Error('Tunnel ID 格式错误');
    if (typeof input.key !== 'string' || !input.key.trim()) throw new Error('请填写 Tunnel API key');
    const binaryPath = await installTunnelClient();
    config.mode = 'full';
    config.tunnel = createTunnelConfig({ binaryPath, tunnelId: input.tunnelId,
      runtimeKeyFile: installRuntimeKeyBytes(input.key), profileName: 'ccgui-chatgpt-web', alias: 'ccgui-chatgpt-web' });
    config.automaticTunnel = config.tunnel;
    saveConfig(config);
    connectTunnel(config);
    await waitForTunnelReady(config);
    return;
  }
  if (command === 'reconnect') {
    config.mode = 'full';
    saveConfig(config);
    connectTunnel(config);
    await waitForTunnelReady(config);
    return;
  }
  if (command !== 'serve') throw new Error('Unknown command');

  config.mode = config.tunnel ? 'full' : 'browser-only';
  saveConfig(config);

  const token = randomBytes(32).toString('hex');
  const broker = TurnBroker.forSocket(config.brokerSocketPath);
  await broker.listen();
  let job = { running: false, message: '请先登录 ChatGPT，再连接 Tunnel。' };
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let tunnelReady = false;
  let activeTurns = 0;
  const selectionPath = join(getConfigDir(), 'selection.json');
  const selected = () => {
    const models = webModels(config);
    const id = existsSync(selectionPath) ? JSON.parse(readFileSync(selectionPath, 'utf8')).model : '';
    return models.find(model => model.id === id) || models.find(model => model.id === 'chatgpt-web/high') || models[0]!;
  };
  const state = () => ({ service: 'ccgui-chatgpt-web', upstream: '5.0.8', route: 'chatgpt-web-only',
    loggedIn: browserLoginStateExists(config), tunnelReady, ready: browserLoginStateExists(config) && tunnelReady,
    models: webModels(config), selected: selected(), job, activeTurns });
  const startJob = (action: string, payload: unknown = {}) => {
    if (job.running || activeTurns) throw new Error('请等待当前操作或聊天结束');
    job = { running: true, message: action === 'login'
      ? '请在弹出的专用浏览器中登录，看到聊天输入框后关闭该浏览器窗口，程序会自动验证。'
      : '正在连接 Tunnel（首次需要下载官方 tunnel-client）…' };
    child = Bun.spawn([process.execPath, import.meta.path, action], {
      env: process.env, stdin: new Blob([JSON.stringify(payload)]), stdout: 'ignore', stderr: 'pipe',
    });
    const running = child;
    void (async () => {
      // Drain stderr even on failure. Never return raw provider errors containing credentials.
      const stderr = new Response(running.stderr).text();
      const code = await running.exited;
      await stderr;
      config = loadConfig();
      if (action !== 'login') tunnelReady = code === 0;
      job = { running: false, message: code === 0 ? '操作成功。连接 Tunnel 后，请在 ChatGPT 中创建 Codex Native2 连接器。'
        : '操作失败：请检查浏览器是否完成登录、Tunnel ID/API key、网络连接后重试。未切换到 Codex。' };
      child = undefined;
    })().catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.error('[ChatGPT Web] settings operation monitor failed:', detail.slice(0, 240));
      job = { running: false, message: '操作失败，请重新打开设置页。' };
      child = undefined;
    });
  };
  const authenticated = (req: Request) => {
    const actual = Buffer.from(req.headers.get('authorization') || '');
    const expected = Buffer.from(`Bearer ${token}`);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, idleTimeout: 0, maxRequestBodySize: 24 * 1024 * 1024,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.hostname !== '127.0.0.1') return new Response('Invalid host', { status: 403 });
      if (req.headers.has('origin') && req.headers.get('origin') !== url.origin) return new Response('Invalid origin', { status: 403 });
      if (url.pathname === '/' && req.method === 'GET') return new Response(Bun.file(join(import.meta.dir, 'settings.html')), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" },
      });
      if (!authenticated(req)) return new Response('Unauthorized', { status: 401 });
      try {
        if (url.pathname === '/health' || url.pathname === '/settings/status') return Response.json(state());
        if (req.method === 'POST' && url.pathname.startsWith('/settings/')) {
          const input = await req.json();
          if (url.pathname === '/settings/login') startJob('login');
          else if (url.pathname === '/settings/connect') startJob('connect', input);
          else if (url.pathname === '/settings/reconnect') startJob('reconnect');
          else if (url.pathname === '/settings/model') {
            if (activeTurns || job.running) throw new Error('请等待当前操作结束');
            if (!webModels(config).some(model => model.id === input.model)) throw new Error('该账号不支持此网页模型');
            atomicWriteFile(selectionPath, JSON.stringify({ model: input.model }));
          } else return new Response('Not found', { status: 404 });
          return Response.json(state());
        }
        if (req.method === 'POST' && ['/v1/responses', '/v1/responses/compact'].includes(url.pathname)) {
          const body = await req.json();
          validateWebRequest(body, config);
          if (!state().ready || job.running) throw new Error('请先在 CC GUI 的 ChatGPT Web 设置页完成网页登录与 Tunnel 连接');
          activeTurns++;
          const upstream = new Request(req.url, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body), signal: req.signal });
          try {
            const result = url.pathname.endsWith('/compact') ? await compactRequest(upstream, config) : await responseRequest(upstream, config);
            if (!result.body) { activeTurns--; return result; }
            // Hold the busy count through the entire SSE stream, including cancellation.
            const reader = result.body.getReader();
            let finished = false;
            const finish = () => { if (!finished) { finished = true; activeTurns--; } };
            const stream = new ReadableStream({
              async pull(controller) { try { const item = await reader.read(); if (item.done) { finish(); controller.close(); } else controller.enqueue(item.value); }
                catch (error) { finish(); controller.error(error); } },
              async cancel(reason) { finish(); await reader.cancel(reason); },
            });
            return new Response(stream, { status: result.status, headers: result.headers });
          } catch (error) { activeTurns--; throw error; }
        }
        // No native Responses, search, image or models passthrough exists here.
        return Response.json({ error: { message: '此入口仅支持 ChatGPT 网页 Responses；未转发到 Codex。' } }, { status: 400 });
      } catch (error) {
        return Response.json({ error: { message: error instanceof Error ? error.message : 'ChatGPT Web 操作失败' } }, { status: 400 });
      }
    },
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  console.log(`CHATGPT_WEB_READY ${JSON.stringify({ baseUrl: baseUrl + '/v1', settingsUrl: baseUrl + '/#' + token, token })}`);
  if (config.tunnel && browserLoginStateExists(config)) startJob('reconnect');
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    child?.kill();
    await closeChatGptBrowserWorkers();
    await closeTurnBrokers();
    if (config.tunnel) { try { stopTunnel(config); } catch {} }
    await server.stop(true);
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  // Parent shutdown/IDE crash closes stdin, including Windows process-tree cleanup.
  void Bun.stdin.text().then(close);
}
