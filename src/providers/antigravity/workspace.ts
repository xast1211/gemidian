import type { ProviderWorkspaceRegistration } from '../../core/providers/types';

export const antigravityWorkspaceRegistration: ProviderWorkspaceRegistration = {
  initialize: async () => {
    return {
      cliResolver: {
        resolveFromSettings: () => 'antigravity',
        reset: () => {},
      },
    };
  },
};
