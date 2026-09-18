package com.github.claudecodegui.settings;

import com.github.claudecodegui.provider.codex.chatgpt.ChatGPTProxyManager;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

public class CodexProviderManagerChatGPTTest {
    private Path tempCodexDir;
    private AtomicReference<JsonObject> config;
    private CodexSettingsManager settingsManager;
    private FakeChatGPTProxyManager proxyManager;

    @Before
    public void setUp() throws Exception {
        tempCodexDir = Files.createTempDirectory("codex-chatgpt-provider-home")
                .resolve(".codex");
        Files.createDirectories(tempCodexDir);
        settingsManager = new CodexSettingsManager(new Gson(), tempCodexDir);
        proxyManager = new FakeChatGPTProxyManager();
        config = new AtomicReference<>(configWithProvider());
        Files.writeString(
                tempCodexDir.resolve("config.toml"),
                "[mcp_servers.keep]\ncommand = \"node\"\n"
                        + "[[skills.config]]\npath = \"C:/skills/review/SKILL.md\"\nenabled = false\n",
                StandardCharsets.UTF_8
        );
    }

    @After
    public void tearDown() throws Exception {
        if (tempCodexDir != null) {
            Path tempHome = tempCodexDir.getParent();
            if (tempHome != null && Files.exists(tempHome)) {
                Files.walk(tempHome)
                        .sorted(Comparator.reverseOrder())
                        .forEach(path -> {
                            try {
                                Files.deleteIfExists(path);
                            } catch (IOException ignored) {
                                // Best-effort cleanup for the temporary test home.
                            }
                        });
            }
        }
    }

    @Test
    public void exposesLoginProviderWithoutPersistingItAndPreservesGlobalConfig() throws Exception {
        CodexProviderManager manager = manager();

        manager.switchCodexProvider(CodexProviderManager.CHATGPT_CHAT_PROVIDER_ID);

        JsonObject codex = config.get().getAsJsonObject("codex");
        assertEquals(CodexProviderManager.CHATGPT_CHAT_PROVIDER_ID, codex.get("current").getAsString());
        assertFalse(codex.getAsJsonObject("providers")
                .has(CodexProviderManager.CHATGPT_CHAT_PROVIDER_ID));

        JsonObject virtualProvider = manager.getCodexProviders().stream()
                .filter(provider -> CodexProviderManager.CHATGPT_CHAT_PROVIDER_ID
                        .equals(provider.get("id").getAsString()))
                .findFirst()
                .orElse(null);
        assertNotNull(virtualProvider);
        assertTrue(virtualProvider.get("isVirtualProvider").getAsBoolean());
        assertTrue(virtualProvider.get("isChatGPTChatProvider").getAsBoolean());
        assertTrue(virtualProvider.get("isChatGPTLoginProvider").getAsBoolean());
        assertTrue(virtualProvider.get("isActive").getAsBoolean());

        Map<String, Object> written = settingsManager.readConfigToml();
        assertFalse(written.containsKey("model"));
        assertFalse(written.containsKey("model_provider"));
        assertTrue(written.containsKey("mcp_servers"));
        assertTrue(written.containsKey("skills"));
        assertEquals(0, proxyManager.startCount);
        assertEquals("login", config.get().getAsJsonObject("codex")
                .get("chatGPTChatMode").getAsString());
    }

    @Test
    public void stopsSharedProxyAfterSwitchingAwayFromVirtualProvider() throws Exception {
        CodexProviderManager manager = manager();

        manager.switchCodexProvider(CodexProviderManager.CHATGPT_CHAT_PROVIDER_ID);
        manager.switchCodexProvider("provider-a");

        assertEquals("provider-a", config.get().getAsJsonObject("codex")
                .get("current").getAsString());
        assertEquals(1, proxyManager.stopCount);
        Map<String, Object> written = settingsManager.readConfigToml();
        assertEquals("provider-a-model", written.get("model"));
        assertTrue(written.containsKey("mcp_servers"));
        assertTrue(written.containsKey("skills"));
    }

    @Test
    public void migratesLegacyFakeStateToChatGPTLoginAndRestoresAuthBackup() throws Exception {
        JsonObject legacyProvider = new JsonObject();
        legacyProvider.addProperty("id", CodexProviderManager.CHATGPT_CHAT_PROVIDER_ID);
        legacyProvider.addProperty(
                "configToml",
                "model = \"chatgpt-fake-model\"\n"
                        + "model_provider = \"chatgpt-chat\"\n\n"
                        + "[model_providers.chatgpt-chat]\n"
                        + "base_url = \"http://127.0.0.1:43123/v1\"\n"
                        + "wire_api = \"responses\"\n"
                        + "requires_openai_auth = false\n"
        );
        settingsManager.transitionProvider(null, legacyProvider, false, () -> { });
        JsonObject persisted = config.get().getAsJsonObject("codex");
        persisted.addProperty("current", CodexProviderManager.CHATGPT_CHAT_PROVIDER_ID);
        persisted.addProperty("appliedProviderId", CodexProviderManager.CHATGPT_CHAT_PROVIDER_ID);
        persisted.addProperty("appliedProviderRevision", "legacy");
        Files.writeString(
                tempCodexDir.resolve("auth.json.cli_backup"),
                "{\"auth_mode\":\"chatgpt\",\"tokens\":{\"access_token\":\"restored\"}}",
                StandardCharsets.UTF_8
        );

        CodexProviderManager manager = manager();
        manager.migrateLegacyChatGPTChatProvider();

        JsonObject codex = config.get().getAsJsonObject("codex");
        assertEquals("login", codex.get("chatGPTChatMode").getAsString());
        assertEquals(CodexProviderManager.CHATGPT_CHAT_PROVIDER_ID,
                codex.get("current").getAsString());
        assertFalse(codex.has("appliedProviderId"));
        assertFalse(settingsManager.readConfigToml().containsKey("model_provider"));
        assertEquals("restored", settingsManager.readAuthJson()
                .getAsJsonObject("tokens").get("access_token").getAsString());
        assertFalse(Files.exists(tempCodexDir.resolve("auth.json.cli_backup")));
        assertEquals(1, proxyManager.stopCount);
    }

    private CodexProviderManager manager() {
        return new CodexProviderManager(
                ignored -> config.get().deepCopy(),
                config::set,
                new ConfigPathManager(),
                settingsManager,
                proxyManager
        );
    }

    private JsonObject configWithProvider() {
        JsonObject provider = new JsonObject();
        provider.addProperty("id", "provider-a");
        provider.addProperty("name", "Provider A");
        provider.addProperty("configToml", "model = \"provider-a-model\"\n");

        JsonObject providers = new JsonObject();
        providers.add("provider-a", provider);
        JsonObject codex = new JsonObject();
        codex.addProperty("current", "");
        codex.add("providers", providers);
        JsonObject configObject = new JsonObject();
        configObject.add("codex", codex);
        return configObject;
    }

    private static final class FakeChatGPTProxyManager extends ChatGPTProxyManager {
        private static final String BASE_URL = "http://127.0.0.1:43123/v1";
        private int startCount;
        private int stopCount;

        @Override
        public void start() {
            startCount++;
        }

        @Override
        public void start(int preferredPort) {
            startCount++;
        }

        @Override
        public String getBaseUrl() {
            return BASE_URL;
        }

        @Override
        public void stop() {
            stopCount++;
        }
    }
}
