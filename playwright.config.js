const path = require('path');
const RUN_DIR = process.env.RUN_DIR || path.join(__dirname, 'evidence', 'manual-run');
const MODE = process.env.MODE || 'presentation';       // presentation | normal | fast
const slowMo = { presentation: 90, normal: 450, fast: 0 }[MODE] ?? 0;
module.exports = {
  testDir: 'tests',
  testMatch: '*.spec.js',
  fullyParallel: false,                 // tests inside one file run in order; files run in parallel in fast mode
  workers: MODE === 'fast' ? 7 : 1,
  retries: 0,
  timeout: 90_000,
  outputDir: path.join(RUN_DIR, 'artifacts'),
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  reporter: [['./tests/reporter.js'], ['html', { outputFolder: path.join(RUN_DIR, 'playwright-report'), open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:9000',
    headless: process.env.HEADED !== '1',
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: { slowMo },
  },
};
