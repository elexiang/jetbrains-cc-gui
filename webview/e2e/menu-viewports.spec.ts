import { expect, test, type Locator, type Page } from '@playwright/test';
import { APP_VERSION } from '../src/version/version';

type BridgeWindow = Window & typeof globalThis & {
  sendToJava?: (message: string) => void;
  sentMessages?: string[];
};

const NODE_PROCESS_SNAPSHOT = {
  snapshotAt: Date.now(),
  totals: { daemon: 1, channel: 1, orphan: 1, all: 3 },
  processes: [
    {
      id: 'daemon-1',
      kind: 'DAEMON',
      provider: 'claude',
      pid: 3010,
      alive: true,
      startedAt: Date.now() - 120_000,
      uptimeMs: 120_000,
      command: 'node daemon.js',
      heapUsed: 42 * 1024 * 1024,
      activeRequestCount: 0,
      orphan: false,
    },
    {
      id: 'channel-1',
      kind: 'CHANNEL',
      provider: 'codex',
      pid: 3011,
      alive: true,
      startedAt: Date.now() - 60_000,
      uptimeMs: 60_000,
      command: 'node channel.js',
      activeRequestCount: 1,
      tabName: 'CC GUI',
      orphan: false,
    },
    {
      id: 'orphan-1',
      kind: 'ORPHAN',
      provider: 'claude',
      pid: 3012,
      alive: true,
      startedAt: Date.now() - 30_000,
      uptimeMs: 30_000,
      command: 'node orphan.js',
      activeRequestCount: 0,
      orphan: true,
    },
  ],
};

const CLAUDE_PROVIDERS_PAYLOAD = [
  { id: 'local-settings', name: 'Use local settings.json', isActive: true },
  { id: 'cli-login', name: 'Use CLI login', isActive: false },
  { id: 'proxy-a', name: 'Proxy A', remark: 'fast route', isActive: false },
];

const CODEX_PROVIDERS_PAYLOAD = [
  { id: 'codex-cli-login', name: 'Use local Codex config', isActive: true },
  { id: 'codex-proxy', name: 'Codex Proxy', remark: 'workspace config', isActive: false },
];

const LONG_MODEL = {
  id: 'vendor/super-long-model-name-that-should-not-force-horizontal-overflow-in-selector-menus',
  label: 'Extremely Long Claude-Compatible Model Display Name With Multiple Provider And Capability Suffixes',
  description: 'A very long model description that should remain clipped inside the selector row instead of pushing the dropdown outside the visible webview viewport.',
};

const SEARCH_TARGET_MODEL = {
  id: 'vendor/large-model-search-target-220',
  label: 'Large Model Search Target 220',
  description: 'Model outside the initial render cap that should still be selectable through search.',
};

const LARGE_MODEL_LIST = Array.from({ length: 240 }, (_, index) => {
  if (index === 220) return SEARCH_TARGET_MODEL;
  const padded = String(index).padStart(3, '0');
  return {
    id: `vendor/large-model-${padded}`,
    label: `Large Model ${padded}`,
    description: `Large model fixture ${padded}`,
  };
});

async function installBridgeMocks(page: Page, customModels = [LONG_MODEL], provider: 'claude' | 'codex' = 'claude') {
  await page.addInitScript(({ processSnapshot, claudeProviders, codexProviders, models, appVersion, providerId }) => {
    localStorage.setItem('model-selection-state', JSON.stringify({
      provider: providerId,
      claudeModel: 'claude-sonnet-4-6',
      codexModel: 'gpt-5.5',
      claudePermissionMode: 'bypassPermissions',
      codexPermissionMode: 'default',
      longContextEnabled: true,
      reasoningEffort: 'high',
    }));
    localStorage.setItem('claude-custom-models', JSON.stringify(models));
    localStorage.setItem('lastSeenChangelogVersion', appVersion);

    const hideVConsole = () => {
      const style = document.createElement('style');
      style.textContent = '#__vconsole { display: none !important; pointer-events: none !important; }';
      (document.head || document.documentElement)?.appendChild(style);
    };
    if (document.head || document.documentElement) {
      hideVConsole();
    } else {
      window.addEventListener('DOMContentLoaded', hideVConsole, { once: true });
    }

    const respond = (callbackName: string, payload: unknown) => {
      window.setTimeout(() => {
        const callback = (window as unknown as Record<string, unknown>)[callbackName];
        if (typeof callback === 'function') {
          callback(JSON.stringify(payload));
        }
      }, 0);
    };

    const sentMessages: string[] = [];
    (window as BridgeWindow).sentMessages = sentMessages;
    (window as BridgeWindow).sendToJava = (message: string) => {
      sentMessages.push(message);
      if (message.startsWith('get_node_processes:')) respond('updateNodeProcesses', processSnapshot);
      if (message.startsWith('get_providers:')) respond('updateProviders', claudeProviders);
      if (message.startsWith('get_codex_providers:')) respond('updateCodexProviders', codexProviders);
      if (message.startsWith('get_codex_context_window:')) {
        respond('updateCodexContextWindowConfig', {
          success: true,
          preset: 'default',
          contextWindow: 272_000,
          autoCompactTokenLimit: 244_800,
          custom: false,
        });
      }
      if (message.startsWith('set_codex_context_window:')) {
        const content = message.slice('set_codex_context_window:'.length);
        let preset = 'default';
        try {
          const parsed = JSON.parse(content) as { preset?: string };
          if (typeof parsed.preset === 'string') preset = parsed.preset;
        } catch {
          // Keep the default fixture response for malformed test payloads.
        }
        const contextWindow = preset === '1m' ? 1_000_000 : preset === '500k' ? 500_000 : 272_000;
        respond('updateCodexContextWindowConfig', {
          success: true,
          preset,
          contextWindow,
          autoCompactTokenLimit: preset === '1m' ? 900_000 : preset === '500k' ? 450_000 : 244_800,
          custom: false,
        });
      }
      if (message.startsWith('set_codex_context_management:')) {
        const content = message.slice('set_codex_context_management:'.length);
        let enabled = false;
        try {
          const parsed = JSON.parse(content) as { enabled?: boolean };
          enabled = parsed.enabled === true;
        } catch {
          // Keep the legacy fixture response for malformed test payloads.
        }
        respond('updateCodexContextWindowConfig', {
          success: true,
          preset: 'default',
          contextWindow: 272_000,
          autoCompactTokenLimit: 244_800,
          contextManagement: enabled,
          custom: false,
        });
      }
    };
  }, {
    processSnapshot: NODE_PROCESS_SNAPSHOT,
    claudeProviders: CLAUDE_PROVIDERS_PAYLOAD,
    codexProviders: CODEX_PROVIDERS_PAYLOAD,
    models: customModels,
    appVersion: APP_VERSION,
    providerId: provider,
  });
}

function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // Chromium probes /favicon.ico on the Vite fixture even though the app
    // does not declare one; keep real page errors visible without failing on
    // that expected dev-server 404.
    if (
      message.type() === 'error'
      && message.text() !== 'Failed to load resource: the server responded with a status of 404 (Not Found)'
    ) {
      errors.push(message.text());
    }
  });
  return errors;
}

async function expectNoFooterOverlap(page: Page, triggers: Locator[], label: string) {
  const boxes = await Promise.all(triggers.map(async (trigger) => {
    await expect(trigger, `${label} trigger`).toBeVisible();
    await expectInsideViewport(page, trigger, `${label} trigger`);
    return trigger.boundingBox();
  }));
  const sendBox = await page.locator('.button-area-right').boundingBox();
  expect(sendBox, `${label} send area should have a visible bounding box`).not.toBeNull();
  if (!sendBox) return;

  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i];
    expect(box, `${label} trigger ${i} should have a visible bounding box`).not.toBeNull();
    if (!box) continue;
    const sendOverlapX = Math.max(0, Math.min(box.x + box.width, sendBox.x + sendBox.width) - Math.max(box.x, sendBox.x));
    const sendOverlapY = Math.max(0, Math.min(box.y + box.height, sendBox.y + sendBox.height) - Math.max(box.y, sendBox.y));
    expect(sendOverlapX * sendOverlapY, `${label} trigger ${i} overlaps send area`).toBeLessThanOrEqual(1);
    for (let j = i + 1; j < boxes.length; j += 1) {
      const other = boxes[j];
      if (!other) continue;
      const overlapX = Math.max(0, Math.min(box.x + box.width, other.x + other.width) - Math.max(box.x, other.x));
      const overlapY = Math.max(0, Math.min(box.y + box.height, other.y + other.height) - Math.max(box.y, other.y));
      expect(overlapX * overlapY, `${label} triggers ${i} and ${j} overlap`).toBeLessThanOrEqual(1);
    }
  }
}

function significantErrors(errors: string[]) {
  return errors.filter((error) => !error.includes('ResizeObserver loop'));
}

async function expectInsideViewport(page: Page, locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should have a visible bounding box`).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport, 'viewport should be available').not.toBeNull();
  if (!box || !viewport) return;

  const tolerance = 2;
  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(-tolerance);
  expect(box.y, `${label} top edge`).toBeGreaterThanOrEqual(-tolerance);
  expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(viewport.width + tolerance);
  expect(box.y + box.height, `${label} bottom edge`).toBeLessThanOrEqual(viewport.height + tolerance);
}

async function expectContainedWithin(container: Locator, child: Locator, label: string) {
  const containerBox = await container.boundingBox();
  const childBox = await child.boundingBox();
  expect(containerBox, `${label} container should have a visible bounding box`).not.toBeNull();
  expect(childBox, `${label} child should have a visible bounding box`).not.toBeNull();
  if (!containerBox || !childBox) return;

  const tolerance = 2;
  expect(childBox.x, `${label} left edge`).toBeGreaterThanOrEqual(containerBox.x - tolerance);
  expect(childBox.x + childBox.width, `${label} right edge`).toBeLessThanOrEqual(containerBox.x + containerBox.width + tolerance);
}

async function expectSubmenuAnchoredToRow(page: Page, trigger: Locator, submenu: Locator, label: string) {
  const triggerBox = await trigger.boundingBox();
  const submenuBox = await submenu.boundingBox();
  expect(triggerBox, `${label} trigger should have a visible bounding box`).not.toBeNull();
  expect(submenuBox, `${label} submenu should have a visible bounding box`).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport, 'viewport should be available').not.toBeNull();
  if (!triggerBox || !submenuBox || !viewport) return;

  const verticalOverlap = Math.max(
    0,
    Math.min(triggerBox.y + triggerBox.height, submenuBox.y + submenuBox.height) - Math.max(triggerBox.y, submenuBox.y),
  );
  expect(verticalOverlap, `${label} should stay vertically attached to trigger row`).toBeGreaterThan(12);

  const rightSideGap = Math.abs(submenuBox.x - (triggerBox.x + triggerBox.width));
  const leftSideGap = Math.abs(triggerBox.x - (submenuBox.x + submenuBox.width));
  const horizontalGap = Math.min(rightSideGap, leftSideGap);
  const horizontalOverlap = Math.max(
    0,
    Math.min(triggerBox.x + triggerBox.width, submenuBox.x + submenuBox.width) - Math.max(triggerBox.x, submenuBox.x),
  );

  expect(
    horizontalGap <= 48 || horizontalOverlap > 12,
    `${label} should be adjacent to or intentionally overlap trigger row`,
  ).toBe(true);
}

async function closeOpenMenus(page: Page) {
  await page.mouse.click(8, 8);
  await page.waitForTimeout(50);
}

async function openSelectorMenu(page: Page, button: Locator, label: string) {
  await button.click();
  const dropdown = page.locator('.selector-dropdown').first();
  await expect(dropdown, `${label} dropdown`).toBeVisible();
  await expectInsideViewport(page, dropdown, `${label} dropdown`);
  await closeOpenMenus(page);
}

async function openDirectSelector(page: Page, trigger: Locator, dropdown: Locator, label: string) {
  await trigger.click();
  await expect(dropdown, `${label} dropdown`).toBeVisible();
  await expectInsideViewport(page, dropdown, `${label} dropdown`);
  await closeOpenMenus(page);
}

test.beforeEach(async ({ page }, testInfo) => {
  const customModels = testInfo.title.includes('large model selector')
    ? LARGE_MODEL_LIST
    : [LONG_MODEL];
  const provider = testInfo.title.includes('Codex') ? 'codex' : 'claude';
  await installBridgeMocks(page, customModels, provider);
});

test('footer selector menus render inside the viewport', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  await expect(page.locator('.button-area-left')).toBeVisible();
  await expect(page.locator('.button-area').first()).toHaveAttribute('data-provider', 'claude');

  const buttons = page.locator('.button-area-left .selector-button');
  await expect(buttons).toHaveCount(5);
  await expectNoFooterOverlap(page, [
    page.getByTestId('config-select-trigger'),
    page.getByTestId('provider-select-trigger'),
    page.getByTestId('mode-select-trigger'),
    page.getByTestId('model-select-trigger'),
    page.getByTestId('reasoning-select-trigger'),
  ], 'Claude footer');

  await openSelectorMenu(page, page.getByTestId('config-select-trigger'), 'config');
  await openSelectorMenu(page, page.getByTestId('provider-select-trigger'), 'provider');
  await openSelectorMenu(page, page.getByTestId('mode-select-trigger'), 'mode');
  await openDirectSelector(page, page.getByTestId('model-select-trigger'), page.getByTestId('model-selector-dropdown'), 'model');
  await openDirectSelector(page, page.getByTestId('reasoning-select-trigger'), page.getByTestId('reasoning-selector-dropdown'), 'reasoning');

  expect(significantErrors(errors)).toEqual([]);
});

test('Codex keeps context controls in the top ContextBar', async ({ page }, testInfo) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  await expect(page.locator('.button-area').first()).toHaveAttribute('data-provider', 'codex');
  await expect.poll(() => page.evaluate(() => typeof window.updateCodexContextWindowConfig)).toBe('function');
  await page.evaluate(() => window.updateCodexContextWindowConfig?.(JSON.stringify({
    success: true,
    preset: 'default',
    contextWindow: 272_000,
    autoCompactTokenLimit: 244_800,
    custom: false,
  })));

  const left = page.locator('.button-area-left');
  const contextBar = page.locator('.context-bar');
  const modelTrigger = left.getByTestId('model-select-trigger');
  const reasoningTrigger = left.getByTestId('reasoning-select-trigger');
  const speedTrigger = left.getByTestId('codex-fast-mode-trigger');
  const contextToggle = contextBar.getByTestId('codex-context-window-toggle');
  const managementTrigger = contextBar.getByTestId('codex-context-management-trigger');
  await expect(modelTrigger).toBeVisible();
  await expect(reasoningTrigger).toBeVisible();
  await expect(speedTrigger).toBeVisible();
  await expect(contextToggle).toBeVisible();
  await expect(managementTrigger).toBeVisible();
  await expect(managementTrigger).toHaveText(/^(Old|旧|舊)$/);
  await managementTrigger.click();
  const managementDropdown = page.getByTestId('codex-context-management-dropdown');
  await expect(managementDropdown).toBeVisible();
  await expectInsideViewport(page, managementDropdown, 'Codex context management');
  await managementDropdown.getByTestId('codex-context-management-option-new').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sentMessages?: string[] })
    .sentMessages?.includes('set_codex_context_management:{"enabled":true}'))).toBe(true);
  await expect(managementTrigger).toHaveText(/^(New|新)$/);

  await openDirectSelector(page, modelTrigger, page.getByTestId('model-selector-dropdown'), 'Codex model');
  await openDirectSelector(page, reasoningTrigger, page.getByTestId('reasoning-selector-dropdown'), 'Codex reasoning');
  await openDirectSelector(page, speedTrigger, page.getByTestId('codex-fast-mode-dropdown'), 'Codex speed');

  const reasoningDropdown = page.getByTestId('reasoning-selector-dropdown');
  await reasoningTrigger.click();
  await expect(reasoningDropdown).toBeVisible();
  await reasoningDropdown.getByTestId('reasoning-option-low').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sentMessages?: string[] }).sentMessages?.includes('set_reasoning_effort:low'))).toBe(true);

  await speedTrigger.click();
  const speedDropdown = page.getByTestId('codex-fast-mode-dropdown');
  await expect(speedDropdown).toBeVisible();
  await speedDropdown.getByTestId('codex-fast-mode-option-fast').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sentMessages?: string[] }).sentMessages?.includes('set_codex_fast_mode:fast'))).toBe(true);

  await contextToggle.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sentMessages?: string[] }).sentMessages?.includes('set_codex_context_window:{"preset":"1m"}'))).toBe(true);
  await expect(contextToggle).toHaveAttribute('aria-checked', 'true');
  await contextToggle.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sentMessages?: string[] }).sentMessages?.includes('set_codex_context_window:{"preset":"default"}'))).toBe(true);
  await expect(contextToggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('500K', { exact: true })).toHaveCount(0);

  await expect(left.getByTestId('codex-context-window-toggle')).toHaveCount(0);
  await expect(left.getByTestId('codex-context-management-trigger')).toHaveCount(0);

  await expectNoFooterOverlap(page, [
    left.getByTestId('config-select-trigger'),
    left.getByTestId('provider-select-trigger'),
    left.getByTestId('mode-select-trigger'),
    modelTrigger,
    reasoningTrigger,
    speedTrigger,
  ], 'Codex footer');

  await page.screenshot({ path: testInfo.outputPath('context-management.png') });

  expect(significantErrors(errors)).toEqual([]);
});

test('Codex auto review appears only after the SDK confirms support', async ({ page }) => {
  await page.addInitScript(() => {
    // JCEF sets this before user changes can be persisted across tabs.
    window.__CCGUI_PAGE_CONTEXT_READY__ = true;
    const saved = JSON.parse(localStorage.getItem('model-selection-state') || '{}');
    localStorage.setItem('model-selection-state', JSON.stringify({ ...saved, provider: 'codex' }));
  });
  await page.goto('/');
  await expect(page.locator('.button-area').first()).toHaveAttribute('data-provider', 'codex');
  await page.getByTestId('mode-select-trigger').click();
  await expect(page.getByTestId('mode-option-default')).toBeVisible();
  await expect(page.getByTestId('mode-option-auto')).toHaveCount(0);

  await page.evaluate(() => window.updateDependencyStatus?.(JSON.stringify({
    'codex-sdk': { installed: true, meetsMinimumVersion: true },
  })));
  await expect(page.getByTestId('mode-option-auto')).toBeVisible();
  await page.getByTestId('mode-option-auto').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem('model-selection-state') || '{}',
  ).codexPermissionMode)).toBe('auto');

  await page.evaluate(() => window.updateDependencyStatus?.(JSON.stringify({
    'codex-sdk': { installed: true, meetsMinimumVersion: false },
  })));
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem('model-selection-state') || '{}',
  ).codexPermissionMode)).toBe('default');
  await page.getByTestId('mode-select-trigger').click();
  await expect(page.getByTestId('mode-option-default')).toBeVisible();
  await expect(page.getByTestId('mode-option-auto')).toHaveCount(0);
});

test('config submenus stay visible across constrained viewports', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  await expect(page.locator('.button-area-left')).toBeVisible();

  const configButton = page.locator('.button-area-left .selector-button').first();
  await configButton.click();
  const mainDropdown = page.locator('.selector-dropdown').first();
  await expect(mainDropdown).toBeVisible();
  await expectInsideViewport(page, mainDropdown, 'config dropdown');

  const nodeProcessRow = mainDropdown.getByTestId('config-option-node-processes');
  await nodeProcessRow.hover();
  const nodeDropdown = page.locator('.node-process-dropdown');
  await expect(nodeDropdown).toBeVisible();
  await expect(page.getByText('PID 3012')).toBeVisible();
  await expectInsideViewport(page, nodeDropdown, 'node process submenu');
  await expectSubmenuAnchoredToRow(page, nodeProcessRow, nodeDropdown, 'node process submenu');

  const runtimeProviderRow = mainDropdown.getByTestId('config-option-runtime-provider');
  await runtimeProviderRow.hover();
  const runtimeDropdown = page.locator('.runtime-provider-dropdown');
  await expect(runtimeDropdown).toBeVisible();
  await expectInsideViewport(page, runtimeDropdown, 'runtime provider submenu');
  await expectSubmenuAnchoredToRow(page, runtimeProviderRow, runtimeDropdown, 'runtime provider submenu');

  const agentRow = mainDropdown.getByTestId('config-option-agent');
  await agentRow.hover();
  const agentDropdown = agentRow.locator('.selector-dropdown').first();
  await expect(agentDropdown).toBeVisible();
  await expectInsideViewport(page, agentDropdown, 'agent submenu');
  await expectSubmenuAnchoredToRow(page, agentRow, agentDropdown, 'agent submenu');

  expect(significantErrors(errors)).toEqual([]);
});

test('long model and mode text stays contained in selector menus', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  await expect(page.locator('.button-area-left')).toBeVisible();

  const buttons = page.locator('.button-area-left .selector-button');
  await expect(buttons).toHaveCount(5);

  await page.getByTestId('mode-select-trigger').click();
  const modeDropdown = page.locator('.selector-dropdown').first();
  await expect(modeDropdown).toBeVisible();
  await expectInsideViewport(page, modeDropdown, 'mode dropdown with long descriptions');
  const longModeOption = modeDropdown.getByTestId('mode-option-bypassPermissions');
  const longModeDescription = longModeOption.locator('.mode-description');
  await expect(longModeDescription).toBeVisible();
  await expectContainedWithin(longModeOption, longModeDescription, 'long mode description');
  await closeOpenMenus(page);

  await page.getByTestId('model-select-trigger').click();
  const modelDropdown = page.getByTestId('model-selector-dropdown');
  await expect(modelDropdown).toBeVisible();
  await expectInsideViewport(page, modelDropdown, 'model dropdown with long custom model');
  const longModelOption = modelDropdown.locator('.selector-option').filter({ hasText: LONG_MODEL.label }).first();
  const longModelLabel = longModelOption.locator('span').filter({ hasText: LONG_MODEL.label }).first();
  const longModelDescription = longModelOption.locator('span').filter({ hasText: LONG_MODEL.description }).first();
  await expect(longModelLabel).toBeVisible();
  await expect(longModelDescription).toBeVisible();
  await expectContainedWithin(longModelOption, longModelLabel, 'long model label');
  await expectContainedWithin(longModelOption, longModelDescription, 'long model description');

  expect(significantErrors(errors)).toEqual([]);
});

test('large model selector remains searchable and capped', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/');
  await expect(page.locator('.button-area-left')).toBeVisible();

  const modelButton = page.getByTestId('model-select-trigger');
  await modelButton.click();
  const modelDropdown = page.getByTestId('model-selector-dropdown');
  await expect(modelDropdown).toBeVisible();
  await expectInsideViewport(page, modelDropdown, 'large model dropdown');

  const renderedLargeModels = modelDropdown.getByText(/^Large Model \d{3}$/);
  await expect(renderedLargeModels).toHaveCount(100);
  await expect(modelDropdown.getByTestId('model-hidden-count')).toBeVisible();
  await expect(modelDropdown.getByText(SEARCH_TARGET_MODEL.label)).toHaveCount(0);

  const searchInput = modelDropdown.getByTestId('model-search-input');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('Search Target 220');

  const targetOption = modelDropdown.locator('.selector-option').filter({ hasText: SEARCH_TARGET_MODEL.label }).first();
  await expect(targetOption).toBeVisible();
  await targetOption.click();
  await expect(modelButton).toHaveAttribute('title', new RegExp(SEARCH_TARGET_MODEL.label));

  expect(significantErrors(errors)).toEqual([]);
});
