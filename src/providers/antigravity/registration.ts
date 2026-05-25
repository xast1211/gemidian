import type { ProviderRegistration } from '../../core/providers/types';
import { ANTIGRAVITY_PROVIDER_CAPABILITIES } from './capabilities';
import { getAntigravityProviderSettings } from './settings';
import { AntigravityChatRuntime } from './runtime/AntigravityChatRuntime';
import { GOOGLE_ANTIGRAVITY_PROVIDER_ICON } from '../../shared/icons';

export const antigravityProviderRegistration: ProviderRegistration = {
  displayName: 'Google Antigravity',
  blankTabOrder: 10,
  isEnabled: (settings) => getAntigravityProviderSettings(settings).enabled,
  capabilities: ANTIGRAVITY_PROVIDER_CAPABILITIES,
  environmentKeyPatterns: [/^GEMINI_/i, /^ANTIGRAVITY_/i],
  chatUIConfig: {
    getModelOptions: () => [
      { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Medium)', description: 'Fast' },
      { value: 'gemini-3.5-flash-high', label: 'Gemini 3.5 Flash (High)', description: 'Fast' },
      { value: 'gemini-3.5-flash-low', label: 'Gemini 3.5 Flash (Low)', description: 'Fast' },
      { value: 'gemini-3.1-pro-low', label: 'Gemini 3.1 Pro (Low)' },
      { value: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro (High)' },
    ],
    ownsModel: (model) => model.startsWith('gemini'),
    isAdaptiveReasoningModel: () => false,
    getReasoningOptions: () => [],
    getDefaultReasoningValue: () => 'none',
    getContextWindowSize: () => 1_048_576,
    isDefaultModel: () => true,
    applyModelDefaults: () => {},
    normalizeModelVariant: (model) => model,
    getCustomModelIds: () => new Set<string>(),
    getProviderIcon: () => GOOGLE_ANTIGRAVITY_PROVIDER_ICON,
  },
  settingsReconciler: {
    normalizeModelVariantSettings: () => false,
    reconcileModelWithEnvironment: () => ({ changed: false, invalidatedConversations: [] }),
  },
  createRuntime: ({ plugin }) => new AntigravityChatRuntime(plugin),
  createTitleGenerationService: () => ({
    generateTitle: async (id, msg, cb) => cb(id, { success: true, title: 'Antigravity Session' }),
    cancel: () => {},
  }),
  createInstructionRefineService: () => ({
    resetConversation: () => {},
    refineInstruction: async (raw) => ({ success: true, refinedInstruction: raw }),
    continueConversation: async () => ({ success: true, refinedInstruction: '' }),
    cancel: () => {},
  }),
  createInlineEditService: () => ({
    resetConversation: () => {},
    editText: async () => ({ success: true, editedText: '' }),
    continueConversation: async () => ({ success: true, editedText: '' }),
    cancel: () => {},
  }),
  historyService: {
    hydrateConversationHistory: async () => {},
    deleteConversationSession: async () => {},
    resolveSessionIdForConversation: () => 'antigravity-session',
    isPendingForkConversation: () => false,
    buildForkProviderState: () => ({}),
  },
  taskResultInterpreter: {
    hasAsyncLaunchMarker: () => false,
    extractAgentId: () => null,
    extractStructuredResult: () => null,
    resolveTerminalStatus: (res, fallback) => fallback,
    extractTagValue: () => null,
  },
};
