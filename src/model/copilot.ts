/**
 * GitHub Copilot SDK integration for Dexter.
 * 
 * Provides a LangChain-compatible wrapper around the @github/copilot-sdk,
 * allowing Copilot to be used as a drop-in replacement for other LLM providers.
 * 
 * Authentication is handled via the Copilot CLI - users must run `copilot auth login`
 * before using this provider. No API keys are required.
 */
import { CopilotClient, CopilotSession, type Tool as CopilotTool, defineTool } from '@github/copilot-sdk';
import { SimpleChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult } from '@langchain/core/outputs';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
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
 * Callbacks for observing tool execution within the Copilot SDK.
 * Since Copilot handles tool calls internally, these callbacks allow the agent
 * to observe tool start/end events and write results to the scratchpad.
 */
export interface CopilotToolCallbacks {
  onToolStart?: (tool: string, args: Record<string, unknown>) => void;
  onToolEnd?: (tool: string, args: Record<string, unknown>, result: string, duration: number) => void;
  onToolError?: (tool: string, args: Record<string, unknown>, error: string) => void;
}

/**
 * Module-level registry for active tool callbacks.
 * All ChatCopilot instances (including nested ones created by sub-tools like
 * financial_search) read from this registry, so the agent's callbacks are
 * observed regardless of call depth.
 */
let activeToolCallbacks: CopilotToolCallbacks = {};

export function setCopilotToolCallbacks(callbacks: CopilotToolCallbacks): void {
  activeToolCallbacks = callbacks;
}

export function clearCopilotToolCallbacks(): void {
  activeToolCallbacks = {};
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
          await this.client!.start();
          logger.debug('[Copilot] client.start() returned successfully');
        } catch (error) {
          // Reset so the next call can retry
          this.startPromise = null;
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
  private boundTools: StructuredToolInterface[] = [];

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

  /**
   * Bind LangChain tools to this model so they are passed to the Copilot session.
   * Returns a new ChatCopilot instance with tools registered; the Copilot CLI will
   * orchestrate tool calls internally and return the final answer via sendAndWait().
   */
  override bindTools(tools: StructuredToolInterface[]): this {
    const bound = new ChatCopilot({
      model: this.modelName,
      streaming: this.streamingEnabled,
      timeout: this.timeout,
    }) as this;
    bound.boundTools = tools;
    logger.debug('[Copilot] bindTools called', { toolCount: tools.length, tools: tools.map(t => t.name) });
    return bound;
  }

  /**
   * Convert a LangChain StructuredTool to the Copilot SDK Tool format.
   * The handler invokes the LangChain tool and returns its string result.
   * 
   * Tool names are prefixed with "dexter_" to avoid collisions with Copilot's
   * built-in tools (e.g. "browser", "web_search").
   */
  private langchainToolToCopilot(tool: StructuredToolInterface): CopilotTool {
    // toJsonSchema handles both Zod v3 and v4 schemas
    const parameters = toJsonSchema(tool.schema) as Record<string, unknown>;
    // Prefix names to avoid collisions with Copilot CLI built-in tools
    const sdkName = `dexter_${tool.name}`;
    return defineTool(sdkName, {
      description: tool.description,
      parameters,
      handler: async (args: unknown) => {
        const toolArgs = args as Record<string, unknown>;
        logger.debug('[Copilot] Tool handler invoked', { tool: tool.name, args: toolArgs });
        activeToolCallbacks.onToolStart?.(tool.name, toolArgs);
        const startTime = Date.now();
        try {
          const result = await tool.invoke(toolArgs);
          const text = typeof result === 'string' ? result : JSON.stringify(result);
          const duration = Date.now() - startTime;
          logger.debug('[Copilot] Tool handler completed', { tool: tool.name, resultLength: text.length });
          activeToolCallbacks.onToolEnd?.(tool.name, toolArgs, text, duration);
          return text;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error('[Copilot] Tool handler error', { tool: tool.name, error: message });
          activeToolCallbacks.onToolError?.(tool.name, toolArgs, message);
          return { textResultForLlm: `Error: ${message}`, resultType: 'failure' as const };
        }
      },
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
        streaming: this.streamingEnabled,
        toolCount: this.boundTools.length,
      });
      
      try {
        logger.debug('[Copilot] Calling client.createSession() with model:', this.modelName);
        const copilotTools = this.boundTools.map(t => this.langchainToolToCopilot(t));
        this.currentSession = await client.createSession({
          model: this.modelName,
          streaming: this.streamingEnabled,
          ...(copilotTools.length > 0 ? { tools: copilotTools } : {}),
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
          
          // Add timeout wrapper for streaming sendAndWait with proper cleanup
          let timeoutId: NodeJS.Timeout | null = null;
          const sendPromise = session.sendAndWait({ prompt }, this.timeout);
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              logger.error('[Copilot] session.sendAndWait() timed out in streaming mode');
              reject(new Error(`session.sendAndWait() timed out after ${this.timeout}ms in streaming mode.`));
            }, this.timeout);
          });
          
          try {
            await Promise.race([sendPromise, timeoutPromise]);
          } finally {
            // Cancel timeout if it hasn't fired yet
            if (timeoutId) clearTimeout(timeoutId);
          }
          
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
        
        // Add timeout wrapper for sendAndWait with proper cleanup
        let timeoutId: NodeJS.Timeout | null = null;
        const sendPromise = session.sendAndWait({ prompt }, this.timeout);
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            logger.error('[Copilot] session.sendAndWait() timed out');
            reject(new Error(`session.sendAndWait() timed out after ${this.timeout}ms. The model may be taking too long to respond, or there may be a network issue.`));
          }, this.timeout);
        });
        
        let response;
        try {
          response = await Promise.race([sendPromise, timeoutPromise]);
        } finally {
          // Cancel timeout if it hasn't fired yet
          if (timeoutId) clearTimeout(timeoutId);
        }
        
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
