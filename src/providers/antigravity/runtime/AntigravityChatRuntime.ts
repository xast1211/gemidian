import { Notice } from 'obsidian';
import * as readline from 'readline';
import type ClaudianPlugin from '../../../main';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type { ProviderCapabilities, ProviderId } from '../../../core/providers/types';
import type { ChatMessage, Conversation, SlashCommand, StreamChunk, ToolCallInfo } from '../../../core/types';
import type {
  ApprovalCallback,
  AskUserQuestionCallback,
  AutoTurnCallback,
  ChatRewindMode,
  ChatRewindResult,
  ChatRuntimeConversationState,
  ChatRuntimeEnsureReadyOptions,
  ChatRuntimeQueryOptions,
  ChatTurnMetadata,
  ChatTurnRequest,
  ExitPlanModeCallback,
  PreparedChatTurn,
  SessionUpdateResult,
  SubagentRuntimeState,
} from '../../../core/runtime/types';
import { ANTIGRAVITY_PROVIDER_CAPABILITIES } from '../capabilities';
import { AntigravitySubprocess } from './AntigravitySubprocess';
import { getRuntimeEnvironmentVariables } from '../../../core/providers/providerEnvironment';
import { getAntigravityProviderSettings } from '../settings';
import { getHostnameKey } from '../../../utils/env';

export class AntigravityChatRuntime implements ChatRuntime {
  readonly providerId: ProviderId = 'antigravity';
  private plugin: ClaudianPlugin;
  private process: AntigravitySubprocess | null = null;
  private ready = false;
  private readyStateListeners = new Set<(ready: boolean) => void>();
  private approvalCallback: ApprovalCallback | null = null;
  private askUserCallback: AskUserQuestionCallback | null = null;
  private turnMetadata: ChatTurnMetadata = {};

  constructor(plugin: ClaudianPlugin) {
    this.plugin = plugin;
  }

  getCapabilities(): Readonly<ProviderCapabilities> {
    return ANTIGRAVITY_PROVIDER_CAPABILITIES;
  }

  prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
    return {
      prompt: request.text,
      isCompact: false,
      request,
    };
  }

  onReadyStateChange(listener: (ready: boolean) => void): () => void {
    this.readyStateListeners.add(listener);
    return () => {
      this.readyStateListeners.delete(listener);
    };
  }

  setResumeCheckpoint(checkpointId: string | undefined): void {
    // No-op
  }

  syncConversationState(
    conversation: ChatRuntimeConversationState | null,
    externalContextPaths?: string[],
  ): void {
    // No-op
  }

  async reloadMcpServers(): Promise<void> {
    // No-op
  }

  async ensureReady(options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    if (this.ready && this.process?.isAlive()) {
      return false;
    }

    const antigravitySettings = getAntigravityProviderSettings(this.plugin.settings);
    const hostnameKey = getHostnameKey();
    const command = antigravitySettings.cliPathsByHost[hostnameKey] || antigravitySettings.cliPath || 'antigravity';

    const cwd = this.plugin.app.vault.adapter.getName() ?? process.cwd();
    const env = {
      ...process.env,
      ...getRuntimeEnvironmentVariables(this.plugin.settings, 'antigravity'),
    };

    this.process = new AntigravitySubprocess({
      command,
      args: ['--json-ipc'],
      cwd,
      env,
    });

    try {
      this.process.start();
      this.ready = true;
      this.notifyReadyStateChange();
      return true;
    } catch (e) {
      new Notice('Fehler beim Starten des Antigravity Subprozesses');
      this.ready = false;
      return false;
    }
  }

  private notifyReadyStateChange(): void {
    for (const listener of this.readyStateListeners) {
      try {
        listener(this.ready);
      } catch {}
    }
  }

  async *query(
    turn: PreparedChatTurn,
    conversationHistory?: ChatMessage[],
    queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    await this.ensureReady();

    if (!this.process || !this.process.isAlive()) {
      yield { type: 'error', content: 'Antigravity Subprocess konnte nicht gestartet werden.' };
      yield { type: 'done' };
      return;
    }

    // Context Tokens schätzen (1 Token ~ 4 Zeichen)
    let estimatedTokens = Math.round(turn.prompt.length / 4);
    if (conversationHistory) {
      for (const msg of conversationHistory) {
        estimatedTokens += Math.round(msg.content.length / 4);
      }
    }
    let responseContent = '';

    // JSON-RPC Query senden
    const model = queryOptions?.model || 'gemini-3.5-flash';
    const stdinMsg = JSON.stringify({ jsonrpc: '2.0', method: 'query', params: { prompt: turn.prompt, model }, id: 1 });
    this.process.stdin.write(`${stdinMsg}\n`);

    const rl = readline.createInterface({ input: this.process.stdout });
    const chunks: StreamChunk[] = [];
    let resolveNextChunk: (() => void) | null = null;
    let streamDone = false;

    const removeCloseListener = this.process.onClose((err) => {
      chunks.push({
        type: 'error',
        content: err ? `Antigravity-Fehler: ${err.message}\nBitte überprüfe den CLI-Pfad in den Einstellungen.` : 'Antigravity-Prozess wurde unerwartet beendet.',
      });
      chunks.push({ type: 'done' });
      streamDone = true;
      if (resolveNextChunk) {
        resolveNextChunk();
        resolveNextChunk = null;
      }
      rl.close();
    });

    rl.on('line', async (line) => {
      try {
        const msg = JSON.parse(line);

        // JSON-RPC Notification: Stream Chunk
        if (msg.method === 'stream_chunk') {
          const chunk = msg.params as StreamChunk;
          if (chunk.type === 'text' || chunk.type === 'thinking') {
            responseContent += chunk.content;
          }
          chunks.push(chunk);
          if (resolveNextChunk) {
            resolveNextChunk();
            resolveNextChunk = null;
          }
          if (chunk.type === 'done') {
            streamDone = true;
            rl.close();
          }
        } 
        
        // JSON-RPC Server-Request: Tool Freigabe
        else if (msg.method === 'tool_call') {
          const { toolName, input, id } = msg.params;
          if (this.approvalCallback) {
            const description = `Ausführen des Werkzeugs "${toolName}"`;
            const decision = await this.approvalCallback(toolName, input, description, {});
            const response = JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { decision },
            });
            this.process?.stdin.write(`${response}\n`);
          } else {
            // Ablehnen als Fallback, falls kein Callback registriert ist
            const response = JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { decision: 'deny' },
            });
            this.process?.stdin.write(`${response}\n`);
          }
        }

        // JSON-RPC Server-Request: Multiple Choice Frage
        else if (msg.method === 'ask_question') {
          const { questionInput, id } = msg.params;
          if (this.askUserCallback) {
            const answers = await this.askUserCallback(questionInput, new AbortController().signal);
            const response = JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { answers },
            });
            this.process?.stdin.write(`${response}\n`);
          } else {
            const response = JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { answers: null },
            });
            this.process?.stdin.write(`${response}\n`);
          }
        }

      } catch (e) {
        // Ignorieren oder loggen
      }
    });

    try {
      while (!streamDone || chunks.length > 0) {
        if (chunks.length === 0) {
          await new Promise<void>((resolve) => {
            resolveNextChunk = resolve;
          });
        }

        while (chunks.length > 0) {
          yield chunks.shift()!;
        }
      }
    } finally {
      removeCloseListener();
    }

    // Endgültige Context Usage berechnen und senden
    const finalTokens = estimatedTokens + Math.round(responseContent.length / 4);
    const usage = {
      model,
      inputTokens: Math.round(turn.prompt.length / 4),
      contextWindow: 1048576,
      contextTokens: finalTokens,
      percentage: Math.min(100, Math.max(0, Math.round((finalTokens / 1048576) * 100))),
    };
    yield { type: 'usage', usage };
  }

  cancel(): void {
    if (this.process) {
      this.process.shutdown().catch(() => {});
    }
  }

  resetSession(): void {
    this.ready = false;
    if (this.process) {
      this.process.shutdown().catch(() => {});
      this.process = null;
    }
  }

  getSessionId(): string | null {
    return 'antigravity-session';
  }

  consumeSessionInvalidation(): boolean {
    return false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    return [
      { name: 'goal', description: 'Führt eine langlebige Aufgabe durch' },
      { name: 'schedule', description: 'Terminiert eine regelmäßige Ausführung' },
    ];
  }

  cleanup(): void {
    this.resetSession();
    this.readyStateListeners.clear();
  }

  async rewind(userMessageId: string, assistantMessageId: string, mode?: ChatRewindMode): Promise<ChatRewindResult> {
    return { canRewind: false, error: 'Rewind wird von Antigravity nicht unterstützt' };
  }

  setApprovalCallback(callback: ApprovalCallback | null): void {
    this.approvalCallback = callback;
  }

  setApprovalDismisser(dismisser: (() => void) | null): void {
    // No-op
  }

  setAskUserQuestionCallback(callback: AskUserQuestionCallback | null): void {
    this.askUserCallback = callback;
  }

  setExitPlanModeCallback(callback: ExitPlanModeCallback | null): void {
    // No-op
  }

  setPermissionModeSyncCallback(callback: ((sdkMode: string) => void) | null): void {
    // No-op
  }

  setSubagentHookProvider(getState: () => SubagentRuntimeState): void {
    // No-op
  }

  setAutoTurnCallback(callback: AutoTurnCallback | null): void {
    // No-op
  }

  consumeTurnMetadata(): ChatTurnMetadata {
    return this.turnMetadata;
  }

  buildSessionUpdates(params: {
    conversation: Conversation | null;
    sessionInvalidated: boolean;
  }): SessionUpdateResult {
    // Falls keine Usage existiert, berechnen wir eine initiale Schätzung basierend auf den Nachrichten
    const msgCount = params.conversation?.messages.length ?? 0;
    let estimatedTokens = 0;
    if (params.conversation) {
      for (const msg of params.conversation.messages) {
        estimatedTokens += Math.round(msg.content.length / 4);
      }
    }

    const usage = params.conversation?.usage || {
      model: params.conversation?.messages[msgCount - 1]?.displayContent || 'gemini-3.5-flash',
      inputTokens: 0,
      contextWindow: 1048576,
      contextTokens: estimatedTokens,
      percentage: Math.min(100, Math.max(0, Math.round((estimatedTokens / 1048576) * 100))),
    };

    return {
      updates: {
        sessionId: 'antigravity-session',
        usage,
      },
    };
  }

  resolveSessionIdForFork(conversation: Conversation | null): string | null {
    return 'antigravity-session';
  }
}
