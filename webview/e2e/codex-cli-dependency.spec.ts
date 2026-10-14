import { expect, test } from '@playwright/test';
import { APP_VERSION } from '../src/version/version';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(version => {
    localStorage.setItem('lastSeenChangelogVersion', version);
    localStorage.setItem('language', 'en');
    let installed: string | undefined = '0.154.0';
    const versions = () => window.dependencyVersionsLoaded?.(JSON.stringify({
      'claude-sdk': { sdkId: 'claude-sdk', versions: ['0.3.220'], source: 'remote' },
      'codex-cli': { sdkId: 'codex-cli', versions: ['0.162.1', '0.162.0-alpha.10', '0.154.0'], source: 'remote', latestVersion: '0.162.1' },
    }));
    const status = () => window.updateDependencyStatus?.(JSON.stringify({
      'claude-sdk': { status: 'not_installed' },
      'codex-cli': { status: installed ? 'installed' : 'not_installed', installedVersion: installed,
        runtimeKind: 'cli', transport: 'app-server', installPath: 'C:\\fixture\\dependencies\\codex-cli' },
    }));
    window.sendToJava = message => {
      setTimeout(() => {
        if (message.startsWith('get_dependency_status:')) status();
        if (message.startsWith('get_dependency_versions:')) versions();
        if (message.startsWith('check_dependency_updates:')) window.dependencyUpdateAvailable?.(JSON.stringify({
          'codex-cli': { hasUpdate: installed !== '0.162.1', latestVersion: '0.162.1' },
        }));
        if (message.startsWith('update_dependency:') || message.startsWith('install_dependency:')) {
          const request = JSON.parse(message.slice(message.indexOf(':') + 1));
          installed = request.version;
          window.dependencyInstallProgress?.(JSON.stringify({ sdkId: request.id, log: 'Verified CLI ' + installed }));
          window.dependencyInstallResult?.(JSON.stringify({ sdkId: request.id, success: true, installedVersion: installed }));
          status();
        }
        if (message.startsWith('uninstall_dependency:')) {
          installed = undefined;
          window.dependencyUninstallResult?.(JSON.stringify({ sdkId: 'codex-cli', success: true }));
          status();
        }
        if (message.startsWith('get_cli_status:')) window.updateCliStatus?.(JSON.stringify({
          codex: { id: 'codex', installed: true, version: installed ?? '0.147.0' },
        }));
      }, 20);
    };
  }, APP_VERSION);
  await page.goto('/');
  await page.locator('.header button:has(.codicon-settings-gear)').click();
  await page.locator('.codicon-extensions').click();
});

test('Codex versions can be updated, rolled back, reinstalled, uninstalled and installed at every viewport', async ({ page }, testInfo) => {
  const card = page.locator('div[class*="sdkCard"]').filter({ hasText: 'Codex CLI' });
  await expect(card.getByText('Latest stable v0.162.1', { exact: false })).toBeVisible();
  const choose = async (version: string) => {
    await card.locator('button[aria-haspopup="listbox"]').click();
    await card.getByRole('searchbox').fill(version);
    await card.getByRole('option', { name: 'v' + version, exact: true }).click();
  };
  await choose('0.162.1');
  const update = card.getByRole('button', { name: /Update to v0\.162\.1/ });
  await update.scrollIntoViewIfNeeded();
  const bounds = await update.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await update.click();
  await expect(card.getByRole('button', { name: /Reinstall v0\.162\.1/ })).toBeVisible();
  await choose('0.154.0');
  await card.getByRole('button', { name: /Rollback to v0\.154\.0/ }).click();
  await card.getByRole('button', { name: /Reinstall v0\.154\.0/ }).click();
  await expect(card.getByRole('button', { name: /Reinstall v0\.154\.0/ })).toBeEnabled();
  await card.getByRole('button', { name: /Uninstall$/ }).click();
  await card.getByRole('button', { name: /Install v0\.154\.0/ }).click();
  await expect(card.getByRole('button', { name: /Reinstall v0\.154\.0/ })).toBeVisible();
  await expect(card).toBeVisible();
  expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  await page.waitForTimeout(3500); // Let the sequence's toast animations finish before visual QA.
  await page.screenshot({ path: testInfo.outputPath('codex-cli-dependencies.png'), fullPage: true });
});
