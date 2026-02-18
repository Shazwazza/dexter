// Manual mock for @github/copilot-sdk (CommonJS format for Jest)
class CopilotClient {
  async start() {
    return Promise.resolve();
  }

  async stop() {
    return Promise.resolve();
  }

  async createSession(config) {
    return Promise.resolve({
      sessionId: 'mock-session-id',
      sendAndWait: async () => ({
        data: { content: 'Mock response' }
      }),
      on: () => () => {},
      destroy: async () => Promise.resolve(),
    });
  }

  async getAuthStatus() {
    return Promise.resolve({
      isAuthenticated: true,
      authType: 'user',
    });
  }

  async listModels() {
    return Promise.resolve([
      { id: 'gpt-4.1' },
      { id: 'gpt-5.2' },
    ]);
  }
}

class CopilotSession {}

module.exports = { CopilotClient, CopilotSession };
