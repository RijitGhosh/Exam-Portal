const { expect, request } = require('@playwright/test');
const path = require('path');
const bank = require('../server/questionBank');

const BASE = process.env.BASE_URL || 'http://localhost:9000';
const RUN_DIR = process.env.RUN_DIR || path.join(__dirname, '..', 'evidence', 'manual-run');
const PANEL = process.env.PANEL_URL || '';
const DEMO = new Set((process.env.DEMO_FAIL || '').split(',').filter(Boolean));
const STREAM = (process.env.STREAM || 'all').split(',');
const TITLES = Object.keys(bank);
const ADMIN = { email: 'admin@college.edu', password: 'Admin@123' };
const STUDENTS = TITLES.map((exam, i) => ({ n: i + 1, name: `Student ${i + 1}`, email: `student${i + 1}@college.edu`, password: 'Student@123', roll: `CS2026${String(i + 1).padStart(3, '0')}`, exam }));
const TARGET = [10, 8, 7, 9]; // how many questions each student answers correctly

const idOf = t => (t.title.match(/^\[([^\]]+)\]/) || [])[1];

async function apiAs(creds) {
  const ctx = await request.newContext({ baseURL: BASE });
  const r = await ctx.post('/api/login', { data: creds });
  if (!r.ok()) throw new Error('login failed for ' + creds.email + ' ' + r.status());
  return ctx;
}
const anon = () => request.newContext({ baseURL: BASE });
const json = async r => r.json();

// Intentional demonstration failure: a clearly labelled, deliberately WRONG expectation.
// Only fires when this test id was ticked in the dashboard. The application is never altered.
async function demoFail(testInfo, label, actual, wrongExpected) {
  if (!DEMO.has(idOf(testInfo))) return;
  throw new Error('INTENTIONAL_DEMO::' + JSON.stringify({ label, expected: wrongExpected, actual }));
}

// ---- fixtures ----
async function state() { const c = await anon(); const s = await (await c.get('/api/test/state')).json(); await c.dispose(); return s; }
function fixturesReady(s) {
  return s.students.length === 4 && s.exams.length === 4 && TITLES.every((t, i) => {
    const e = s.exams.find(x => x.title === t);
    return e && e.question_count === 10 && s.assignments.some(a => a.title === t && a.email === `student${i + 1}@college.edu`);
  });
}
async function waitFixtures(timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { if (fixturesReady(await state())) return; await new Promise(r => setTimeout(r, 250)); }
  const c = await anon(); await c.post('/api/test/seed'); await c.dispose(); // fallback: API seeding
}

// per-test temp data (isolated from the 4 real students)
let seq = 0; const temps = [];
async function cleanTemps(admin) { while (temps.length) { const t = temps.pop(); await admin.delete('/api/admin/exams/' + t.examId); await admin.delete('/api/admin/students/' + t.studentId); } }
async function makeTemp(admin, { questions = 3, minutes = 5, tag = 'x' } = {}) {
  const u = `${tag}${Date.now().toString(36)}${seq++}${Math.floor(Math.random() * 1e4)}`;
  const email = `tmp-${u}@college.edu`;
  const st = await json(await admin.post('/api/admin/students', { data: { name: 'Temp ' + u, email, password: 'Temp@1234' } }));
  const ex = await json(await admin.post('/api/admin/exams', { data: { title: 'TMP ' + u, duration_min: minutes, marks_per_q: 1 } }));
  const qs = Array.from({ length: questions }, (_, i) => ({ text: `Temp question ${i + 1}?`, options: ['A', 'B', 'C', 'D'], correct: i % 4 }));
  await admin.post(`/api/admin/exams/${ex.id}/questions/bulk`, { data: { questions: qs } });
  await admin.put(`/api/admin/exams/${ex.id}/assign`, { data: { studentIds: [st.id] } });
  const t = { studentId: st.id, email, password: 'Temp@1234', examId: ex.id, title: 'TMP ' + u, questions: qs }; temps.push(t); return t;
}

// ---- lane = one shared browser context/page per spec file, with live screenshot stream ----
function lane(test, name, { ui = true, stream = true } = {}) {
  const L = { page: null, ctx: null, notes: [], log: s => L.notes.push(s) };
  let run = false, shooting = false;
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120000);
    if (name !== 'A') await waitFixtures();
    L.ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1100, height: 680 }, recordVideo: { dir: path.join(RUN_DIR, 'videos', name), size: { width: 1100, height: 680 } } });
    L.page = await L.ctx.newPage();
    await L.page.addInitScript(() => { window.__POLL_MS = 250; });
    if (PANEL && stream && (STREAM.includes('all') || STREAM.includes(name))) {
      run = true;
      (async () => {
        while (run) {
          try { if (shooting) { await new Promise(r => setTimeout(r, 100)); continue; } const b = await L.page.screenshot({ type: 'jpeg', quality: 55, timeout: 9000 }); await fetch(PANEL + '/panel/frame?lane=' + name, { method: 'POST', body: b.toString('base64') }); } catch {}
          await new Promise(r => setTimeout(r, 90));
        }
      })();
    }
  });
  test.beforeEach(() => { L.notes.length = 0; });
  test.afterEach(async ({}, ti) => {
    if (!L.page) return;
    shooting = true;
    try {
      if (!ui) {
        const rows = L.notes.map(n => `<li>${n.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</li>`).join('');
        await L.page.setContent(`<body style="font:15px system-ui;padding:24px;background:#f3f6fb;color:#0f172a"><h2 style="color:#1d4ed8">${ti.title.replace(/</g, '&lt;')}</h2><p>Status: <b style="color:${ti.status === 'passed' ? '#15803d' : '#b91c1c'}">${ti.status === 'passed' ? 'PASS' : 'FAIL'}</b></p><p>Requests made by the test:</p><ul>${rows}</ul></body>`);
      }
      await ti.attach('screenshot', { body: await L.page.screenshot({ timeout: 5000 }), contentType: 'image/png' });
    } catch {}
    shooting = false;
  });
  test.afterAll(async () => { run = false; await new Promise(r => setTimeout(r, 150)); try { await L.ctx.close(); } catch {} });
  return L;
}

// ---- UI step helpers (state driven, safe to repeat) ----
async function uiLogin(page, creds, home) {
  await page.goto('/');
  const first = page.locator('#login-form, #tabs, #exam-list, #result, #start, #qtext').first();
  await first.waitFor();
  if (await page.locator('#login-form').count()) {
    await page.fill('#email', creds.email); await page.fill('#password', creds.password);
    await page.click('#login-btn');
    await page.locator(home).first().waitFor();
  }
}
const adminTab = async (page, tab) => { await uiLogin(page, ADMIN, '#tabs'); await page.goto('/#/admin/' + tab); await expect(page.locator(`#tab-${tab}.on`)).toBeVisible(); };

async function openExam(page, s) {
  await uiLogin(page, s, '#exam-list');
  if (await page.locator('#start, #qtext, #result').count() === 0) { await page.goto('/#/student'); await page.locator('.open-exam').first().click(); }
  await page.locator('#start, #qtext, #result').first().waitFor();
}
async function startExam(page, s) {
  await openExam(page, s);
  if (await page.locator('#start').count()) await page.click('#start');
  await page.locator('#qtext, #result').first().waitFor();
}
const choiceFor = (s, i) => { const c = bank[s.exam][i].c; return i < TARGET[s.n - 1] ? c : (c + 1) % 4; };
async function pick(page, j) {
  await Promise.all([page.waitForResponse(r => r.url().includes('/answer') && r.request().method() === 'PUT'), page.click(`#opt-${j}`)]);
}
async function answerAll(page, s) {
  await startExam(page, s);
  await page.click('#pal-1');
  for (let i = 0; i < 10; i++) {
    await expect(page.locator('#qnum')).toHaveText(`Question ${i + 1} of 10`);
    const j = choiceFor(s, i);
    if (!(await page.locator(`#opt-${j} input`).isChecked())) await pick(page, j); // skip if already saved
    if (i < 9) await page.click('#next');
  }
}
async function submitExam(page, s) {
  await startExam(page, s);
  if (await page.locator('#result').count() === 0) { await page.click('#submit-btn'); await page.click('#confirm-yes'); }
  await page.locator('#score').waitFor();
}

module.exports = { cleanTemps, expect, BASE, RUN_DIR, ADMIN, STUDENTS, TITLES, TARGET, bank, idOf, apiAs, anon, json, demoFail, state, fixturesReady, waitFixtures, makeTemp, lane, uiLogin, adminTab, openExam, startExam, answerAll, submitExam, choiceFor, pick };
