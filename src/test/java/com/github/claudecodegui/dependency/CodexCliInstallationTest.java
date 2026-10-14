package com.github.claudecodegui.dependency;

import org.junit.Test;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.Assert.*;

public class CodexCliInstallationTest {
    @Test
    public void replacingInstallationPreservesOldVersionInBackup() throws Exception {
        Path root = Files.createTempDirectory("codex-installation-test");
        Path target = Files.createDirectory(root.resolve("codex-cli"));
        Path staged = Files.createDirectory(root.resolve("staged"));
        Path backup = root.resolve("backup");
        try {
            Files.writeString(target.resolve("version"), "old");
            Files.writeString(staged.resolve("version"), "new");
            DependencyManager.activateCodexInstallation(staged, target, backup);
            assertEquals("new", Files.readString(target.resolve("version")));
            assertEquals("old", Files.readString(backup.resolve("version")));
            assertFalse(Files.exists(staged));
        } finally { clean(root); }
    }

    @Test
    public void failedActivationRestoresWorkingInstallation() throws Exception {
        Path root = Files.createTempDirectory("codex-installation-test");
        Path target = Files.createDirectory(root.resolve("codex-cli"));
        Path backup = root.resolve("backup");
        try {
            Files.writeString(target.resolve("version"), "old");
            try {
                DependencyManager.activateCodexInstallation(root.resolve("missing"), target, backup);
                fail("Activation should fail");
            } catch (IOException expected) {
                assertEquals("old", Files.readString(target.resolve("version")));
                assertFalse(Files.exists(backup));
            }
        } finally { clean(root); }
    }

    private static void clean(Path root) throws IOException {
        try (var paths = Files.walk(root)) {
            for (Path file : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.delete(file);
        }
    }
}
