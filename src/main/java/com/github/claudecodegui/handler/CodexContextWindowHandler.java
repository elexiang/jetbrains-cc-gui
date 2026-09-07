package com.github.claudecodegui.handler;

import com.github.claudecodegui.handler.core.HandlerContext;
import com.github.claudecodegui.settings.CodexContextWindowConfigService;
import com.github.claudecodegui.settings.CodexSettingsManager;
import com.google.gson.Gson;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

/**
 * 处理 WebView 与 Codex 全局上下文窗口配置之间的桥接。
 */
public final class CodexContextWindowHandler {

    private static final Logger LOG = Logger.getInstance(CodexContextWindowHandler.class);
    private static final String CALLBACK_NAME = "window.updateCodexContextWindowConfig";

    private final HandlerContext context;
    private final Gson gson = new Gson();
    private final CodexContextWindowConfigService configService;
    private CodexContextWindowConfigService.RegisteredCallback callbackHandle;

    public CodexContextWindowHandler(HandlerContext context) {
        this(context, CodexContextWindowConfigService.getInstance());
    }

    CodexContextWindowHandler(
            HandlerContext context,
            CodexContextWindowConfigService configService
    ) {
        this.context = context;
        this.configService = configService;
        this.callbackHandle = configService.registerCallback(config -> pushConfig(config, true, null));
    }

    /**
     * 将当前磁盘配置返回给 WebView。
     */
    public void handleGet() {
        pushResult(configService.readCurrent());
    }

    /**
     * 校验并写入用户选择的上下文预设。
     *
     * @param content JSON 负载，格式为 {@code {"preset":"default|500k|1m"}}
     */
    public void handleSet(String content) {
        String preset = null;
        try {
            JsonObject payload = gson.fromJson(content, JsonObject.class);
            if (payload != null && payload.has("preset") && !payload.get("preset").isJsonNull()) {
                preset = payload.get("preset").getAsString();
            }
        } catch (Exception e) {
            LOG.warn("[CodexContextWindow] Invalid set payload", e);
        }
        CodexContextWindowConfigService.OperationResult result = configService.updatePreset(preset);
        if (!result.isSuccess()) {
            pushResult(result);
        }
    }

    /** 校验独立 Boolean 开关，不修改上下文窗口或运行中的会话。 */
    public void handleSetContextManagement(String content) {
        try {
            JsonObject payload = gson.fromJson(content, JsonObject.class);
            if (payload == null || !payload.has("enabled")
                    || !payload.get("enabled").isJsonPrimitive()
                    || !payload.getAsJsonPrimitive("enabled").isBoolean()) {
                pushConfig(null, false, "Invalid Codex context management Boolean");
                return;
            }
            var result = configService.updateContextManagement(payload.get("enabled").getAsBoolean());
            if (!result.isSuccess()) {
                pushResult(result);
            }
        } catch (Exception e) {
            pushConfig(null, false, "Invalid Codex context management request");
        }
    }

    /**
     * 注销全局回调，防止窗口销毁后继续接收广播。
     */
    public void dispose() {
        if (callbackHandle != null) {
            configService.unregisterCallback(callbackHandle);
            callbackHandle = null;
        }
    }

    private void pushResult(CodexContextWindowConfigService.OperationResult result) {
        if (result.isSuccess()) {
            pushConfig(result.getConfig(), true, null);
            return;
        }
        pushConfig(result.getConfig(), false, result.getError());
    }

    private void pushConfig(
            CodexSettingsManager.CodexContextWindowConfig config,
            boolean success,
            String error
    ) {
        JsonObject response = new JsonObject();
        response.addProperty("success", success);
        if (config != null) {
            response.addProperty("preset", config.getPreset());
            response.addProperty("contextManagement", config.isContextManagement());
            if (config.getContextManagementError() != null) {
                response.addProperty("contextManagementError", config.getContextManagementError());
            }
            if (config.getContextWindow() != null) {
                response.addProperty("contextWindow", config.getContextWindow());
            } else {
                response.add("contextWindow", JsonNull.INSTANCE);
            }
            if (config.getAutoCompactTokenLimit() != null) {
                response.addProperty("autoCompactTokenLimit", config.getAutoCompactTokenLimit());
            } else {
                response.add("autoCompactTokenLimit", JsonNull.INSTANCE);
            }
            response.addProperty("custom", config.isCustom());
        }
        if (error != null && !error.isBlank()) {
            response.addProperty("error", error);
        }

        Runnable push = () -> context.callJavaScript(
                CALLBACK_NAME,
                context.escapeJs(response.toString())
        );
        if (ApplicationManager.getApplication() != null) {
            ApplicationManager.getApplication().invokeLater(push);
        } else {
            push.run();
        }
    }
}
