import * as fs from 'fs';
import { Setting } from 'obsidian';

import type { ProviderSettingsTabRenderer } from '../../../core/providers/types';
import { renderEnvironmentSettingsSection } from '../../../features/settings/ui/EnvironmentSettingsSection';
import { t } from '../../../i18n/i18n';
import { getHostnameKey } from '../../../utils/env';
import { expandHomePath } from '../../../utils/path';
import { getAntigravityProviderSettings, updateAntigravityProviderSettings } from '../settings';

export const antigravitySettingsTabRenderer: ProviderSettingsTabRenderer = {
  render(container, context) {
    const settingsBag = context.plugin.settings as unknown as Record<string, unknown>;
    const antigravitySettings = getAntigravityProviderSettings(settingsBag);
    const hostnameKey = getHostnameKey();

    // --- Setup ---

    new Setting(container).setName(t('settings.setup')).setHeading();

    new Setting(container)
      .setName('Enable Google Antigravity provider')
      .setDesc('When enabled, Google Antigravity models appear in the model selector for new conversations.')
      .addToggle((toggle) =>
        toggle
          .setValue(antigravitySettings.enabled)
          .onChange(async (value) => {
            updateAntigravityProviderSettings(settingsBag, { enabled: value });
            await context.plugin.saveSettings();
            context.refreshModelSelectors();
          })
      );

    const platformDesc = process.platform === 'win32'
      ? 'For npm/pnpm/yarn or other package manager installs, use the cjs path or wrapper command.'
      : 'Paste the output of "which antigravity" or the absolute path to the CLI executable.';
    
    const cliPathSetting = new Setting(container)
      .setName('Antigravity CLI path')
      .setDesc(`Custom path to the local Antigravity CLI. ${platformDesc}`);

    const validationEl = container.createDiv({
      cls: 'claudian-cli-path-validation claudian-setting-validation claudian-setting-validation-error claudian-hidden',
    });

    const validatePath = (value: string): string | null => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === 'antigravity') return null;

      const expandedPath = expandHomePath(trimmed);

      if (!fs.existsSync(expandedPath)) {
        return t('settings.cliPath.validation.notExist');
      }
      const stat = fs.statSync(expandedPath);
      if (!stat.isFile()) {
        return t('settings.cliPath.validation.isDirectory');
      }
      return null;
    };

    const updateCliPathValidation = (value: string, inputEl?: HTMLInputElement): boolean => {
      const error = validatePath(value);
      if (error) {
        validationEl.setText(error);
        validationEl.toggleClass('claudian-hidden', false);
        if (inputEl) {
          inputEl.toggleClass('claudian-input-error', true);
        }
        return false;
      }

      validationEl.toggleClass('claudian-hidden', true);
      if (inputEl) {
        inputEl.toggleClass('claudian-input-error', false);
      }
      return true;
    };

    const cliPathsByHost = { ...antigravitySettings.cliPathsByHost };
    let cliPathInputEl: HTMLInputElement | null = null;

    const persistCliPath = async (value: string): Promise<boolean> => {
      const isValid = updateCliPathValidation(value, cliPathInputEl ?? undefined);
      if (!isValid) {
        return false;
      }

      const trimmed = value.trim();
      if (trimmed) {
        cliPathsByHost[hostnameKey] = trimmed;
      } else {
        delete cliPathsByHost[hostnameKey];
      }

      updateAntigravityProviderSettings(settingsBag, { cliPathsByHost: { ...cliPathsByHost } });
      await context.plugin.saveSettings();
      const view = context.plugin.getView();
      await view?.getTabManager()?.broadcastToAllTabs(
        (service) => Promise.resolve(service.cleanup())
      );
      return true;
    };

    const currentValue = antigravitySettings.cliPathsByHost[hostnameKey] || antigravitySettings.cliPath || '';

    cliPathSetting.addText((text) => {
      text
        .setPlaceholder('antigravity')
        .setValue(currentValue)
        .onChange(async (value) => {
          await persistCliPath(value);
        });
      text.inputEl.addClass('claudian-settings-cli-path-input');
      cliPathInputEl = text.inputEl;

      updateCliPathValidation(currentValue, text.inputEl);
    });

    // --- Safety ---

    new Setting(container).setName(t('settings.safety')).setHeading();

    new Setting(container)
      .setName('Safe mode')
      .setDesc('Action permission level used for Antigravity commands and edits.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('acceptEdits', 'Accept Edits')
          .addOption('prompt', 'Prompt')
          .addOption('deny', 'Deny')
          .setValue(antigravitySettings.safeMode)
          .onChange(async (value) => {
            updateAntigravityProviderSettings(
              settingsBag,
              { safeMode: value },
            );
            await context.plugin.saveSettings();
          });
      });

    // --- Environment ---

    renderEnvironmentSettingsSection({
      container,
      plugin: context.plugin,
      scope: 'provider:antigravity',
      heading: t('settings.environment'),
      name: 'Antigravity environment',
      desc: 'Antigravity-specific environment variables (e.g. GEMINI_API_KEY, export terms, etc.).',
      placeholder: 'GEMINI_API_KEY=your-key-here\nGEMINI_BASE_URL=https://api.gemini.com',
      renderCustomContextLimits: (target) => context.renderCustomContextLimits(target, 'antigravity'),
    });
  },
};
