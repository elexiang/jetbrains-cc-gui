package com.github.claudecodegui.handler;

import com.github.claudecodegui.handler.core.HandlerContext;
import com.github.claudecodegui.settings.CodexAutoRoutingConfigService;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;

/** 将共享自动路由开关桥接到 WebView。 */
public final class CodexAutoRoutingHandler {

    private static final Logger LOG = Logger.getInstance(CodexAutoRoutingHandler.class);
    private static final String CALLBACK_NAME = "window.updateCodexAutoRoutingConfig";

    private final HandlerContext context;
    private final Gson gson = new Gson();
    private final CodexAutoRoutingConfigService configService;
    private CodexAutoRoutingConfigService.RegisteredCallback callbackHandle;

    public CodexAutoRoutingHandler(HandlerContext context) {
        this(context, CodexAutoRoutingConfigService.getInstance());
    }

    CodexAutoRoutingHandler(HandlerContext context, CodexAutoRoutingConfigService configService) {
        this.context = context;
        this.configService = configService;
        this.callbackHandle = configService.registerCallback(config -> pushConfig(config, true, null));
    }

    public void handleGet() {
        pushResult(configService.readCurrent());
    }

    public void handleSet(String content) {
        Boolean enabled = null;
        try {
            JsonObject payload = gson.fromJson(content, JsonObject.class);
            if (payload != null && payload.has("enabled") && !payload.get("enabled").isJsonNull()) {
                enabled = payload.get("enabled").getAsBoolean();
            }
        } catch (Exception e) {
            LOG.warn("[CodexAutoRouting] Invalid set payload", e);
        }
        if (enabled == null) {
            CodexAutoRoutingConfigService.OperationResult current = configService.readCurrent();
            pushConfig(current.getConfig(), false, "Missing auto-routing enabled state");
            return;
        }
        CodexAutoRoutingConfigService.OperationResult result = configService.updateEnabled(enabled);
        if (!result.isSuccess()) {
            pushResult(result);
        }
    }

    public void dispose() {
        if (callbackHandle != null) {
            configService.unregisterCallback(callbackHandle);
            callbackHandle = null;
        }
    }

    private void pushResult(CodexAutoRoutingConfigService.OperationResult result) {
        pushConfig(result.getConfig(), result.isSuccess(), result.getError());
    }

    private void pushConfig(
            CodexAutoRoutingConfigService.AutoRoutingConfig config,
            boolean success,
            String error
    ) {
        JsonObject response = new JsonObject();
        response.addProperty("success", success);
        response.addProperty("enabled", config != null && config.isEnabled());
        if (error != null && !error.isBlank()) {
            response.addProperty("error", error);
        }
        Runnable push = () -> context.callJavaScript(CALLBACK_NAME, context.escapeJs(response.toString()));
        if (ApplicationManager.getApplication() != null) {
            ApplicationManager.getApplication().invokeLater(push);
        } else {
            push.run();
        }
    }
}
