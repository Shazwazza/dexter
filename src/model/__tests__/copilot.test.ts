/**
 * Unit tests for GitHub Copilot SDK integration.
 * 
 * These tests verify the ChatCopilot class instantiation and configuration.
 * Note: Tests that require actual SDK communication are skipped since
 * they require the Copilot CLI to be installed and authenticated.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ChatCopilot } from '../copilot';

describe('ChatCopilot', () => {
  describe('constructor', () => {
    it('should create instance with default options', () => {
      const copilot = new ChatCopilot();
      expect(copilot).toBeInstanceOf(ChatCopilot);
      expect(copilot._llmType()).toBe('copilot');
    });

    it('should create instance with custom model', () => {
      const copilot = new ChatCopilot({ model: 'claude-sonnet-4-5' });
      expect(copilot).toBeInstanceOf(ChatCopilot);
      const params = copilot.invocationParams();
      expect(params.model).toBe('claude-sonnet-4-5');
    });

    it('should create instance with streaming enabled', () => {
      const copilot = new ChatCopilot({ streaming: true });
      const params = copilot.invocationParams();
      expect(params.streaming).toBe(true);
    });

    it('should create instance with custom timeout', () => {
      const copilot = new ChatCopilot({ timeout: 60000 });
      expect(copilot).toBeInstanceOf(ChatCopilot);
    });

    it('should use default model when not specified', () => {
      const copilot = new ChatCopilot();
      const params = copilot.invocationParams();
      expect(params.model).toBe('gpt-4.1');
    });

    it('should default streaming to false', () => {
      const copilot = new ChatCopilot();
      const params = copilot.invocationParams();
      expect(params.streaming).toBe(false);
    });
  });

  describe('_llmType', () => {
    it('should return "copilot"', () => {
      const copilot = new ChatCopilot();
      expect(copilot._llmType()).toBe('copilot');
    });
  });

  describe('invocationParams', () => {
    it('should return model and streaming settings', () => {
      const copilot = new ChatCopilot({ model: 'gpt-5.2', streaming: true });
      const params = copilot.invocationParams();
      expect(params).toEqual({
        model: 'gpt-5.2',
        streaming: true,
      });
    });

    it('should return default params when no options provided', () => {
      const copilot = new ChatCopilot();
      const params = copilot.invocationParams();
      expect(params).toEqual({
        model: 'gpt-4.1',
        streaming: false,
      });
    });
  });

  describe('static lc_name', () => {
    it('should return "ChatCopilot"', () => {
      expect(ChatCopilot.lc_name()).toBe('ChatCopilot');
    });
  });

  describe('lc_serializable', () => {
    it('should be false', () => {
      const copilot = new ChatCopilot();
      expect(copilot.lc_serializable).toBe(false);
    });
  });

  describe('close', () => {
    it('should not throw when called on fresh instance', async () => {
      const copilot = new ChatCopilot();
      await expect(copilot.close()).resolves.not.toThrow();
    });

    it('should not throw when called multiple times', async () => {
      const copilot = new ChatCopilot();
      await copilot.close();
      await expect(copilot.close()).resolves.not.toThrow();
    });
  });
});

describe('ChatCopilot configuration', () => {
  it('should support all expected model names', () => {
    const models = ['gpt-4.1', 'gpt-5.2', 'claude-sonnet-4-5', 'claude-opus-4-5'];
    
    for (const model of models) {
      const copilot = new ChatCopilot({ model });
      expect(copilot.invocationParams().model).toBe(model);
    }
  });

  it('should support custom models', () => {
    const copilot = new ChatCopilot({ model: 'custom-model-name' });
    expect(copilot.invocationParams().model).toBe('custom-model-name');
  });
});
