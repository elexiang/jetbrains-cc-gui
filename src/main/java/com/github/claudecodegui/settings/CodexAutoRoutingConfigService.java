package com.github.claudecodegui.settings;

import com.github.claudecodegui.bridge.NodeDetector;
import com.google.gson.Gson;
import com.intellij.openapi.diagnostic.Logger;
import org.jetbrains.annotations.TestOnly;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 管理由 CC GUI 与 Codex 桌面端共享的自动路由开关。
 *
 * <p>Codex 没有原生的跨客户端自动路由配置项。因此本服务同时维护用户级
 * {@code ~/.codex/config.toml} 与 {@code ~/.codex/AGENTS.md}：前者把主线程固定为
 * Terra xhigh，后者提供 Terra 委派 Luna 的规则。关闭时只恢复仍然由本开关托管的值，
 * 不覆盖用户在开关开启后手动修改过的模型。</p>
 */
public final class CodexAutoRoutingConfigService {

    private static final Logger LOG = Logger.getInstance(CodexAutoRoutingConfigService.class);
    private static final String MODEL_KEY = "model";
    private static final String MODEL_EFFORT_KEY = "model_reasoning_effort";
    private static final String MANAGED_MODEL = "gpt-5.6-terra";
    private static final String MANAGED_EFFORT = "xhigh";
    private static final String START_MARKER = "<!-- CC-GUI-AUTO-ROUTING:START -->";
    private static final String END_MARKER = "<!-- CC-GUI-AUTO-ROUTING:END -->";
    private static final String STATE_FILE_NAME = "cc-gui-auto-routing-state.json";
    private static final Object FILE_LOCK = new Object();
    private static volatile CodexAutoRoutingConfigService instance;

    private static final String ROUTING_BLOCK = START_MARKER + "\n"
            + "## CC GUI / Codex shared auto routing\n\n"
            + "Auto routing is enabled for new Codex sessions. The manager is GPT-5.6 Terra with xhigh reasoning. "
            + "For independent, clearly bounded exploration, implementation, testing, or review work, create context-minimal "
            + "subagents using GPT-5.6 Luna with xhigh reasoning. Do not delegate short, local, low-risk tasks merely to use a subagent.\n\n"
            + "Never automatically create, switch to, or escalate to GPT-5.6 Sol. Use Sol only when the user explicitly asks for Sol "
            + "in the current message. If Luna is insufficient, Terra must review or take over; if Terra cannot resolve the task, report "
            + "the verified facts, risk, and blocker instead of switching models.\n\n"
            + "Apply this routing policy only to sessions created after this block was enabled.\n"
            + END_MARKER;

    private final Path globalAgentsPath;
    private final Path configTomlPath;
    private final Path statePath;
    private final Gson gson = new Gson();
    private final CopyOnWriteArraySet<RegisteredCallback> callbacks = new CopyOnWriteArraySet<>();
    private final AtomicLong callbackIdSequence = new AtomicLong();

    private CodexAutoRoutingConfigService(Path globalAgentsPath) {
        this.globalAgentsPath = globalAgentsPath;
        Path codexDir = globalAgentsPath.getParent();
        this.configTomlPath = codexDir.resolve("config.toml");
        this.statePath = codexDir.resolve(STATE_FILE_NAME);
    }

    public static CodexAutoRoutingConfigService getInstance() {
        CodexAutoRoutingConfigService local = instance;
        if (local == null) {
            synchronized (CodexAutoRoutingConfigService.class) {
                local = instance;
                if (local == null) {
                    String userHome = NodeDetector.resolveHomeForFileOps();
                    local = new CodexAutoRoutingConfigService(Paths.get(userHome, ".codex", "AGENTS.md"));
                    instance = local;
                }
            }
        }
        return local;
    }

    @TestOnly
    static CodexAutoRoutingConfigService createForTests(Path globalAgentsPath) {
        return new CodexAutoRoutingConfigService(globalAgentsPath);
    }

    /** 读取当前用户级路由状态。 */
    public OperationResult readCurrent() {
        synchronized (FILE_LOCK) {
            try {
                String content = readIfPresent(globalAgentsPath);
                return OperationResult.success(parseConfig(content));
            } catch (Exception e) {
                LOG.warn("[CodexAutoRouting] Failed to read shared configuration: " + e.getMessage(), e);
                return OperationResult.failure(new AutoRoutingConfig(false), e.getMessage());
            }
        }
    }

    /**
     * 原子地开启或关闭共享自动路由，并向所有已打开的 CC GUI 窗口广播最终状态。
     *
     * @param enabled 是否开启 Terra/Luna 自动路由
     * @return 写入后的权威状态
     */
    public OperationResult updateEnabled(boolean enabled) {
        synchronized (FILE_LOCK) {
            String originalAgents = "";
            String originalConfig = "";
            String originalState = null;
            boolean agentsExisted = false;
            boolean configExisted = false;
            boolean stateExisted = false;
            try {
                originalAgents = readIfPresent(globalAgentsPath);
                originalConfig = readIfPresent(configTomlPath);
                agentsExisted = Files.exists(globalAgentsPath);
                configExisted = Files.exists(configTomlPath);
                originalState = readOptional(statePath);
                stateExisted = originalState != null;
                parseConfig(originalAgents);

                String patchedAgents;
                String patchedConfig = originalConfig;
                String patchedState = originalState;
                boolean deleteConfigAfter = false;
                if (enabled) {
                    RoutingState state = stateExisted
                            ? parseState(originalState)
                            : RoutingState.capture(originalConfig, configExisted);
                    patchedConfig = patchManagedModel(originalConfig, MANAGED_MODEL, MANAGED_EFFORT);
                    patchedAgents = enableBlock(originalAgents);
                    patchedState = gson.toJson(state);
                } else {
                    patchedAgents = disableBlock(originalAgents);
                    if (stateExisted) {
                        RoutingState state = parseState(originalState);
                        patchedConfig = restoreManagedModel(originalConfig, state);
                        deleteConfigAfter = !state.configExisted && patchedConfig.isEmpty();
                    }
                }

                if (deleteConfigAfter) {
                    Files.deleteIfExists(configTomlPath);
                } else if (!patchedConfig.equals(originalConfig)) {
                    writeAtomically(configTomlPath, patchedConfig);
                }
                if (!patchedAgents.equals(originalAgents)) {
                    writeAtomically(globalAgentsPath, patchedAgents);
                }
                if (enabled) {
                    if (!stateExisted || !patchedState.equals(originalState)) {
                        writeAtomically(statePath, patchedState);
                    }
                } else if (stateExisted) {
                    Files.deleteIfExists(statePath);
                }

                AutoRoutingConfig config = parseConfig(patchedAgents);
                if (config.isEnabled() != enabled) {
                    throw new IOException("Failed to validate shared auto-routing instructions");
                }
                notifyCallbacks(config);
                LOG.info("[CodexAutoRouting] Updated shared auto-routing mode to: " + enabled);
                return OperationResult.success(config);
            } catch (Exception e) {
                restoreAfterFailure(
                        originalAgents,
                        agentsExisted,
                        originalConfig,
                        configExisted,
                        originalState,
                        stateExisted
                );
                LOG.warn("[CodexAutoRouting] Failed to update shared auto-routing mode", e);
                try {
                    return OperationResult.failure(parseConfig(readIfPresent(globalAgentsPath)), e.getMessage());
                } catch (Exception readError) {
                    return OperationResult.failure(new AutoRoutingConfig(false), e.getMessage());
                }
            }
        }
    }

    public RegisteredCallback registerCallback(ConfigChangedCallback callback) {
        if (callback == null) {
            return null;
        }
        RegisteredCallback handle = new RegisteredCallback(callbackIdSequence.incrementAndGet(), callback);
        callbacks.add(handle);
        return handle;
    }

    public void unregisterCallback(RegisteredCallback handle) {
        if (handle != null) {
            callbacks.remove(handle);
        }
    }

    private AutoRoutingConfig parseConfig(String content) throws IOException {
        int startCount = countOccurrences(content, START_MARKER);
        int endCount = countOccurrences(content, END_MARKER);
        if (startCount == 0 && endCount == 0) {
            return new AutoRoutingConfig(false);
        }
        if (startCount != 1 || endCount != 1 || content.indexOf(END_MARKER) < content.indexOf(START_MARKER)) {
            throw new IOException("Malformed CC GUI auto-routing block in global AGENTS.md");
        }
        return new AutoRoutingConfig(true);
    }

    private String enableBlock(String original) throws IOException {
        AutoRoutingConfig current = parseConfig(original);
        String newline = newlineFor(original);
        String block = ROUTING_BLOCK.replace("\n", newline);
        if (!current.isEnabled()) {
            if (original.isEmpty()) {
                return block + newline;
            }
            return original + (endsWithNewline(original) ? "" : newline) + newline + block + newline;
        }
        int start = original.indexOf(START_MARKER);
        int end = original.indexOf(END_MARKER) + END_MARKER.length();
        return original.substring(0, start) + block + original.substring(end);
    }

    private String disableBlock(String original) throws IOException {
        AutoRoutingConfig current = parseConfig(original);
        if (!current.isEnabled()) {
            return original;
        }
        int start = original.indexOf(START_MARKER);
        int end = original.indexOf(END_MARKER) + END_MARKER.length();
        if (original.startsWith("\r\n", end)) {
            end += 2;
        } else if (original.startsWith("\n", end)) {
            end += 1;
        }
        return original.substring(0, start) + original.substring(end);
    }

    private String patchManagedModel(String original, String model, String effort) {
        return patchTopLevelKeys(original, modelLine(model), effortLine(effort));
    }

    private String restoreManagedModel(String original, RoutingState state) {
        String modelReplacement = isTopLevelValue(original, MODEL_KEY, MANAGED_MODEL)
                ? state.modelLine
                : findTopLevelLine(original, MODEL_KEY);
        String effortReplacement = isTopLevelValue(original, MODEL_EFFORT_KEY, MANAGED_EFFORT)
                ? state.effortLine
                : findTopLevelLine(original, MODEL_EFFORT_KEY);
        return patchTopLevelKeys(original, modelReplacement, effortReplacement);
    }

    private String patchTopLevelKeys(String original, String modelReplacement, String effortReplacement) {
        String bom = original.startsWith("\uFEFF") ? "\uFEFF" : "";
        String body = bom.isEmpty() ? original : original.substring(1);
        String newline = newlineFor(body);
        boolean endedWithNewline = endsWithNewline(body);
        String[] lines = body.split("\\r?\\n", -1);
        List<String> output = new ArrayList<>();
        boolean inSection = false;
        boolean modelWritten = false;
        boolean effortWritten = false;
        int firstSection = -1;

        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("[") && !trimmed.startsWith("#")) {
                if (firstSection < 0) {
                    firstSection = output.size();
                }
                inSection = true;
            }
            String key = !inSection ? topLevelKey(line) : null;
            if (MODEL_KEY.equals(key)) {
                if (!modelWritten && modelReplacement != null) {
                    output.add(modelReplacement);
                    modelWritten = true;
                }
                continue;
            }
            if (MODEL_EFFORT_KEY.equals(key)) {
                if (!effortWritten && effortReplacement != null) {
                    output.add(effortReplacement);
                    effortWritten = true;
                }
                continue;
            }
            output.add(line);
        }

        int insertionIndex = firstSection >= 0 ? firstSection : trailingBlankIndex(output);
        if (modelReplacement != null && !modelWritten) {
            output.add(insertionIndex++, modelReplacement);
        }
        if (effortReplacement != null && !effortWritten) {
            output.add(insertionIndex, effortReplacement);
        }

        String joined = String.join(newline, output);
        if (!endedWithNewline && joined.endsWith(newline)) {
            joined = joined.substring(0, joined.length() - newline.length());
        } else if (endedWithNewline && !joined.endsWith(newline)) {
            joined += newline;
        }
        return bom + joined;
    }

    private String readIfPresent(Path path) throws IOException {
        return Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : "";
    }

    private String readOptional(Path path) throws IOException {
        return Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : null;
    }

    private void restoreAfterFailure(
            String agents,
            boolean agentsExisted,
            String config,
            boolean configExisted,
            String state,
            boolean stateExisted
    ) {
        try {
            if (agentsExisted) {
                writeAtomically(globalAgentsPath, agents);
            } else {
                Files.deleteIfExists(globalAgentsPath);
            }
            if (configExisted) {
                writeAtomically(configTomlPath, config);
            } else {
                Files.deleteIfExists(configTomlPath);
            }
            if (stateExisted) {
                writeAtomically(statePath, state);
            } else {
                Files.deleteIfExists(statePath);
            }
        } catch (Exception restoreError) {
            LOG.warn("[CodexAutoRouting] Failed to restore files after update failure", restoreError);
        }
    }

    private void notifyCallbacks(AutoRoutingConfig config) {
        for (RegisteredCallback callback : callbacks) {
            try {
                callback.callback.onConfigChanged(config);
            } catch (Exception e) {
                LOG.warn("[CodexAutoRouting] Failed to notify callback id=" + callback.id, e);
            }
        }
    }

    private void writeAtomically(Path target, String content) throws IOException {
        Path parent = target.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Path temp = Files.createTempFile(parent, target.getFileName().toString() + "-", ".tmp");
        try {
            Files.writeString(temp, content, StandardCharsets.UTF_8);
            try {
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    private static String topLevelKey(String line) {
        String candidate = line.trim();
        if (candidate.isEmpty() || candidate.startsWith("#") || candidate.startsWith("[")) {
            return null;
        }
        int equals = candidate.indexOf('=');
        if (equals <= 0) {
            return null;
        }
        String key = candidate.substring(0, equals).trim();
        if ((key.startsWith("\"") && key.endsWith("\""))
                || (key.startsWith("'") && key.endsWith("'"))) {
            key = key.substring(1, key.length() - 1);
        }
        return key;
    }

    private static boolean isTopLevelValue(String content, String key, String expected) {
        String[] lines = content.replace("\r\n", "\n").split("\n", -1);
        boolean inSection = false;
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("[") && !trimmed.startsWith("#")) {
                inSection = true;
            }
            if (inSection || !key.equals(topLevelKey(line))) {
                continue;
            }
            int equals = line.indexOf('=');
            String value = line.substring(equals + 1).trim();
            int comment = value.indexOf('#');
            if (comment >= 0) {
                value = value.substring(0, comment).trim();
            }
            if ((value.startsWith("\"") && value.endsWith("\""))
                    || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.substring(1, value.length() - 1);
            }
            return expected.equals(value);
        }
        return false;
    }

    private static String modelLine(String model) {
        return MODEL_KEY + " = \"" + model + "\"";
    }

    private static String effortLine(String effort) {
        return MODEL_EFFORT_KEY + " = \"" + effort + "\"";
    }

    private static int trailingBlankIndex(List<String> lines) {
        int index = lines.size();
        while (index > 0 && lines.get(index - 1).trim().isEmpty()) {
            index--;
        }
        return index;
    }

    private static String newlineFor(String content) {
        return content.contains("\r\n") ? "\r\n" : "\n";
    }

    private static boolean endsWithNewline(String content) {
        return content.endsWith("\n") || content.endsWith("\r");
    }

    private static int countOccurrences(String content, String needle) {
        int count = 0;
        int index = 0;
        while ((index = content.indexOf(needle, index)) >= 0) {
            count++;
            index += needle.length();
        }
        return count;
    }

    public interface ConfigChangedCallback {
        void onConfigChanged(AutoRoutingConfig config);
    }

    public static final class RegisteredCallback {
        private final long id;
        private final ConfigChangedCallback callback;

        private RegisteredCallback(long id, ConfigChangedCallback callback) {
            this.id = id;
            this.callback = callback;
        }
    }

    public static final class AutoRoutingConfig {
        private final boolean enabled;

        AutoRoutingConfig(boolean enabled) {
            this.enabled = enabled;
        }

        public boolean isEnabled() {
            return enabled;
        }
    }

    private static final class RoutingState {
        private final String modelLine;
        private final String effortLine;
        private final boolean configExisted;

        private RoutingState(String modelLine, String effortLine, boolean configExisted) {
            this.modelLine = modelLine;
            this.effortLine = effortLine;
            this.configExisted = configExisted;
        }

        private static RoutingState capture(String config, boolean configExisted) {
            String modelLine = findTopLevelLine(config, MODEL_KEY);
            String effortLine = findTopLevelLine(config, MODEL_EFFORT_KEY);
            return new RoutingState(modelLine, effortLine, configExisted);
        }

        private static RoutingState parseState(String state, Gson gson) {
            RoutingState parsed = gson.fromJson(state, RoutingState.class);
            return parsed == null ? new RoutingState(null, null, false) : parsed;
        }
    }

    private static String findTopLevelLine(String content, String key) {
        String[] lines = content.replace("\r\n", "\n").split("\n", -1);
        boolean inSection = false;
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("[") && !trimmed.startsWith("#")) {
                inSection = true;
            }
            if (!inSection && key.equals(topLevelKey(line))) {
                return line;
            }
        }
        return null;
    }

    private RoutingState parseState(String state) throws IOException {
        try {
            return RoutingState.parseState(state, gson);
        } catch (Exception e) {
            throw new IOException("Malformed CC GUI auto-routing state file", e);
        }
    }

    public static final class OperationResult {
        private final boolean success;
        private final AutoRoutingConfig config;
        private final String error;

        private OperationResult(boolean success, AutoRoutingConfig config, String error) {
            this.success = success;
            this.config = config;
            this.error = error;
        }

        static OperationResult success(AutoRoutingConfig config) {
            return new OperationResult(true, config, null);
        }

        static OperationResult failure(AutoRoutingConfig config, String error) {
            String message = error == null || error.isBlank() ? "Unknown configuration error" : error;
            return new OperationResult(false, config, message);
        }

        public boolean isSuccess() {
            return success;
        }

        public AutoRoutingConfig getConfig() {
            return config;
        }

        public String getError() {
            return error;
        }
    }
}
