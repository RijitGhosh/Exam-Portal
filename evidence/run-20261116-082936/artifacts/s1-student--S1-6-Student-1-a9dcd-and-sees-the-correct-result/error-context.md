# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: s1-student.spec.js >> [S1-6] Student 1 submits with confirmation and sees the correct result
- Location: tests/flow.js:52:3

# Error details

```
Error: INTENTIONAL_DEMO::{"label":"Score shown on result page","expected":"9 / 10","actual":"10 / 10"}
```

# Page snapshot

```yaml
- generic [active] [ref=f5e1]:
  - banner [ref=f5e2]:
    - heading "College Exam Portal" [level=1] [ref=f5e3]
    - generic [ref=f5e4]: Student 1 (student)
    - button "Dark mode" [ref=f5e5] [cursor=pointer]
    - button "Logout" [ref=f5e6] [cursor=pointer]
  - main [ref=f5e7]:
    - generic [ref=f5e8]:
      - heading "Software Engineering - Result" [level=2] [ref=f5e9]
      - generic [ref=f5e10]: Examination submitted successfully.
      - generic [ref=f5e11]: 10 / 10
      - paragraph [ref=f5e12]: 100% · 10 correct · 0 wrong · 0 unanswered
      - heading "Review" [level=3] [ref=f5e13]
      - table [ref=f5e14]:
        - rowgroup [ref=f5e15]:
          - row [ref=f5e16]:
            - cell "1" [ref=f5e17]
            - 'cell "Which SDLC model suits frequently changing requirements best? Your answer: Agile · Correct: Agile" [ref=f5e18]': "Which SDLC model suits frequently changing requirements best?Your answer: Agile · Correct: Agile"
            - cell "✔" [ref=f5e19]
          - row [ref=f5e20]:
            - cell "2" [ref=f5e21]
            - 'cell "Which UML diagram shows object interaction over time? Your answer: Sequence diagram · Correct: Sequence diagram" [ref=f5e22]': "Which UML diagram shows object interaction over time?Your answer: Sequence diagram · Correct: Sequence diagram"
            - cell "✔" [ref=f5e23]
          - row [ref=f5e24]:
            - cell "3" [ref=f5e25]
            - 'cell "Which of these is a non-functional requirement? Your answer: System responds within 2 seconds · Correct: System responds within 2 seconds" [ref=f5e26]': "Which of these is a non-functional requirement?Your answer: System responds within 2 seconds · Correct: System responds within 2 seconds"
            - cell "✔" [ref=f5e27]
          - row [ref=f5e28]:
            - cell "4" [ref=f5e29]
            - 'cell "Good software design should have which type of coupling? Your answer: Low · Correct: Low" [ref=f5e30]': "Good software design should have which type of coupling?Your answer: Low · Correct: Low"
            - cell "✔" [ref=f5e31]
          - row [ref=f5e32]:
            - cell "5" [ref=f5e33]
            - 'cell "Which is the best type of cohesion? Your answer: Functional · Correct: Functional" [ref=f5e34]': "Which is the best type of cohesion?Your answer: Functional · Correct: Functional"
            - cell "✔" [ref=f5e35]
          - row [ref=f5e36]:
            - cell "6" [ref=f5e37]
            - 'cell "The Spiral model emphasises which activity? Your answer: Risk analysis · Correct: Risk analysis" [ref=f5e38]': "The Spiral model emphasises which activity?Your answer: Risk analysis · Correct: Risk analysis"
            - cell "✔" [ref=f5e39]
          - row [ref=f5e40]:
            - cell "7" [ref=f5e41]
            - 'cell "SRS stands for Your answer: Software Requirement Specification · Correct: Software Requirement Specification" [ref=f5e42]': "SRS stands forYour answer: Software Requirement Specification · Correct: Software Requirement Specification"
            - cell "✔" [ref=f5e43]
          - row [ref=f5e44]:
            - cell "8" [ref=f5e45]
            - 'cell "Which of these is a version control tool? Your answer: Git · Correct: Git" [ref=f5e46]': "Which of these is a version control tool?Your answer: Git · Correct: Git"
            - cell "✔" [ref=f5e47]
          - row [ref=f5e48]:
            - cell "9" [ref=f5e49]
            - 'cell "In the Waterfall model, which phase follows design? Your answer: Implementation · Correct: Implementation" [ref=f5e50]': "In the Waterfall model, which phase follows design?Your answer: Implementation · Correct: Implementation"
            - cell "✔" [ref=f5e51]
          - row [ref=f5e52]:
            - cell "10" [ref=f5e53]
            - 'cell "Refactoring is done to Your answer: Improve structure without changing behaviour · Correct: Improve structure without changing behaviour" [ref=f5e54]': "Refactoring is done toYour answer: Improve structure without changing behaviour · Correct: Improve structure without changing behaviour"
            - cell "✔" [ref=f5e55]
      - paragraph [ref=f5e56]:
        - link "Back to my exams" [ref=f5e57] [cursor=pointer]:
          - /url: "#/student"
```

# Test source

```ts
  1   | const { expect, request } = require('@playwright/test');
  2   | const path = require('path');
  3   | const bank = require('../server/questionBank');
  4   | 
  5   | const BASE = process.env.BASE_URL || 'http://localhost:9000';
  6   | const RUN_DIR = process.env.RUN_DIR || path.join(__dirname, '..', 'evidence', 'manual-run');
  7   | const PANEL = process.env.PANEL_URL || '';
  8   | const DEMO = new Set((process.env.DEMO_FAIL || '').split(',').filter(Boolean));
  9   | const STREAM = (process.env.STREAM || 'all').split(',');
  10  | const TITLES = Object.keys(bank);
  11  | const ADMIN = { email: 'admin@college.edu', password: 'Admin@123' };
  12  | const STUDENTS = TITLES.map((exam, i) => ({ n: i + 1, name: `Student ${i + 1}`, email: `student${i + 1}@college.edu`, password: 'Student@123', roll: `CS2026${String(i + 1).padStart(3, '0')}`, exam }));
  13  | const TARGET = [10, 8, 7, 9]; // how many questions each student answers correctly
  14  | 
  15  | const idOf = t => (t.title.match(/^\[([^\]]+)\]/) || [])[1];
  16  | 
  17  | async function apiAs(creds) {
  18  |   const ctx = await request.newContext({ baseURL: BASE });
  19  |   const r = await ctx.post('/api/login', { data: creds });
  20  |   if (!r.ok()) throw new Error('login failed for ' + creds.email + ' ' + r.status());
  21  |   return ctx;
  22  | }
  23  | const anon = () => request.newContext({ baseURL: BASE });
  24  | const json = async r => r.json();
  25  | 
  26  | // Intentional demonstration failure: a clearly labelled, deliberately WRONG expectation.
  27  | // Only fires when this test id was ticked in the dashboard. The application is never altered.
  28  | async function demoFail(testInfo, label, actual, wrongExpected) {
  29  |   if (!DEMO.has(idOf(testInfo))) return;
> 30  |   throw new Error('INTENTIONAL_DEMO::' + JSON.stringify({ label, expected: wrongExpected, actual }));
      |         ^ Error: INTENTIONAL_DEMO::{"label":"Score shown on result page","expected":"9 / 10","actual":"10 / 10"}
  31  | }
  32  | 
  33  | // ---- fixtures ----
  34  | async function state() { const c = await anon(); const s = await (await c.get('/api/test/state')).json(); await c.dispose(); return s; }
  35  | function fixturesReady(s) {
  36  |   return s.students.length === 4 && s.exams.length === 4 && TITLES.every((t, i) => {
  37  |     const e = s.exams.find(x => x.title === t);
  38  |     return e && e.question_count === 10 && s.assignments.some(a => a.title === t && a.email === `student${i + 1}@college.edu`);
  39  |   });
  40  | }
  41  | async function waitFixtures(timeoutMs = 120000) {
  42  |   const end = Date.now() + timeoutMs;
  43  |   while (Date.now() < end) { if (fixturesReady(await state())) return; await new Promise(r => setTimeout(r, 250)); }
  44  |   const c = await anon(); await c.post('/api/test/seed'); await c.dispose(); // fallback: API seeding
  45  | }
  46  | 
  47  | // per-test temp data (isolated from the 4 real students)
  48  | let seq = 0; const temps = [];
  49  | async function cleanTemps(admin) { while (temps.length) { const t = temps.pop(); await admin.delete('/api/admin/exams/' + t.examId); await admin.delete('/api/admin/students/' + t.studentId); } }
  50  | async function makeTemp(admin, { questions = 3, minutes = 5, tag = 'x' } = {}) {
  51  |   const u = `${tag}${Date.now().toString(36)}${seq++}${Math.floor(Math.random() * 1e4)}`;
  52  |   const email = `tmp-${u}@college.edu`;
  53  |   const st = await json(await admin.post('/api/admin/students', { data: { name: 'Temp ' + u, email, password: 'Temp@1234' } }));
  54  |   const ex = await json(await admin.post('/api/admin/exams', { data: { title: 'TMP ' + u, duration_min: minutes, marks_per_q: 1 } }));
  55  |   const qs = Array.from({ length: questions }, (_, i) => ({ text: `Temp question ${i + 1}?`, options: ['A', 'B', 'C', 'D'], correct: i % 4 }));
  56  |   await admin.post(`/api/admin/exams/${ex.id}/questions/bulk`, { data: { questions: qs } });
  57  |   await admin.put(`/api/admin/exams/${ex.id}/assign`, { data: { studentIds: [st.id] } });
  58  |   const t = { studentId: st.id, email, password: 'Temp@1234', examId: ex.id, title: 'TMP ' + u, questions: qs }; temps.push(t); return t;
  59  | }
  60  | 
  61  | // ---- lane = one shared browser context/page per spec file, with live screenshot stream ----
  62  | function lane(test, name, { ui = true, stream = true } = {}) {
  63  |   const L = { page: null, ctx: null, notes: [], log: s => L.notes.push(s) };
  64  |   let run = false, shooting = false;
  65  |   test.beforeAll(async ({ browser }) => {
  66  |     test.setTimeout(120000);
  67  |     if (name !== 'A') await waitFixtures();
  68  |     L.ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1100, height: 680 }, recordVideo: { dir: path.join(RUN_DIR, 'videos', name), size: { width: 1100, height: 680 } } });
  69  |     L.page = await L.ctx.newPage();
  70  |     await L.page.addInitScript(() => { window.__POLL_MS = 250; });
  71  |     if (PANEL && stream && (STREAM.includes('all') || STREAM.includes(name))) {
  72  |       run = true;
  73  |       (async () => {
  74  |         while (run) {
  75  |           try { if (shooting) { await new Promise(r => setTimeout(r, 100)); continue; } const b = await L.page.screenshot({ type: 'jpeg', quality: 55, timeout: 9000 }); await fetch(PANEL + '/panel/frame?lane=' + name, { method: 'POST', body: b.toString('base64') }); } catch {}
  76  |           await new Promise(r => setTimeout(r, 90));
  77  |         }
  78  |       })();
  79  |     }
  80  |   });
  81  |   test.beforeEach(() => { L.notes.length = 0; });
  82  |   test.afterEach(async ({}, ti) => {
  83  |     if (!L.page) return;
  84  |     shooting = true;
  85  |     try {
  86  |       if (!ui) {
  87  |         const rows = L.notes.map(n => `<li>${n.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</li>`).join('');
  88  |         await L.page.setContent(`<body style="font:15px system-ui;padding:24px;background:#f3f6fb;color:#0f172a"><h2 style="color:#1d4ed8">${ti.title.replace(/</g, '&lt;')}</h2><p>Status: <b style="color:${ti.status === 'passed' ? '#15803d' : '#b91c1c'}">${ti.status === 'passed' ? 'PASS' : 'FAIL'}</b></p><p>Requests made by the test:</p><ul>${rows}</ul></body>`);
  89  |       }
  90  |       await ti.attach('screenshot', { body: await L.page.screenshot({ timeout: 5000 }), contentType: 'image/png' });
  91  |     } catch {}
  92  |     shooting = false;
  93  |   });
  94  |   test.afterAll(async () => { run = false; await new Promise(r => setTimeout(r, 150)); try { await L.ctx.close(); } catch {} });
  95  |   return L;
  96  | }
  97  | 
  98  | // ---- UI step helpers (state driven, safe to repeat) ----
  99  | async function uiLogin(page, creds, home) {
  100 |   await page.goto('/');
  101 |   const first = page.locator('#login-form, #tabs, #exam-list, #result, #start, #qtext').first();
  102 |   await first.waitFor();
  103 |   if (await page.locator('#login-form').count()) {
  104 |     await page.fill('#email', creds.email); await page.fill('#password', creds.password);
  105 |     await page.click('#login-btn');
  106 |     await page.locator(home).first().waitFor();
  107 |   }
  108 | }
  109 | const adminTab = async (page, tab) => { await uiLogin(page, ADMIN, '#tabs'); await page.goto('/#/admin/' + tab); await expect(page.locator(`#tab-${tab}.on`)).toBeVisible(); };
  110 | 
  111 | async function openExam(page, s) {
  112 |   await uiLogin(page, s, '#exam-list');
  113 |   if (await page.locator('#start, #qtext, #result').count() === 0) { await page.goto('/#/student'); await page.locator('.open-exam').first().click(); }
  114 |   await page.locator('#start, #qtext, #result').first().waitFor();
  115 | }
  116 | async function startExam(page, s) {
  117 |   await openExam(page, s);
  118 |   if (await page.locator('#start').count()) await page.click('#start');
  119 |   await page.locator('#qtext, #result').first().waitFor();
  120 | }
  121 | const choiceFor = (s, i) => { const c = bank[s.exam][i].c; return i < TARGET[s.n - 1] ? c : (c + 1) % 4; };
  122 | async function pick(page, j) {
  123 |   await Promise.all([page.waitForResponse(r => r.url().includes('/answer') && r.request().method() === 'PUT'), page.click(`#opt-${j}`)]);
  124 | }
  125 | async function answerAll(page, s) {
  126 |   await startExam(page, s);
  127 |   await page.click('#pal-1');
  128 |   for (let i = 0; i < 10; i++) {
  129 |     await expect(page.locator('#qnum')).toHaveText(`Question ${i + 1} of 10`);
  130 |     const j = choiceFor(s, i);
```