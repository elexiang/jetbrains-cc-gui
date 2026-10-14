package com.github.claudecodegui.dependency;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class DependencyManagerVersioningTest {
    @Test
    public void codexVersionChoicesKeepOnlyRecentStableAndPrereleaseVersions() {
        List<String> versions = new java.util.ArrayList<>();
        for (int i = 0; i < 25; i++) versions.add("1.0." + i);
        for (int i = 0; i < 15; i++) versions.add("2.0.0-alpha." + i);
        List<String> recent = DependencyManager.recentCodexVersions(versions);
        assertEquals(30, recent.size());
        assertEquals("2.0.0-alpha.14", recent.get(0));
        assertEquals("1.0.5", recent.get(recent.size() - 1));
        org.junit.Assert.assertTrue(recent.contains("1.0.24"));
        org.junit.Assert.assertTrue(recent.contains("2.0.0-alpha.5"));
        org.junit.Assert.assertFalse(recent.contains("1.0.4"));
        org.junit.Assert.assertFalse(recent.contains("2.0.0-alpha.4"));
    }
    @Test
    public void codexHistoricalDateVersionsDoNotOverflowDuringSorting() {
        String payload = "[\"0.1.2504161551\",\"0.1.4160940\",\"0.162.1\",\"0.1.2505172116\",\"0.163.0-alpha.10\"]";
        assertEquals(List.of("0.163.0-alpha.10", "0.162.1", "0.1.2505172116", "0.1.2504161551", "0.1.4160940"),
                DependencyManager.parseVersionList(payload, true));
        assertEquals(-1, Integer.signum(DependencyManager.compareVersions("0.1.2504161551", "0.1.2505172116")));
    }
    @Test
    public void codexInstallsTheCliPackageAtAnySelectedVersion() {
        assertEquals(List.of("@openai/codex@0.162.0-alpha.17.2"),
                DependencyManager.buildPackageSpecs(SdkDefinition.CODEX_CLI, "0.162.0-alpha.17.2"));
        assertEquals(List.of("@openai/codex@latest"),
                DependencyManager.buildPackageSpecs(SdkDefinition.CODEX_CLI, null));
        assertNull(SdkDefinition.CODEX_CLI.getMinRequiredVersion());
    }

    @Test
    public void codexVersionsIncludePrereleasesButExcludePlatformArtifacts() {
        String payload = "[\"0.162.0-alpha.2\",\"0.162.0-alpha.10\",\"0.162.0\",\"0.162.0-win32-x64\",\"0.162.0-alpha.10-linux-arm64\"]";
        assertEquals(List.of("0.162.0", "0.162.0-alpha.10", "0.162.0-alpha.2"),
                DependencyManager.parseVersionList(payload, true));
        assertEquals(List.of("0.162.0"), DependencyManager.parseVersionList(payload));
    }
    @Test
    public void shouldUseRequestedVersionForMainPackage() {
        List<String> packages = DependencyManager.buildPackageSpecs(
                SdkDefinition.CLAUDE_SDK,
                "0.3.182"
        );

        assertEquals("@anthropic-ai/claude-agent-sdk@0.3.182", packages.get(0));
        assertEquals("@anthropic-ai/sdk", packages.get(1));
        assertEquals("@anthropic-ai/bedrock-sdk", packages.get(2));
    }

    @Test
    public void shouldFallbackToSdkDefaultVersionWhenRequestedVersionIsBlank() {
        List<String> packages = DependencyManager.buildPackageSpecs(
                SdkDefinition.CLAUDE_SDK,
                " "
        );

        assertEquals("@anthropic-ai/claude-agent-sdk@^0.3.182", packages.get(0));
    }

    @Test
    public void shouldNormalizeLeadingVInRequestedVersion() {
        assertEquals("0.3.182", DependencyManager.normalizeRequestedVersion(" v0.3.182 "));
    }

    @Test
    public void shouldAcceptValidSemverVersions() {
        assertEquals("1.0.0", DependencyManager.normalizeRequestedVersion("1.0.0"));
        assertEquals("0.3.182", DependencyManager.normalizeRequestedVersion("V0.3.182"));
        assertEquals("1.2.3-beta.1", DependencyManager.normalizeRequestedVersion("1.2.3-beta.1"));
        assertEquals("2.0.0-rc.1", DependencyManager.normalizeRequestedVersion("v2.0.0-rc.1"));
    }

    @Test
    public void shouldRejectInvalidVersionFormats() {
        assertNull(DependencyManager.normalizeRequestedVersion("not-a-version"));
        assertNull(DependencyManager.normalizeRequestedVersion("1.0"));
        assertNull(DependencyManager.normalizeRequestedVersion("latest"));
        assertNull(DependencyManager.normalizeRequestedVersion(">=1.0.0"));
        assertNull(DependencyManager.normalizeRequestedVersion("1.0.0 && rm -rf /"));
    }

    @Test
    public void shouldRejectNullAndEmpty() {
        assertNull(DependencyManager.normalizeRequestedVersion(null));
        assertNull(DependencyManager.normalizeRequestedVersion(""));
        assertNull(DependencyManager.normalizeRequestedVersion("   "));
    }

    @Test
    public void claudeSdkShouldRequireFableCapableMinimumVersion() {
        // The Fable tier (ANTHROPIC_DEFAULT_FABLE_MODEL + 'fable' alias) needs SDK 0.3.182+.
        // Pinning this floor here prevents accidental downgrade that would resurrect the
        // "model fable" 401 on third-party relays.
        assertEquals("0.3.182", SdkDefinition.CLAUDE_SDK.getMinRequiredVersion());
    }

    @Test
    public void codexRuntimeNoLongerGatesOnASdkVersion() {
        // Native auto capability is decided by the CLI runtime itself, not by a
        // TypeScript SDK version floor (see design D5 of the app-server migration).
        assertNull(SdkDefinition.fromId("codex-sdk"));
        assertNull(SdkDefinition.fromProvider("codex"));
    }
}
