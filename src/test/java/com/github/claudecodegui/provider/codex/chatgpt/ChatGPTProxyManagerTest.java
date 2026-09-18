package com.github.claudecodegui.provider.codex.chatgpt;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

public class ChatGPTProxyManagerTest {
    private String originalBridgePath;
    private ChatGPTProxyManager manager;

    @Before
    public void setUp() {
        originalBridgePath = System.getProperty("claude.bridge.path");
        Path bridgePath = Path.of(System.getProperty("user.dir"), "ai-bridge")
                .toAbsolutePath()
                .normalize();
        System.setProperty("claude.bridge.path", bridgePath.toString());
        manager = new ChatGPTProxyManager();
    }

    @After
    public void tearDown() {
        manager.stop();
        if (originalBridgePath == null) {
            System.clearProperty("claude.bridge.path");
        } else {
            System.setProperty("claude.bridge.path", originalBridgePath);
        }
    }

    @Test
    public void startsHealthChecksReusesAndStopsSharedProxy() throws Exception {
        manager.start();

        assertTrue(manager.isRunning());
        assertTrue(manager.healthCheck());
        assertTrue(manager.getPort() > 0);
        assertNotNull(manager.getBaseUrl());
        assertTrue(manager.getBaseUrl().startsWith("http://127.0.0.1:"));

        int port = manager.getPort();
        manager.start(port);
        assertEquals(port, manager.getPort());

        manager.stop();
        assertFalse(manager.isRunning());
        assertEquals("", manager.getBaseUrl());
    }
}
