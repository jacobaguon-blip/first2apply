import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  moduleNameMapper: {
    '^@first2apply/core$': '<rootDir>/node_modules/@first2apply/core/build/index.js',
    '^@first2apply/ui$': '<rootDir>/node_modules/@first2apply/ui/build/index.js',
  },
};

export default config;
