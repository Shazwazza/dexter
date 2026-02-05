/**
 * GitHub Copilot SDK integration for Dexter.
 * 
 * Provides a LangChain-compatible wrapper around the @github/copilot-sdk,
 * allowing Copilot to be used as a drop-in replacement for other LLM providers.
 * 
 * Authentication is handled via the Copilot CLI - users must run `copilot auth login`
 * before using this provider. No API keys are required.
 */
import { CopilotClient, CopilotSession } from '@github/copilot-sdk';
import { SimpleChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult } from '@langchain/core/outputs';

/**
 * Options for ChatCopilot model initialization.
 */
export interface ChatCopilotOptions extends BaseChatModelParams {
  /** The model to use (e.g., 'gpt-4.1', 'gpt-5.2', 'claude-sonnet-4-5') */
  model?: string;
  /** Whether to enable streaming responses */
  streaming?: boolean;
  /** Timeout for sendAndWait in milliseconds (default: 120000 = 2 minutes) */
  timeout?: number;
}

/**
 * A singleton manager for the CopilotClient.
 * Ensures only one client instance exists across all ChatCopilot instances.
 */
class CopilotClientManager {
  private static instance: CopilotClientManager | null = null;
  private client: CopilotClient | null = null;
  private startPromise: Promise<void> | null = null;
  private sessionCount = 0;

  private constructor() {}

  static getInstance(): CopilotClientManager {
    if (!CopilotClientManager.instance) {
      CopilotClientManager.instance = new CopilotClientManager();
    }
    return CopilotClientManager.instance;
  }

  async getClient(): Promise<CopilotClient> {
    if (!this.client) {
      this.client = new CopilotClient();
    }

    // Ensure the client is started
    if (!this.startPromise) {
      this.startPromise = this.client.start();
    }
    await this.startPromise;

    this.sessionCount++;
    return this.client;
  }

  async releaseClient(): Promise<void> {
    this.sessionCount--;
    // Don't stop the client when sessions are released - let it live for future calls
    // The client will be stopped when the process exits
  }

  async forceStop(): Promise<void> {
    if (this.client) {
      try {
        await this.client.stop();
      } catch {
        // Ignore errors during shutdown
      }
      this.client = null;
      this.startPromise = null;
      this.sessionCount = 0;
    }
  }
}

/**
 * LangChain-compatible chat model wrapper for GitHub Copilot SDK.
 * 
 * This class allows using GitHub Copilot as a drop-in replacement for other
 * LLM providers in Dexter. It manages the CopilotClient lifecycle and provides
 * a simple interface for generating responses.
 * 
 * @example
 * ```typescript
 * const copilot = new ChatCopilot({ model: 'gpt-4.1' });
 * const result = await copilot.invoke([new HumanMessage('Hello!')]);
 * console.log(result.content);
 * ```
 */
export class ChatCopilot extends SimpleChatModel<ChatCopilotOptions> {
  static lc_name(): string {
    return 'ChatCopilot';
  }

  lc_serializable = false;

  private modelName: string;
  private streamingEnabled: boolean;
  private timeout: number;
  private currentSession: CopilotSession | null = null;

  constructor(options: ChatCopilotOptions = {}) {
    super(options);
    this.modelName = options.model || 'gpt-4.1';
    this.streamingEnabled = options.streaming || false;
    this.timeout = options.timeout || 120000; // 2 minutes default
  }

  _llmType(): string {
    return 'copilot';
  }

  /**
   * Get the identifying parameters for this model.
   */
  override invocationParams(): Record<string, unknown> {
    return {
      model: this.modelName,
      streaming: this.streamingEnabled,
    };
  }

  /**
   * Convert LangChain messages to a single prompt string.
   * The Copilot SDK expects a single prompt rather than a message array.
   */
  private messagesToPrompt(messages: BaseMessage[]): string {
    const parts: string[] = [];

    for (const message of messages) {
      const content = typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content);

      if (message instanceof SystemMessage) {
        parts.push(`System: ${content}`);
      } else if (message instanceof HumanMessage) {
        parts.push(`User: ${content}`);
      } else if (message instanceof AIMessage) {
        parts.push(`Assistant: ${content}`);
      } else {
        parts.push(content);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Create or reuse a Copilot session.
   */
  private async getSession(): Promise<CopilotSession> {
    const client = await CopilotClientManager.getInstance().getClient();

    if (!this.currentSession) {
      this.currentSession = await client.createSession({
        model: this.modelName,
        streaming: this.streamingEnabled,
      });
    }

    return this.currentSession;
  }

  /**
   * Generate a response from Copilot.
   * Implements the abstract _call method from SimpleChatModel.
   */
  async _call(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    const session = await this.getSession();
    const prompt = this.messagesToPrompt(messages);

    if (this.streamingEnabled && runManager) {
      // Handle streaming - collect deltas and emit tokens
      let fullContent = '';
      
      const unsubscribe = session.on('assistant.message_delta', (event) => {
        const delta = event.data.deltaContent;
        if (delta) {
          fullContent += delta;
          runManager.handleLLMNewToken(delta);
        }
      });

      try {
        await session.sendAndWait({ prompt }, this.timeout);
      } finally {
        unsubscribe();
      }

      return fullContent;
    } else {
      // Non-streaming - wait for full response
      const response = await session.sendAndWait({ prompt }, this.timeout);
      return response?.data.content || '';
    }
  }

  /**
   * Override _generate for better control over the ChatResult structure.
   */
  override async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const text = await this._call(messages, options, runManager);
    
    return {
      generations: [{
        text,
        message: new AIMessage({ content: text }),
      }],
      llmOutput: {
        model: this.modelName,
        provider: 'copilot',
      },
    };
  }

  /**
   * Clean up resources.
   * Call this when you're done using the model to release the session.
   */
  async close(): Promise<void> {
    if (this.currentSession) {
      try {
        await this.currentSession.destroy();
      } catch {
        // Ignore errors during cleanup
      }
      this.currentSession = null;
    }
    await CopilotClientManager.getInstance().releaseClient();
  }
}

/**
 * Check if the Copilot CLI is available and authenticated.
 * Returns true if Copilot can be used, false otherwise.
 */
export async function checkCopilotAvailable(): Promise<boolean> {
  try {
    const client = new CopilotClient();
    await client.start();
    const status = await client.getAuthStatus();
    await client.stop();
    return status.isAuthenticated === true;
  } catch {
    return false;
  }
}

/**
 * Get the list of available models from Copilot.
 */
export async function getCopilotModels(): Promise<string[]> {
  try {
    const client = new CopilotClient();
    await client.start();
    const models = await client.listModels();
    await client.stop();
    return models.map((m: { id: string }) => m.id);
  } catch {
    // Return default models if we can't fetch
    return ['gpt-4.1', 'gpt-5.2', 'claude-sonnet-4-5', 'claude-opus-4-5'];
  }
}
