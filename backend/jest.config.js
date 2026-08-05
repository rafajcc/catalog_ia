module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/../test'],
  testMatch: ['**/*.test.ts', '**/*.test.js'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
  coverageDirectory: 'coverage',
  verbose: true
};
