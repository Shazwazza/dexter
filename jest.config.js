/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@github/copilot-sdk$': '<rootDir>/__mocks__/@github/copilot-sdk.js',
  },
  transform: {
    // Transform TypeScript files with ts-jest
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
      },
    ],
    // Transform ESM JavaScript packages from node_modules with babel-jest
    'node_modules/(p-retry|is-network-error|@langchain|@github)/.+\\.js$': [
      'babel-jest',
      {
        presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
      },
    ],
  },
  // Transform ESM packages from node_modules that Jest can't handle natively
  transformIgnorePatterns: [
    'node_modules/(?!(p-retry|is-network-error|@langchain|@github)/)',
  ],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/agent/**/*.ts',
    'src/model/**/*.ts',
    '!src/agent/**/*.test.ts',
    '!src/model/**/*.test.ts',
    '!src/agent/__tests__/**',
    '!src/model/__tests__/**',
    '!src/agent/index.ts',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};

