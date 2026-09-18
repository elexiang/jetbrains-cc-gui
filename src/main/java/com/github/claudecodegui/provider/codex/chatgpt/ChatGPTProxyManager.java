package com.github.claudecodegui.provider.codex.chatgpt;

import com.github.claudecodegui.bridge.BridgeDirectoryResolver;
import com.github.claudecodegui.bridge.EnvironmentConfigurator;
import com.github.claudecodegui.bridge.NodeDetector;
import com.github.claudecodegui.startup.BridgePreloader;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.intellij.openapi.diagnostic.Logger;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Owns the localhost fake Responses server used by the first ChatGPT Chat
 * provider proof of concept.
 *
 * <p>The process is shared because the settings facade is intentionally cheap
 * and a new {@code CodemossSettingsService} is created by each Codex request.
 * The proxy only binds to loopback and does not receive or persist credentials.
 */
public class ChatGPTProxyManager {
    private static final Logger LOG = Logger.getInstance(ChatGPTProxyManager.class);
    private static final Object PROCESS_LOCK = new Object();
    private static final String PROXY_SCRIPT = "chatgpt-proxy/fake-responses-server.js";
    private static final String LOOPBACK_HOST = "127.0.0.1";
    private static final long START_TIMEOUT_SECONDS = 10L;
    private static final long HEALTH_TIMEOUT_MILLIS = 1_000L;

    private static volatile Process sharedProcess;
    private static volatile int sharedPort;

    private final NodeDetector nodeDetector;
    private final EnvironmentConfigurator environmentConfigurator;

    public ChatGPTProxyManager() {
        this(NodeDetector.getInstance(), EnvironmentConfigurator.withoutSettingsService());
    }

    ChatGPTProxyManager(NodeDetector nodeDetector, EnvironmentConfigurator environmentConfigurator) {
        this.nodeDetector = nodeDetector;
        this.environmentConfigurator = environmentConfigurator;
    }

    static {
        Runtime.getRuntime().addShutdownHook(new Thread(ChatGPTProxyManager::stopSharedProcess,
                "ccgui-chatgpt-proxy-shutdown"));
    }

    /** Start the proxy on an available loopback port. */
    public void start() throws IOException {
        start(0);
    }

    /**
     * Start the proxy, reusing a previously persisted port when one is known.
     * A value of {@code 0} asks the operating system to choose a free port.
     */
    public void start(int preferredPort) throws IOException {
        synchronized (PROCESS_LOCK) {
            if (isSharedProcessUsable(preferredPort) && healthCheck(getBaseUrl())) {
                return;
            }
            stopSharedProcessLocked();

            String node = nodeDetector.findNodeExecutable();
            if (node == null || node.trim().isEmpty()) {
                throw new IOException("Node.js is required to start the ChatGPT Chat proxy");
            }

            BridgeDirectoryResolver resolver = BridgePreloader.getSharedResolver();
            File bridgeDirectory = resolver != null ? resolver.findSdkDir() : null;
            if (bridgeDirectory == null || !bridgeDirectory.isDirectory()) {
                throw new IOException("ai-bridge directory is not ready");
            }

            File script = new File(bridgeDirectory, PROXY_SCRIPT);
            if (!script.isFile()) {
                throw new IOException("ChatGPT proxy script is missing: " + script.getAbsolutePath());
            }

            List<String> command = new ArrayList<>(NodeDetector.buildNodeScriptCommand(
                    node, script.getAbsolutePath()));
            command.add("--host");
            command.add(LOOPBACK_HOST);
            command.add("--port");
            command.add(String.valueOf(Math.max(0, preferredPort)));

            ProcessBuilder processBuilder = new ProcessBuilder(command);
            processBuilder.directory(bridgeDirectory);
            processBuilder.redirectErrorStream(true);
            environmentConfigurator.updateProcessEnvironment(processBuilder, node);

            Process process = processBuilder.start();
            CountDownLatch readyLatch = new CountDownLatch(1);
            ProxyAddress[] addressHolder = new ProxyAddress[1];
            Thread outputThread = new Thread(() -> readStartupOutput(
                    process, readyLatch, addressHolder), "ccgui-chatgpt-proxy-output");
            outputThread.setDaemon(true);
            outputThread.start();

            try {
                if (!readyLatch.await(START_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                    stopProcess(process);
                    throw new IOException("ChatGPT Chat proxy did not become ready within "
                            + START_TIMEOUT_SECONDS + " seconds");
                }
                ProxyAddress address = addressHolder[0];
                if (address == null || address.port <= 0 || !healthCheck(address.baseUrl)) {
                    stopProcess(process);
                    throw new IOException("ChatGPT Chat proxy failed its localhost health check");
                }

                sharedProcess = process;
                sharedPort = address.port;
                LOG.info("[ChatGPTProxy] Started fake Responses proxy at " + address.baseUrl);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                stopProcess(process);
                throw new IOException("Interrupted while starting ChatGPT Chat proxy", e);
            }
        }
    }

    /** Stop the shared proxy if it is running. */
    public void stop() {
        synchronized (PROCESS_LOCK) {
            stopSharedProcessLocked();
        }
    }

    /** Restart the shared proxy on a fresh port. */
    public void restart() throws IOException {
        stop();
        start();
    }

    public boolean isRunning() {
        Process process = sharedProcess;
        return process != null && process.isAlive() && sharedPort > 0;
    }

    public int getPort() {
        return sharedPort;
    }

    public String getBaseUrl() {
        return sharedPort > 0 ? "http://" + LOOPBACK_HOST + ":" + sharedPort + "/v1" : "";
    }

    /** Check the proxy health endpoint without starting a process. */
    public boolean healthCheck() {
        return isRunning() && healthCheck(getBaseUrl());
    }

    private static boolean isSharedProcessUsable(int preferredPort) {
        Process process = sharedProcess;
        if (process == null || !process.isAlive() || sharedPort <= 0) {
            return false;
        }
        return preferredPort <= 0 || preferredPort == sharedPort;
    }

    private void readStartupOutput(Process process, CountDownLatch readyLatch, ProxyAddress[] addressHolder) {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("CHATGPT_PROXY_READY ")) {
                    try {
                        JsonObject address = JsonParser.parseString(
                                line.substring("CHATGPT_PROXY_READY ".length())).getAsJsonObject();
                        addressHolder[0] = new ProxyAddress(
                                address.get("port").getAsInt(),
                                address.get("baseUrl").getAsString());
                        readyLatch.countDown();
                    } catch (Exception e) {
                        LOG.warn("[ChatGPTProxy] Invalid ready message: " + line, e);
                        readyLatch.countDown();
                    }
                } else if (line.startsWith("CHATGPT_PROXY_ERROR ")) {
                    LOG.warn("[ChatGPTProxy] " + line);
                    readyLatch.countDown();
                } else if (!line.isBlank()) {
                    LOG.debug("[ChatGPTProxy] " + line);
                }
            }
        } catch (IOException e) {
            LOG.debug("[ChatGPTProxy] Output reader stopped: " + e.getMessage());
        } finally {
            readyLatch.countDown();
        }
    }

    private static boolean healthCheck(String baseUrl) {
        HttpURLConnection connection = null;
        try {
            URL healthUrl = URI.create(baseUrl.replaceFirst("/v1$", "/health")).toURL();
            connection = (HttpURLConnection) healthUrl.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout((int) HEALTH_TIMEOUT_MILLIS);
            connection.setReadTimeout((int) HEALTH_TIMEOUT_MILLIS);
            return connection.getResponseCode() == HttpURLConnection.HTTP_OK;
        } catch (Exception e) {
            return false;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static void stopSharedProcess() {
        synchronized (PROCESS_LOCK) {
            stopSharedProcessLocked();
        }
    }

    private static void stopSharedProcessLocked() {
        Process process = sharedProcess;
        sharedProcess = null;
        sharedPort = 0;
        if (process != null) {
            stopProcess(process);
        }
    }

    private static void stopProcess(Process process) {
        if (!process.isAlive()) {
            return;
        }
        process.destroy();
        try {
            if (!process.waitFor(2, TimeUnit.SECONDS) && process.isAlive()) {
                process.destroyForcibly();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
    }

    private static final class ProxyAddress {
        private final int port;
        private final String baseUrl;

        private ProxyAddress(int port, String baseUrl) {
            this.port = port;
            this.baseUrl = baseUrl;
        }
    }
}
