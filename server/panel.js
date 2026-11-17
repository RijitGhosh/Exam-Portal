// Testing control panel back-end (only mounted when TEST_MODE=1)
const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EVID = path.join(ROOT, 'evidence');
module.exports = app => {
  fs.mkdirSync(EVID, { recursive: true });
  const clients = new Set();
  const S = { running: false, runId: null, results: {}, order: [], demo: [], mode: 'presentation', startedAt: 0, last: null, catalog: [], lastReq: null };
  const send = o => { const d = `data: ${JSON.stringify(o)}\n\n`; clients.forEach(c => c.write(d)); };
  let lastFrame = '';

  // catalog of test cases (id, name, group) from Playwright's own list
  const catalog = () => new Promise(res => {
    const p = spawn(process.execPath, [path.join(ROOT, 'node_modules/@playwright/test/cli.js'), 'test', '--list', '--reporter=json'], { cwd: ROOT, env: { ...process.env, RUN_DIR: path.join(EVID, 'list-only') } });
    let out = ''; p.stdout.on('data', d => out += d); p.on('close', () => {
      try {
        const tests = []; const walk = s => { (s.specs || []).forEach(sp => tests.push(sp.title)); (s.suites || []).forEach(walk); };
        walk({ suites: JSON.parse(out).suites });
        const G = { A: 'Admin', S: 'Student exam flow', X: 'Security & validation', T: 'Timer & auto-submit', R: 'Results & reports' };
        S.catalog = tests.map(t => { const m = t.match(/^\[([^\]]+)\]\s*(.*)/); return { id: m[1], name: m[2], group: G[m[1][0]] }; })
          .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      } catch (e) { console.error('catalog failed', e.message); }
      res();
    });
  });
  const ready = catalog();

  const DEFAULT_DEMO = ['A04', 'S1-6'];
  app.get('/panel/state', async (q, r) => { await ready; r.json({ ...S, results: S.results, defaultDemo: DEFAULT_DEMO }); });
  app.get('/panel/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.flushHeaders();
    clients.add(res); req.on('close', () => clients.delete(res));
    if (lastFrame) res.write(`data: ${JSON.stringify({ type: 'frame', data: lastFrame })}\n\n`);
  });
  app.post('/panel/frame', express.text({ limit: '3mb' }), (req, res) => { lastFrame = req.body; send({ type: 'frame', data: lastFrame, lane: req.query.lane }); res.end(); });

  app.post('/panel/run', express.json(), async (req, res) => {
    await ready;
    if (S.running) return res.status(409).json({ error: 'A run is already in progress' });
    let { ids = 'ALL', demo = [], mode = 'presentation', headed = false } = req.body || {};
    const all = S.catalog.map(t => t.id);
    if (ids !== 'ALL') {
      if (ids.some(i => /^A/.test(i))) ids = [...new Set([...ids, ...all.filter(i => /^A/.test(i))])]; // admin lane builds data in order
      if (ids.length === all.length) ids = 'ALL';
    }
    S.lastReq = { ids, demo, mode, headed };
    const runId = 'run-' + new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const dir = path.join(EVID, runId); fs.mkdirSync(dir, { recursive: true });
    const sel = ids === 'ALL' ? all : ids;
    Object.assign(S, { running: true, runId, order: sel, demo, mode, startedAt: Date.now(), results: Object.fromEntries(sel.map(i => [i, { id: i, status: 'PENDING' }])) });
    const env = { ...process.env, RUN_DIR: dir, MODE: mode, RUN_IDS: ids === 'ALL' ? 'ALL' : ids.join(','), DEMO_FAIL: demo.join(','), HEADED: headed ? '1' : '0',
      PANEL_URL: `http://localhost:${process.env.PORT || 9000}`, STREAM: mode === 'fast' ? 'A,S1' : 'all', PLAYWRIGHT_HTML_OPEN: 'never' };
    const args = [path.join(ROOT, 'node_modules/@playwright/test/cli.js'), 'test'];
    if (ids !== 'ALL') args.push('--grep', '\\[(' + ids.join('|') + ')\\]');
    send({ type: 'run-start', state: S });
    const p = spawn(process.execPath, args, { cwd: ROOT, env });
    let buf = '', errTxt = '';
    const handle = line => {
      if (!line.startsWith('@@EV ')) return;
      const e = JSON.parse(line.slice(5));
      if (e.type === 'test') S.results[e.id] = { ...S.results[e.id], ...e };
      if (e.type === 'end') S.last = e.summary;
      send(e);
    };
    p.stdout.on('data', d => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); lines.forEach(handle); });
    p.stderr.on('data', d => errTxt += d);
    p.on('close', code => {
      S.running = false;
      if (errTxt.trim()) fs.appendFileSync(path.join(dir, 'errors.log'), '\n[runner stderr]\n' + errTxt);
      send({ type: 'run-end', code, state: S });
    });
    res.json({ runId });
  });

  app.post('/panel/reset', (req, res) => {
    if (S.running) return res.status(409).json({ error: 'Run in progress' });
    fs.rmSync(EVID, { recursive: true, force: true }); fs.mkdirSync(EVID, { recursive: true });
    Object.assign(S, { runId: null, results: {}, order: [], last: null }); lastFrame = '';
    send({ type: 'reset' }); res.json({ ok: true });
  });

  // links for the latest run
  const runs = () => fs.readdirSync(EVID).filter(d => d.startsWith('run-')).sort();
  app.get('/panel/links', (req, res) => {
    const r = runs().pop(); if (!r) return res.json({});
    res.json({ runId: r, screenshots: `/evidence/${r}/screenshots.html`, videos: `/evidence/${r}/videos.html`, report: `/evidence/${r}/playwright-report/index.html`, csv: `/evidence/${r}/report.csv`, errors: `/evidence/${r}/errors.log` });
  });
  app.use('/evidence', express.static(EVID));

  // ---- quality metrics: only measured values come from results.json; the rest is labelled ----
  const loc = () => {
    let n = 0; const files = [];
    ['server/index.js', 'server/db.js', 'server/questionBank.js', 'public/app.js', 'public/style.css', 'public/index.html'].forEach(f => { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); n += t.split('\n').filter(l => l.trim()).length; files.push(f); });
    return { loc: n, files };
  };
  app.get('/panel/metrics', (req, res) => {
    const r = runs().pop(); if (!r) return res.json({});
    let s; try { s = JSON.parse(fs.readFileSync(path.join(EVID, r, 'results.json'), 'utf8')); } catch { return res.json({}); }
    let hist = []; try { hist = JSON.parse(fs.readFileSync(path.join(EVID, 'history.json'), 'utf8')); } catch {}
    const same = hist.filter(h => h.mode === s.mode).map(h => h.wallMs / 1000);
    let control = null;
    if (same.length >= 3) { const mu = same.reduce((a, b) => a + b, 0) / same.length; const sd = Math.sqrt(same.reduce((a, b) => a + (b - mu) ** 2, 0) / (same.length - 1)); control = { points: same, mean: mu, sd, ucl: mu + 3 * sd, lcl: Math.max(0, mu - 3 * sd) }; }
    let resolution = null; const rf = path.join(EVID, 'defect-resolution.json');
    if (fs.existsSync(rf)) { try { const a = JSON.parse(fs.readFileSync(rf, 'utf8')); if (a.length) resolution = a.reduce((x, y) => x + y.hours, 0) / a.length; } catch {} }
    const { loc: L, files } = loc();
    res.json({ run: s.runId, mode: s.mode, total: s.total, passed: s.passed, failed: s.failed, intentional: s.intentional, genuine: s.genuine, passPct: s.total ? +(s.passed * 100 / s.total).toFixed(1) : 0,
      wallSec: +(s.wallMs / 1000).toFixed(1), sumSec: +(s.tests.reduce((a, t) => a + t.ms, 0) / 1000).toFixed(1), loc: L, files, kloc: +(L / 1000).toFixed(2), density: s.total ? +(s.genuine / (L / 1000)).toFixed(2) : null, control, resolutionHours: resolution });
  });
};
