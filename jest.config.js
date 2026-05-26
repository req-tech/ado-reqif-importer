/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          jsx: 'react-jsx',
          strict: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          baseUrl: '.',
          paths: {
            '@/*': ['src/*'],
          },
        },
      },
    ],
  },
  moduleNameMapper: {
    '\\.css$': '<rootDir>/tests/__mocks__/styleMock.js',
    '\\.svg$': '<rootDir>/tests/__mocks__/styleMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: ['<rootDir>/tests/setup/dom-shim.ts'],
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/hub/hub.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
