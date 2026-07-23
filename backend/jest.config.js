/**
 * Jest config — scoped to the real jest-style suites only.
 *
 * The repo also has many "self-running" node scripts named `*.test.js`
 * (platform/**, sports/**, lib/*.test.js, economy-service.test.js,
 * portal-admin-routes.test.js) that use `require('assert')` + `process.exit`
 * and are NOT jest suites. Those are run separately by `npm run test:node`
 * (see gate-node.js). Pointing jest at them produces false "no tests" failures,
 * so we restrict jest's roots here.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/workflow-security.test.js'
  ],
  // Don't let jest try to pick up the self-running node scripts.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/platform/',
    '/sports/',
    '/forge/',
    '<rootDir>/lib/',
    '<rootDir>/economy-service.test.js',
    '<rootDir>/portal-admin-routes.test.js'
  ],
  // These suites spin up timers/servers; force-exit avoids hanging the gate.
  forceExit: true,
  detectOpenHandles: false,
  silent: true
};
