import { availableChatGptWebModelRoutes, requireChatGptWebModelRoute } from './upstream/src/chatgpt-web-models';
import type { AppConfig } from './upstream/src/config';

export function validateWebRequest(body: any, config: AppConfig): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求必须为 JSON 对象');
  requireChatGptWebModelRoute(body.model, config);
  // These are server-executed native services, not local coding tools.
  const blocked = new Set(['web_search', 'web_search_preview', 'image_generation', 'computer_use_preview']);
  if (Array.isArray(body.tools) && body.tools.some((tool: any) => blocked.has(tool?.type))) {
    throw new Error('网页专用入口不支持原生搜索、图像生成或计算机服务，请关闭这些工具');
  }
}

export function webModels(config: AppConfig) {
  return availableChatGptWebModelRoutes(config).map(route => ({
    id: route.slug, name: route.displayName, effort: route.codexEffort,
  }));
}
