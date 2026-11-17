// npm run demo -> starts the app in test mode and opens the testing dashboard
const { spawn, exec } = require('child_process');
const path = require('path');
const PORT = process.env.PORT || 9000;
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { stdio: 'inherit', env: { ...process.env, TEST_MODE: '1', PORT } });
srv.on('exit', c => process.exit(c || 0));
const url = `http://localhost:${PORT}/testing.html`;
(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}/api/me`); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
  console.log('\nTesting dashboard: ' + url + '\nApplication:       http://localhost:' + PORT + '\n');
  if (!process.env.NO_OPEN) exec(process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`);
})();
process.on('SIGINT', () => srv.kill());
