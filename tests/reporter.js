// Custom Playwright reporter: streams live status to the dashboard and writes all evidence files.
const fs = require('fs');
const path = require('path');
const RUN_DIR = process.env.RUN_DIR || path.join(__dirname, '..', 'evidence', 'manual-run');
const DEMO = new Set((process.env.DEMO_FAIL || '').split(',').filter(Boolean));
const strip = s => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
const emit = o => process.stdout.write('@@EV ' + JSON.stringify(o) + '\n');
const idOf = t => (t.title.match(/^\[([^\]]+)\]/) || [])[1];
const nameOf = t => t.title.replace(/^\[[^\]]+\]\s*/, '');
const groupOf = id => ({ A: 'Admin', S: 'Student exam flow', X: 'Security & validation', T: 'Timer & auto-submit', R: 'Results & reports' }[id[0]]);

class Reporter {
  constructor() { this.res = new Map(); this.t0 = Date.now(); fs.mkdirSync(RUN_DIR, { recursive: true }); }
  onBegin(config, suite) {
    this.tests = suite.allTests().map(t => idOf(t));
    emit({ type: 'begin', ids: this.tests, runDir: path.basename(RUN_DIR), mode: process.env.MODE, demo: [...DEMO] });
  }
  onTestBegin(test) { emit({ type: 'test', id: idOf(test), status: 'RUNNING', t: Date.now() }); }
  onTestEnd(test, result) {
    const id = idOf(test);
    const failed = result.status !== 'passed';
    const msg = strip(result.error && (result.error.message || result.error.value));
    let r = { id, name: nameOf(test), group: groupOf(id), status: failed ? 'FAIL' : 'PASS', ms: result.duration, intentional: false, expected: '', actual: '', explanation: '', shots: [] };
    if (failed) {
      const i = msg.indexOf('INTENTIONAL_DEMO::');
      if (i >= 0) {
        const d = JSON.parse(msg.slice(i + 18).split('\n')[0]);
        r.intentional = true; r.expected = String(d.expected); r.actual = String(d.actual);
        r.explanation = `INTENTIONAL DEMONSTRATION FAILURE. "${d.label}" was compared with a deliberately incorrect expected value (${d.expected}). The application behaved correctly (actual: ${d.actual}). This is not an application defect.`;
      } else {
        const ex = msg.match(/Expected[^\n:]*:\s*(.*)/), rc = msg.match(/Received[^\n:]*:\s*(.*)/);
        r.expected = ex ? ex[1] : '(see explanation)'; r.actual = rc ? rc[1] : '(see explanation)';
        r.explanation = 'GENUINE FAILURE: ' + msg.split('\n').filter(Boolean).slice(0, 6).join(' | ');
      }
    }
    // evidence screenshots -> <run>/screenshots/<test id>/
    const dir = path.join(RUN_DIR, 'screenshots', id); fs.mkdirSync(dir, { recursive: true });
    (result.attachments || []).filter(a => a.name === 'screenshot' && a.body).forEach((a, k) => {
      const f = `${id}-${k + 1}.png`; fs.writeFileSync(path.join(dir, f), a.body); r.shots.push(`screenshots/${id}/${f}`);
    });
    if (failed) fs.appendFileSync(path.join(RUN_DIR, 'errors.log'), `[${id}] ${r.name}\n${r.explanation}\n${msg}\n\n`);
    fs.appendFileSync(path.join(RUN_DIR, 'logs.txt'), `${new Date().toISOString()} ${r.status.padEnd(4)} ${id.padEnd(6)} ${String(r.ms).padStart(6)}ms ${r.intentional ? '(intentional) ' : ''}${r.name}\n`);
    this.res.set(id, r);
    emit({ type: 'test', ...r });
  }
  async onEnd() {
    const list = [...this.res.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const wall = Date.now() - this.t0;
    const passed = list.filter(r => r.status === 'PASS').length, failed = list.length - passed;
    const intentional = list.filter(r => r.intentional).length;
    const sum = { runId: path.basename(RUN_DIR), mode: process.env.MODE || 'presentation', startedAt: new Date(this.t0).toISOString(), wallMs: wall, total: list.length, passed, failed, intentional, genuine: failed - intentional, tests: list };
    fs.writeFileSync(path.join(RUN_DIR, 'results.json'), JSON.stringify(sum, null, 2));
    // CSV (opens in Excel)
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['ID', 'Test case', 'Category', 'Status', 'Failure type', 'Expected', 'Actual', 'Duration (ms)', 'Explanation'].map(q).join(',')]
      .concat(list.map(r => [r.id, r.name, r.group, r.status, r.status === 'PASS' ? '-' : r.intentional ? 'Intentional demonstration' : 'Genuine defect', r.expected, r.actual, r.ms, r.explanation].map(q).join(',')));
    fs.writeFileSync(path.join(RUN_DIR, 'report.csv'), '﻿' + rows.join('\r\n'));
    // screenshots + videos pages
    const css = '<style>body{font:15px system-ui;margin:20px;background:#f3f6fb;color:#0f172a}h2{color:#1d4ed8}img,video{max-width:480px;border:1px solid #ccd;margin:4px;border-radius:6px}.f{color:#b91c1c}</style>';
    fs.writeFileSync(path.join(RUN_DIR, 'screenshots.html'), `<meta charset=utf-8><title>Screenshots</title>${css}<h1>Screenshots - ${sum.runId}</h1>` + list.map(r => `<h2 class="${r.status === 'FAIL' ? 'f' : ''}">${r.id} ${r.status} - ${r.name}</h2>` + r.shots.map(s => `<a href="${s}"><img src="${s}"></a>`).join('')).join(''));
    const vids = []; const vd = path.join(RUN_DIR, 'videos');
    if (fs.existsSync(vd)) for (const l of fs.readdirSync(vd)) for (const f of fs.readdirSync(path.join(vd, l))) if (f.endsWith('.webm')) vids.push(`videos/${l}/${f}`);
    fs.writeFileSync(path.join(RUN_DIR, 'videos.html'), `<meta charset=utf-8><title>Execution videos</title>${css}<h1>Execution videos - ${sum.runId}</h1>` + (vids.map(v => `<div><p>${v}</p><video src="${v}" controls width="640"></video></div>`).join('') || '<p>No videos recorded.</p>'));
    // run history (used for the control chart on the metrics page)
    const hf = path.join(RUN_DIR, '..', 'history.json');
    let h = []; try { h = JSON.parse(fs.readFileSync(hf, 'utf8')); } catch {}
    if (list.length >= 40) h.push({ runId: sum.runId, mode: sum.mode, startedAt: sum.startedAt, wallMs: wall, total: sum.total, passed, failed, intentional, genuine: sum.genuine });
    fs.writeFileSync(hf, JSON.stringify(h, null, 2));
    emit({ type: 'end', summary: { ...sum, tests: undefined } });
  }
}
module.exports = Reporter;
