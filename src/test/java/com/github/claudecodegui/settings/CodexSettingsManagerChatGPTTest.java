package com.github.claudecodegui.settings;

import com.google.gson.Gson;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class CodexSettingsManagerChatGPTTest {
    @Test
    public void leavesUserConfigUntouchedWhenSelectingNativeChatGPTLogin() throws Exception {
        Path codexDir = Files.createTempDirectory("codex-chatgpt-settings");
        try {
            Files.writeString(
                    codexDir.resolve("config.toml"),
                    "model = \"gpt-5.6-luna\"\n"
                            + "[mcp_servers.keep]\ncommand = \"node\"\n"
                            + "[[skills.config]]\npath = \"C:/skills/review/SKILL.md\"\nenabled = false\n",
                    StandardCharsets.UTF_8
            );

            CodexSettingsManager manager = new CodexSettingsManager(new Gson(), codexDir);
            manager.transitionProvider(null, null, true, () -> { });

            Map<String, Object> config = manager.readConfigToml();
            assertEquals("gpt-5.6-luna", config.get("model"));
            assertTrue(config.containsKey("mcp_servers"));
            assertTrue(config.containsKey("skills"));
        } finally {
            Files.deleteIfExists(codexDir.resolve("config.toml"));
            Files.deleteIfExists(codexDir);
        }
    }
}
