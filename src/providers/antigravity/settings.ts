import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';
import { getProviderEnvironmentVariables } from '../../core/providers/providerEnvironment';
import type { HostnameCliPaths } from '../../core/types/settings';
import { getHostnameKey } from '../../utils/env';

export interface AntigravityProviderSettings {
  enabled: boolean;
  safeMode: string;
  cliPath: string;
  cliPathsByHost: HostnameCliPaths;
  customModels: string;
  lastModel: string;
  environmentVariables: string;
  environmentHash: string;
}

export const DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS: Readonly<AntigravityProviderSettings> = Object.freeze({
  enabled: true,
  safeMode: 'acceptEdits',
  cliPath: 'antigravity',
  cliPathsByHost: {},
  customModels: '',
  lastModel: 'gemini-3.5-flash',
  environmentVariables: '',
  environmentHash: '',
});

export function getAntigravityProviderSettings(
  settings: Record<string, unknown>,
): AntigravityProviderSettings {
  const config = getProviderConfig(settings, 'antigravity');
  const hostnameKey = getHostnameKey();

  return {
    enabled: (config.enabled as boolean | undefined) ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.enabled,
    safeMode: (config.safeMode as string | undefined) ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.safeMode,
    cliPath: (config.cliPath as string | undefined) ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.cliPath,
    cliPathsByHost: (config.cliPathsByHost as HostnameCliPaths | undefined) ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.cliPathsByHost,
    customModels: (config.customModels as string | undefined) ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.customModels,
    lastModel: (config.lastModel as string | undefined) ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.lastModel,
    environmentVariables: (config.environmentVariables as string | undefined)
      ?? getProviderEnvironmentVariables(settings, 'antigravity')
      ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.environmentVariables,
    environmentHash: (config.environmentHash as string | undefined) ?? DEFAULT_ANTIGRAVITY_PROVIDER_SETTINGS.environmentHash,
  };
}

export function updateAntigravityProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<AntigravityProviderSettings>,
): AntigravityProviderSettings {
  const current = getAntigravityProviderSettings(settings);
  const next = { ...current, ...updates };
  setProviderConfig(settings, 'antigravity', next);
  return next;
}
