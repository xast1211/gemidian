import type { ProviderWorkspaceRegistration } from '../../core/providers/types';
import { antigravitySettingsTabRenderer } from './ui/AntigravitySettingsTab';

export const antigravityWorkspaceRegistration: ProviderWorkspaceRegistration = {
  initialize: async () => {
    return {
      cliResolver: {
        resolveFromSettings: () => 'antigravity',
        reset: () => {},
      },
      settingsTabRenderer: antigravitySettingsTabRenderer,
    };
  },
};

