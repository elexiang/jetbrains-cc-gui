package com.github.claudecodegui.cli;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Set;
import java.util.WeakHashMap;

/** 暂停空闲 Codex 运行时，防止更新正在使用的 CLI。 */
public final class CodexCliMaintenance {
    private static final Set<Runtime> RUNTIMES = Collections.newSetFromMap(new WeakHashMap<>());
    private static volatile boolean updating;

    private CodexCliMaintenance() { }

    /** One live Codex bridge, without retaining disposed windows. */
    public interface Runtime {
        boolean isBusy();
        void stopForUpdate();
    }

    public static synchronized void register(Runtime runtime) {
        RUNTIMES.add(runtime);
    }

    public static synchronized void unregister(Runtime runtime) {
        RUNTIMES.remove(runtime);
    }

    public static boolean isUpdating() {
        return updating;
    }

    /** Registration and the busy check share the same update gate. */
    public static synchronized void registerOperation(Runnable register) {
        if (updating) {
            throw new IllegalStateException("Codex CLI update is in progress");
        }
        register.run();
    }

    public static void beginUpdate() {
        ArrayList<Runtime> snapshot;
        synchronized (CodexCliMaintenance.class) {
            if (updating) {
                throw new IllegalStateException("update_in_progress");
            }
            snapshot = new ArrayList<>(RUNTIMES);
            if (snapshot.stream().anyMatch(Runtime::isBusy)) {
                throw new IllegalStateException("busy");
            }
            updating = true;
        }
        try {
            for (Runtime runtime : snapshot) {
                runtime.stopForUpdate();
            }
        } catch (RuntimeException error) {
            endUpdate();
            throw error;
        }
    }

    public static synchronized void endUpdate() {
        updating = false;
    }
}
