package com.github.claudecodegui.settings;

import com.google.gson.Gson;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;

public class CodexContextManagementConfigTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();

    private CodexSettingsManager manager() throws IOException {
        return new CodexSettingsManager(new Gson(), temp.newFolder().toPath());
    }

    @Test public void missingConfigReadsOffAndDisableDoesNotCreateIt() throws Exception {
        var manager = manager();
        assertFalse(manager.readContextManagement());
        manager.updateContextManagement(false);
        assertFalse(Files.exists(manager.getConfigTomlPath()));
    }

    @Test public void readsMissingTablesAndBooleanValues() throws Exception {
        var manager = manager();
        for (String content : new String[]{"", "model = 'x'\n", "[features]\nfoo = true\n",
                "[features.context_management]\n", "[features.context_management]\nexperimental_mode = false\n"}) {
            Files.writeString(manager.getConfigTomlPath(), content);
            assertFalse(content, manager.readContextManagement());
            assertEquals(content, Files.readString(manager.getConfigTomlPath()));
        }
        Files.writeString(manager.getConfigTomlPath(), "[features.context_management]\nexperimental_mode = true\n");
        assertTrue(manager.readContextManagement());
    }

    @Test public void createsAndTogglesWithoutDuplicateTablesOrKeys() throws Exception {
        var manager = manager();
        manager.updateContextManagement(true);
        String enabled = Files.readString(manager.getConfigTomlPath());
        assertEquals("[features.context_management]\nexperimental_mode = true\n", enabled);
        manager.updateContextManagement(true);
        assertEquals(enabled, Files.readString(manager.getConfigTomlPath()));
        manager.updateContextManagement(false);
        String disabled = Files.readString(manager.getConfigTomlPath());
        assertEquals("[features.context_management]\n", disabled);
        assertFalse(manager.readContextManagement());
        manager.updateContextManagement(false);
        assertEquals(disabled, Files.readString(manager.getConfigTomlPath()));
        manager.updateContextManagement(true);
        assertEquals(enabled, Files.readString(manager.getConfigTomlPath()));
    }

    @Test public void preservesAllUnrelatedTextAndCommentsAcrossRoundTrip() throws Exception {
        var manager = manager();
        String prefix = "\uFEFF# user configuration\r\nmodel = 'custom'\r\nmodel_context_window = 1000000\r\n"
                + "sandbox_mode = 'workspace-write'\r\napproval_policy = 'on-request'\r\n"
                + "unknown = { nested = [1, 2] }\r\n[features]\r\nfoo = true\r\nbar = false\r\n"
                + "[features.context_management]\r\n";
        String suffix = "other = 'keep'\r\n[profiles.work]\r\nmodel = 'profile'\r\n"
                + "[mcp_servers.example]\r\ncommand = 'tool'\r\nargs = ['a', 'b']\r\n";
        Files.writeString(manager.getConfigTomlPath(), prefix + "  experimental_mode  = false # retain\r\n" + suffix);
        manager.updateContextManagement(true);
        assertEquals(prefix + "  experimental_mode  = true # retain\r\n" + suffix,
                Files.readString(manager.getConfigTomlPath()));
        manager.updateContextManagement(false);
        assertEquals(prefix + "# retain\r\n" + suffix, Files.readString(manager.getConfigTomlPath()));
    }

    @Test public void disablesExplicitFalseAndIsIdempotent() throws Exception {
        var manager = manager();
        Files.writeString(manager.getConfigTomlPath(), "[features.context_management]\nexperimental_mode = false\n");
        manager.updateContextManagement(false);
        assertEquals("[features.context_management]\n", Files.readString(manager.getConfigTomlPath()));
        manager.updateContextManagement(false);
        assertEquals("[features.context_management]\n", Files.readString(manager.getConfigTomlPath()));
    }

    @Test public void enablesMissingFeatureWithoutRewritingExistingFeatures() throws Exception {
        var manager = manager();
        String original = "model = 'x'\n[features]\nfoo = true\nbar = false";
        Files.writeString(manager.getConfigTomlPath(), original);
        manager.updateContextManagement(true);
        assertEquals(original + "\n[features.context_management]\nexperimental_mode = true\n",
                Files.readString(manager.getConfigTomlPath()));
    }

    @Test public void handlesQuotedAndDottedKeysWithoutTouchingStringContents() throws Exception {
        for (String key : new String[]{"features.context_management.experimental_mode",
                "'features'.\"context_management\".'experimental_mode'"}) {
            var manager = manager();
            String original = "example = '''\n[features.context_management]\nexperimental_mode = false\n'''\n"
                    + key + " = false # actual";
            Files.writeString(manager.getConfigTomlPath(), original);
            manager.updateContextManagement(true);
            assertEquals(original.replace("false # actual", "true # actual"), Files.readString(manager.getConfigTomlPath()));
            manager.updateContextManagement(false);
            assertEquals(original.substring(0, original.indexOf(key)) + "# actual", Files.readString(manager.getConfigTomlPath()));
        }
    }

    @Test public void malformedTomlAndUnsafeInlineEditsNeverWrite() throws Exception {
        for (String original : new String[]{"[broken", "x = 1\nx = 2\n", "model = 'unterminated",
                "[features.context_management]\nexperimental_mode = 'true'\n",
                "[features.context_management]\nexperimental_mode = true\nexperimental_mode = false\n",
                "features = { context_management = { experimental_mode = true }, foo = true }"}) {
            var manager = manager();
            Files.writeString(manager.getConfigTomlPath(), original);
            try {
                manager.updateContextManagement(false);
                fail("Must reject: " + original);
            } catch (IOException expected) {
                assertEquals(original, Files.readString(manager.getConfigTomlPath()));
            }
        }
    }

    @Test public void windowAndManagementRemainIndependent() throws Exception {
        var manager = manager();
        for (String preset : new String[]{"default", "500k", "1m"}) {
            manager.updateContextWindowPreset(preset);
            for (boolean enabled : new boolean[]{true, false}) {
                manager.updateContextManagement(enabled);
                assertEquals(preset, manager.readContextWindowConfig().getPreset());
                manager.updateContextWindowPreset(preset);
                assertEquals(enabled, manager.readContextManagement());
            }
        }
    }

    @Test public void invalidExperimentalFieldDoesNotChangeWindowPresetBehavior() throws Exception {
        var manager = manager();
        Files.writeString(manager.getConfigTomlPath(), "[features.context_management]\nexperimental_mode = 'legacy'\n");
        var service = CodexContextWindowConfigService.createForTests(manager);
        var result = service.updatePreset("500k");
        assertTrue(result.isSuccess());
        assertEquals("500k", result.getConfig().getPreset());
        assertNull(result.getConfig().isContextManagement());
        assertNotNull(result.getConfig().getContextManagementError());
        assertTrue(Files.readString(manager.getConfigTomlPath()).contains("experimental_mode = 'legacy'"));
    }

    @Test public void readOnlyConfigRemainsUnchanged() throws Exception {
        var manager = manager();
        Path path = manager.getConfigTomlPath();
        String original = "[features.context_management]\nexperimental_mode = false\n";
        Files.writeString(path, original);
        var dos = Files.getFileAttributeView(path, java.nio.file.attribute.DosFileAttributeView.class);
        org.junit.Assume.assumeNotNull(dos);
        dos.setReadOnly(true);
        try {
            try {
                manager.updateContextManagement(true);
                fail("Read-only configuration must not report success");
            } catch (IOException expected) {
                assertEquals(original, Files.readString(path));
            }
        } finally {
            dos.setReadOnly(false);
        }
    }

    @Test public void serviceBroadcastsOnlySuccessfulWritesAndHandlesIoFailure() throws Exception {
        var manager = manager();
        var service = CodexContextWindowConfigService.createForTests(manager);
        AtomicInteger calls = new AtomicInteger();
        var handle = service.registerCallback(config -> {
            assertTrue(config.isContextManagement());
            calls.incrementAndGet();
        });
        assertTrue(service.updateContextManagement(true).isSuccess());
        assertEquals(1, calls.get());
        Files.writeString(manager.getConfigTomlPath(), "[broken");
        assertFalse(service.updateContextManagement(false).isSuccess());
        assertEquals(1, calls.get());
        assertEquals("[broken", Files.readString(manager.getConfigTomlPath()));
        service.unregisterCallback(handle);
        Path invalidHome = temp.newFile().toPath();
        var failing = CodexContextWindowConfigService.createForTests(new CodexSettingsManager(new Gson(), invalidHome));
        assertFalse(failing.updateContextManagement(true).isSuccess());
        assertEquals(0, Files.size(invalidHome));
    }
}
