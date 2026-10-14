package com.github.claudecodegui.cli;

import org.junit.After;
import org.junit.Test;
import static org.junit.Assert.*;

public class CodexCliMaintenanceTest {
    private final FakeRuntime runtime = new FakeRuntime();

    @After
    public void cleanup() {
        CodexCliMaintenance.endUpdate();
        CodexCliMaintenance.unregister(runtime);
    }

    @Test
    public void runningTurnPreventsUpdateWithoutStoppingIt() {
        runtime.busy = true;
        CodexCliMaintenance.register(runtime);
        assertEquals("busy", assertThrows(IllegalStateException.class, CodexCliMaintenance::beginUpdate).getMessage());
        assertFalse(runtime.stopped);
        assertFalse(CodexCliMaintenance.isUpdating());
    }

    @Test
    public void idleRuntimeStopsAndNewOperationsWaitUntilUpdateFinishes() {
        CodexCliMaintenance.register(runtime);
        CodexCliMaintenance.beginUpdate();
        assertTrue(runtime.stopped);
        assertThrows(IllegalStateException.class, () -> CodexCliMaintenance.registerOperation(() -> runtime.busy = true));
        assertThrows(IllegalStateException.class, CodexCliMaintenance::beginUpdate);
        CodexCliMaintenance.endUpdate();
        CodexCliMaintenance.registerOperation(() -> runtime.busy = true);
        assertTrue(runtime.busy);
    }

    private static class FakeRuntime implements CodexCliMaintenance.Runtime {
        boolean busy;
        boolean stopped;
        @Override public boolean isBusy() { return busy; }
        @Override public void stopForUpdate() { stopped = true; }
    }
}
