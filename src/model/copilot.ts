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
import { logger } from '../utils/logger.js';

// Capture console errors from the Copilot SDK
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const message = args.map(arg => String(arg)).join(' ');
  
  // Check if this is a Copilot SDK error
  if (message.includes('403') || message.includes('Forbidden') || message.includes('multipart request')) {
    logger.error('[Copilot SDK] Console error captured', { message });
    
    // Also log to original console for visibility
    originalConsoleError(...args);
  } else {
    // For non-Copilot errors, just use original console.error
    originalConsoleError(...args);
  }
};

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
      logger.info('[Copilot] Creating new CopilotClient instance');
      try {
        this.client = new CopilotClient();
        logger.debug('[Copilot] CopilotClient constructor completed');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('[Copilot] Failed to create CopilotClient', { error: message });
        throw error;
      }
    }

    // Ensure the client is started
    if (!this.startPromise) {
      logger.info('[Copilot] Starting CopilotClient...');
      logger.debug('[Copilot] About to call client.start() - this may make network requests to GitHub');
      
      this.startPromise = (async () => {
        try {
          logger.debug('[Copilot] Executing client.start()...');
          
          // Add timeout to the actual start call
          const startCall = this.client!.start();
          const timeoutMs = 30000; // 30 seconds
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              logger.error('[Copilot] client.start() timed out');
              reject(new Error(`CopilotClient.start() timed out after ${timeoutMs / 1000}s`));
            }, timeoutMs);
          });
          
          await Promise.race([startCall, timeoutPromise]);
          logger.debug('[Copilot] client.start() returned successfully');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : undefined;
          logger.error('[Copilot] client.start() threw error', { error: message, stack });
          throw error;
        }
      })();
    }
    
    // Just await the promise without additional timeout
    await this.startPromise;
    logger.info('[Copilot] Client started successfully');

    this.sessionCount++;
    logger.debug(`[Copilot] Active sessions: ${this.sessionCount}`);
    return this.client;
  }

  async releaseClient(): Promise<void> {
    this.sessionCount--;
    // Don't stop the client when sessions are released - let it live for future calls
    // The client will be stopped when the process exits
  }

  async forceStop(): Promise<void> {
    if (this.client) {
      logger.info('[Copilot] Stopping client...');
      try {
        await this.client.stop();
        logger.debug('[Copilot] Client stopped successfully');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('[Copilot] Error during client shutdown', { error: message });
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
    // Normalize model name: strip copilot: prefix and convert underscores to dots
    const rawModel = options.model || 'gpt-4.1';
    this.modelName = rawModel.replace(/^copilot:/, '').replace(/_/g, '.');
    this.streamingEnabled = options.streaming || false;
    this.timeout = options.timeout || 120000; // 2 minutes default
    logger.info('[Copilot] ChatCopilot initialized', {
      rawModel,
      normalizedModel: this.modelName,
      streaming: this.streamingEnabled,
      timeout: this.timeout
    });
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
      logger.info('[Copilot] Creating new session', {
        model: this.modelName,
        streaming: this.streamingEnabled
      });
      
      try {
        logger.debug('[Copilot] Calling client.createSession() with model:', this.modelName);
        this.currentSession = await client.createSession({
          model: this.modelName,
          streaming: this.streamingEnabled,
        });
        logger.debug('[Copilot] Session created successfully');
        logger.debug('[Copilot] Session details:', {
          sessionId: (this.currentSession as any).id || 'unknown',
          model: this.modelName
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('[Copilot] Failed to create session', { error: message });
        throw error;
      }
    } else {
      logger.debug('[Copilot] Reusing existing session');
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
    
    logger.debug('[Copilot] Sending prompt', {
      promptLength: prompt.length,
      messageCount: messages.length,
      streaming: this.streamingEnabled,
      timeout: this.timeout
    });
    
    // Log first 500 chars of prompt for debugging
    logger.debug('[Copilot] Prompt preview:', prompt.substring(0, 500) + (prompt.length > 500 ? '...' : ''));

    try {
      if (this.streamingEnabled && runManager) {
        // Handle streaming - collect deltas and emit tokens
        logger.info('[Copilot] Using streaming mode');
        let fullContent = '';
        let tokenCount = 0;
        
        const unsubscribe = session.on('assistant.message_delta', (event) => {
          const delta = event.data.deltaContent;
          if (delta) {
            fullContent += delta;
            tokenCount++;
            runManager.handleLLMNewToken(delta);
          }
        });

        try {
          logger.debug('[Copilot] Calling session.sendAndWait() in streaming mode...');
          
          // Add timeout wrapper for streaming sendAndWait
          const sendPromise = session.sendAndWait({ prompt }, this.timeout);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              logger.error('[Copilot] session.sendAndWait() timed out in streaming mode');
              reject(new Error(`session.sendAndWait() timed out after ${this.timeout}ms in streaming mode.`));
            }, this.timeout);
          });
          
          await Promise.race([sendPromise, timeoutPromise]);
          logger.debug('[Copilot] Streaming complete', {
            responseLength: fullContent.length,
            tokens: tokenCount
          });
        } finally {
          unsubscribe();
        }

        return fullContent;
      } else {
        // Non-streaming - wait for full response
        logger.info('[Copilot] Using non-streaming mode');
        logger.debug('[Copilot] Calling session.sendAndWait()...');
        
        // Add timeout wrapper for sendAndWait
        const sendPromise = session.sendAndWait({ prompt }, this.timeout);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            logger.error('[Copilot] session.sendAndWait() timed out');
            reject(new Error(`session.sendAndWait() timed out after ${this.timeout}ms. The model may be taking too long to respond, or there may be a network issue.`));
          }, this.timeout);
        });
        
        const response = await Promise.race([sendPromise, timeoutPromise]);
        logger.debug('[Copilot] sendAndWait() completed');
        
        const content = response?.data.content || '';
        
        logger.debug('[Copilot] Response received', {
          responseLength: content.length
        });
        
        return content;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[Copilot] Call failed', { error: message });
      throw error;
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
      logger.info('[Copilot] Destroying session...');
      try {
        await this.currentSession.destroy();
        logger.debug('[Copilot] Session destroyed successfully');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('[Copilot] Error during session cleanup', { error: message });
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
  logger.info('[Copilot] Checking authentication status...');
  
  try {
    const client = new CopilotClient();
    await client.start();
    const status = await client.getAuthStatus();
    await client.stop();
    
    const isAuthenticated = status.isAuthenticated === true;
    logger.info('[Copilot] Auth check complete', {
      isAuthenticated,
      status: JSON.stringify(status)
    });
    
    return isAuthenticated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[Copilot] Auth check failed', { error: message });
    return false;
  }
}

/**
 * Get the list of available models from Copilot.
 */
export async function getCopilotModels(): Promise<string[]> {
  logger.info('[Copilot] Fetching available models...');
  
  try {
    const client = new CopilotClient();
    await client.start();
    const models = await client.listModels();
    await client.stop();
    
    const modelIds = models.map((m: { id: string }) => m.id);
    logger.info('[Copilot] Models fetched successfully', {
      count: modelIds.length,
      models: modelIds
    });
    
    return modelIds;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('[Copilot] Failed to fetch models, using defaults', { error: message });
    
    // Return default models if we can't fetch
    const defaultModels = ['gpt-4.1', 'gpt-5.2', 'claude-sonnet-4-5', 'claude-opus-4-5'];
    logger.debug('[Copilot] Using default models', { models: defaultModels });
    
    return defaultModels;
  }
}
