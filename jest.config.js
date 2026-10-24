/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
};
