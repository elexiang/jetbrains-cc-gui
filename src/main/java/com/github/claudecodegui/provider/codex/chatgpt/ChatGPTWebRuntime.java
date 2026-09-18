package com.github.claudecodegui.provider.codex.chatgpt;

import com.github.claudecodegui.bridge.BridgeDirectoryResolver;
import com.github.claudecodegui.bridge.EnvironmentConfigurator;
import com.github.claudecodegui.startup.BridgePreloader;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/** 管理插件内置的 ChatGPT 网页运行时，不修改全局 Codex 路由或复用 OAuth 凭据。 */
public final class ChatGPTWebRuntime {
    private static Process process;
    private static JsonObject address;

    static {
        Runtime.getRuntime().addShutdownHook(new Thread(ChatGPTWebRuntime::stop, "ccgui-web-shutdown"));
    }

    private ChatGPTWebRuntime() { }

    public static synchronized void start() throws Exception {
        if (process != null && process.isAlive() && address != null) {
            return;
        }
        stop();
        BridgeDirectoryResolver resolver = BridgePreloader.getSharedResolver();
        File bridge = resolver == null ? null : resolver.findSdkDir();
        if (bridge == null) {
            throw new IOException("ChatGPT Web: ai-bridge 尚未准备完成，请稍后重试");
        }
        File directory = new File(bridge, "chatgpt-web");
        File bun = new File(directory, "runtime/bun.exe");
        File script = new File(directory, "runtime.ts");
        if (!bun.isFile() || !script.isFile()) {
            throw new IOException("ChatGPT Web 运行时缺失；此测试包需要 Windows x64");
        }
        ProcessBuilder builder = new ProcessBuilder(bun.getAbsolutePath(), script.getAbsolutePath(), "serve");
        builder.directory(directory);
        EnvironmentConfigurator.withoutSettingsService().updateProcessEnvironment(builder, bun.getAbsolutePath());
        builder.environment().remove("OPENAI_API_KEY");
        builder.environment().remove("CODEX_API_KEY");
        builder.redirectErrorStream(true);
        Process started = builder.start();
        process = started;
        CompletableFuture<JsonObject> ready = new CompletableFuture<>();
        Thread reader = new Thread(() -> {
            try (BufferedReader lines = new BufferedReader(new InputStreamReader(started.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = lines.readLine()) != null) {
                    if (line.startsWith("CHATGPT_WEB_READY ")) {
                        ready.complete(JsonParser.parseString(line.substring("CHATGPT_WEB_READY ".length())).getAsJsonObject());
                    }
                    // Do not log startup output: the ready message contains a local capability token.
                }
                ready.completeExceptionally(new IOException("ChatGPT Web 运行时提前退出"));
            } catch (Exception e) {
                ready.completeExceptionally(e);
            }
        }, "ccgui-web-output");
        reader.setDaemon(true);
        reader.start();
        try {
            JsonObject result = ready.get(30, TimeUnit.SECONDS);
            URI base = URI.create(result.get("baseUrl").getAsString());
            if (!"http".equals(base.getScheme()) || !"127.0.0.1".equals(base.getHost()) || base.getPort() <= 0) {
                throw new IOException("ChatGPT Web 返回无效本地地址");
            }
            address = result;
        } catch (Exception e) {
            stop();
            throw e;
        }
    }

    public static synchronized String settingsUrl() throws Exception {
        start();
        return address.get("settingsUrl").getAsString();
    }

    /** 请求开始前确认本地服务身份、账号状态及实际网页模型。 */
    public static synchronized JsonObject prepareRequest() throws Exception {
        start();
        String base = address.get("baseUrl").getAsString();
        HttpURLConnection connection = (HttpURLConnection) URI.create(base.replaceFirst("/v1$", "/health"))
                .toURL().openConnection(Proxy.NO_PROXY);
        connection.setConnectTimeout(3000);
        connection.setReadTimeout(3000);
        connection.setRequestProperty("Authorization", "Bearer " + address.get("token").getAsString());
        try (InputStreamReader input = new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)) {
            JsonObject status = JsonParser.parseReader(input).getAsJsonObject();
            if (!"ccgui-chatgpt-web".equals(status.get("service").getAsString()) || !status.get("ready").getAsBoolean()) {
                throw new IOException("请打开设置 → Codex 提供商 → ChatGPT Web → 登录与设置，完成网页登录和 Tunnel 连接。未调用 Codex。");
            }
            JsonObject selected = status.getAsJsonObject("selected");
            if (!selected.get("id").getAsString().startsWith("chatgpt-web/")) {
                throw new IOException("拒绝非网页模型；未调用 Codex");
            }
            JsonObject result = selected.deepCopy();
            result.addProperty("baseUrl", base);
            result.addProperty("token", address.get("token").getAsString());
            return result;
        } finally {
            connection.disconnect();
        }
    }

    public static synchronized void stop() {
        if (process != null) {
            try {
                process.getOutputStream().close();
                if (!process.waitFor(3, TimeUnit.SECONDS)) {
                    process.descendants().forEach(ProcessHandle::destroy);
                    process.destroy();
                }
            } catch (Exception e) {
                process.destroy();
            }
        }
        process = null;
        address = null;
    }
}
