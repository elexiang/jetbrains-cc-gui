package com.github.claudecodegui.settings;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class CodexAutoRoutingConfigTest {

    @Test
    public void enablesAndDisablesOnlyItsManagedGlobalAgentsBlock() throws Exception {
        Path codexDir = Files.createTempDirectory("codex-auto-routing");
        Path agentsPath = codexDir.resolve("AGENTS.md");
        String userInstructions = "# Personal instructions\r\n\r\nKeep my own rules.\r\n";
        Files.writeString(agentsPath, userInstructions, StandardCharsets.UTF_8);
        CodexAutoRoutingConfigService service = CodexAutoRoutingConfigService.createForTests(agentsPath);

        CodexAutoRoutingConfigService.OperationResult enabled = service.updateEnabled(true);
        String withRouting = Files.readString(agentsPath, StandardCharsets.UTF_8);

        assertTrue(enabled.isSuccess());
        assertTrue(enabled.getConfig().isEnabled());
        assertTrue(withRouting.startsWith(userInstructions));
        assertTrue(withRouting.contains("<!-- CC-GUI-AUTO-ROUTING:START -->"));
        assertTrue(withRouting.contains("GPT-5.6 Terra with xhigh reasoning"));
        assertTrue(withRouting.contains("GPT-5.6 Luna with xhigh reasoning"));
        assertTrue(Files.exists(codexDir.resolve("config.toml")));
        String enabledConfig = Files.readString(codexDir.resolve("config.toml"), StandardCharsets.UTF_8);
        assertTrue(enabledConfig.contains("model = \"gpt-5.6-terra\""));
        assertTrue(enabledConfig.contains("model_reasoning_effort = \"xhigh\""));

        CodexAutoRoutingConfigService.OperationResult disabled = service.updateEnabled(false);
        String withoutRouting = Files.readString(agentsPath, StandardCharsets.UTF_8);

        assertTrue(disabled.isSuccess());
        assertFalse(disabled.getConfig().isEnabled());
        assertTrue(withoutRouting.contains("# Personal instructions"));
        assertTrue(withoutRouting.contains("Keep my own rules."));
        assertFalse(withoutRouting.contains("CC-GUI-AUTO-ROUTING"));
        assertFalse(Files.exists(codexDir.resolve("config.toml")));
    }

    @Test
    public void restoresOriginalModelOnlyWhenTheManagedValuesRemain() throws Exception {
        Path codexDir = Files.createTempDirectory("codex-auto-routing-model");
        Path agentsPath = codexDir.resolve("AGENTS.md");
        Path configPath = codexDir.resolve("config.toml");
        String originalConfig = "# keep\r\n"
                + "model = \"gpt-5.6-sol\" # user choice\r\n"
                + "model_reasoning_effort = \"high\"\r\n"
                + "custom = true\r\n"
                + "\r\n[profiles.work]\r\nmodel = \"profile-model\"\r\n";
        Files.writeString(configPath, originalConfig, StandardCharsets.UTF_8);
        CodexAutoRoutingConfigService service = CodexAutoRoutingConfigService.createForTests(agentsPath);

        assertTrue(service.updateEnabled(true).isSuccess());
        String enabledConfig = Files.readString(configPath, StandardCharsets.UTF_8);
        assertTrue(enabledConfig.contains("model = \"gpt-5.6-terra\""));
        assertTrue(enabledConfig.contains("model_reasoning_effort = \"xhigh\""));
        assertTrue(enabledConfig.contains("[profiles.work]\r\nmodel = \"profile-model\""));

        assertTrue(service.updateEnabled(false).isSuccess());
        assertEquals(originalConfig, Files.readString(configPath, StandardCharsets.UTF_8));

        assertTrue(service.updateEnabled(true).isSuccess());
        Files.writeString(configPath, enabledConfig.replace("gpt-5.6-terra", "gpt-5.6-luna"), StandardCharsets.UTF_8);
        assertTrue(service.updateEnabled(false).isSuccess());
        String manuallyChangedConfig = Files.readString(configPath, StandardCharsets.UTF_8);
        assertTrue(manuallyChangedConfig.contains("gpt-5.6-luna"));
    }

    @Test
    public void rejectsMalformedManagedBlockWithoutOverwritingUserInstructions() throws Exception {
        Path codexDir = Files.createTempDirectory("codex-auto-routing-malformed");
        Path agentsPath = codexDir.resolve("AGENTS.md");
        String malformed = "before\n<!-- CC-GUI-AUTO-ROUTING:START -->\nafter\n";
        Files.writeString(agentsPath, malformed, StandardCharsets.UTF_8);
        CodexAutoRoutingConfigService service = CodexAutoRoutingConfigService.createForTests(agentsPath);

        CodexAutoRoutingConfigService.OperationResult result = service.updateEnabled(false);

        assertFalse(result.isSuccess());
        assertEquals(malformed, Files.readString(agentsPath, StandardCharsets.UTF_8));
    }

    @Test
    public void broadcastsOnlySuccessfulChanges() throws Exception {
        Path codexDir = Files.createTempDirectory("codex-auto-routing-callback");
        CodexAutoRoutingConfigService service = CodexAutoRoutingConfigService.createForTests(codexDir.resolve("AGENTS.md"));
        AtomicInteger callbacks = new AtomicInteger();
        service.registerCallback(config -> callbacks.incrementAndGet());

        assertTrue(service.updateEnabled(true).isSuccess());
        assertTrue(service.updateEnabled(false).isSuccess());

        assertEquals(2, callbacks.get());
    }
}
