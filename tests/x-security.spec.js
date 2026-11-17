const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect, ADMIN, STUDENTS } = H;
const L = H.lane(test, 'X', { ui: false, stream: true });
let admin;
test.beforeAll(async () => { admin = await H.apiAs(ADMIN); });
test.afterEach(async () => { await H.cleanTemps(admin); });
test.afterAll(async () => { await admin.dispose(); });

const examId = async title => (await (await admin.get('/api/admin/exams')).json()).find(e => e.title === title).id;
const note = (m, r) => L.log(`${m} -> HTTP ${r.status()}`);

test('[X01] Student cannot open another student\'s examination (HTTP 403)', async ({}, ti) => {
  const s1 = await H.apiAs(STUDENTS[0]);
  const other = await examId(STUDENTS[1].exam);
  const own = await examId(STUDENTS[0].exam);
  const r = await s1.get('/api/exams/' + other); note('Student 1 GET exam of Student 2', r);
  const r2 = await s1.post(`/api/exams/${other}/start`); note('Student 1 POST start exam of Student 2', r2);
  const ok = await s1.get('/api/exams/' + own); note('Student 1 GET own exam', ok);
  expect(r.status()).toBe(403); expect(r2.status()).toBe(403); expect(ok.status()).toBe(200);
  await H.demoFail(ti, 'HTTP status for another student\'s exam', r.status(), 200);
  await s1.dispose();
});
test('[X02] Student cannot use admin APIs (HTTP 403)', async ({}, ti) => {
  const s = await H.apiAs(STUDENTS[2]);
  const r = await s.get('/api/admin/students'); note('Student GET /api/admin/students', r);
  const r2 = await s.post('/api/admin/exams', { data: { title: 'Hack', duration_min: 5, marks_per_q: 1 } }); note('Student POST /api/admin/exams', r2);
  expect(r.status()).toBe(403); expect(r2.status()).toBe(403);
  await H.demoFail(ti, 'HTTP status for admin API as student', r.status(), 200);
  await s.dispose();
});
test('[X03] Unauthenticated requests are rejected (HTTP 401)', async ({}, ti) => {
  const a = await H.anon();
  const r1 = await a.get('/api/admin/students'); const r2 = await a.get('/api/student/exams'); const r3 = await a.get('/api/exams/1');
  [r1, r2, r3].forEach((r, i) => note(['admin students', 'student exams', 'exam 1'][i], r));
  expect([r1.status(), r2.status(), r3.status()]).toEqual([401, 401, 401]);
  await H.demoFail(ti, 'HTTP status without login', r1.status(), 200);
  await a.dispose();
});
test('[X04] Wrong password and empty login are rejected', async ({}, ti) => {
  const a = await H.anon();
  const r1 = await a.post('/api/login', { data: { email: STUDENTS[0].email, password: 'nope' } });
  const r2 = await a.post('/api/login', { data: {} });
  const r3 = await a.post('/api/login', { data: { email: 'ghost@college.edu', password: 'Student@123' } });
  note('wrong password', r1); note('empty body', r2); note('unknown user', r3);
  expect([r1.status(), r2.status(), r3.status()]).toEqual([401, 400, 401]);
  expect(r1.headers()['set-cookie']).toBeUndefined();
  await H.demoFail(ti, 'HTTP status for wrong password', r1.status(), 200);
  await a.dispose();
});
test('[X05] Correct answers are never sent to the student before submission', async ({}, ti) => {
  const t = await H.makeTemp(admin, { tag: 'a' });
  const s = await H.apiAs(t);
  await s.post(`/api/exams/${t.examId}/start`);
  const body = await (await s.get(`/api/exams/${t.examId}/attempt`)).text(); L.log('GET attempt payload checked for "correct"');
  expect(body).not.toMatch(/"correct"/);
  expect(JSON.parse(body).questions).toHaveLength(3);
  await H.demoFail(ti, 'Payload contains "correct" key', body.includes('"correct"'), true);
  await s.dispose();
});
test('[X06] Result is not available before submission (HTTP 403)', async ({}, ti) => {
  const t = await H.makeTemp(admin, { tag: 'b' });
  const s = await H.apiAs(t);
  await s.post(`/api/exams/${t.examId}/start`);
  const r = await s.get(`/api/exams/${t.examId}/result`); note('GET result before submit', r);
  expect(r.status()).toBe(403);
  await H.demoFail(ti, 'HTTP status for early result', r.status(), 200);
  await s.dispose();
});
test('[X07] Duplicate submission is rejected (HTTP 409) and the score stays unchanged', async ({}, ti) => {
  const t = await H.makeTemp(admin, { tag: 'c' });
  const s = await H.apiAs(t);
  await s.post(`/api/exams/${t.examId}/start`);
  const qs = (await (await s.get(`/api/exams/${t.examId}/attempt`)).json()).questions;
  await s.put(`/api/exams/${t.examId}/answer`, { data: { questionId: qs[0].id, choice: 0 } }); // Q1 correct = 0
  const first = await s.post(`/api/exams/${t.examId}/submit`); note('first submit', first);
  const second = await s.post(`/api/exams/${t.examId}/submit`); note('second submit', second);
  const late = await s.put(`/api/exams/${t.examId}/answer`, { data: { questionId: qs[1].id, choice: 1 } }); note('answer after submit', late);
  const restart = await s.post(`/api/exams/${t.examId}/start`); note('start again', restart);
  const res = await (await s.get(`/api/exams/${t.examId}/result`)).json();
  expect([first.status(), second.status(), late.status(), restart.status()]).toEqual([200, 409, 409, 409]);
  expect(res.score).toBe(1);
  await H.demoFail(ti, 'HTTP status of second submit', second.status(), 200);
  await s.dispose();
});
test('[X08] Invalid answers are rejected (HTTP 400)', async ({}, ti) => {
  const t = await H.makeTemp(admin, { tag: 'd' });
  const s = await H.apiAs(t);
  await s.post(`/api/exams/${t.examId}/start`);
  const qs = (await (await s.get(`/api/exams/${t.examId}/attempt`)).json()).questions;
  const bad = await s.put(`/api/exams/${t.examId}/answer`, { data: { questionId: qs[0].id, choice: 9 } }); note('choice 9', bad);
  const str = await s.put(`/api/exams/${t.examId}/answer`, { data: { questionId: qs[0].id, choice: 'A' } }); note('choice "A"', str);
  const foreign = await s.put(`/api/exams/${t.examId}/answer`, { data: { questionId: 999999, choice: 1 } }); note('unknown question', foreign);
  expect([bad.status(), str.status(), foreign.status()]).toEqual([400, 400, 400]);
  await H.demoFail(ti, 'HTTP status for choice 9', bad.status(), 200);
  await s.dispose();
});
test('[X09] The server calculates marks and ignores a score sent by the client', async ({}, ti) => {
  const t = await H.makeTemp(admin, { tag: 'e' });
  const s = await H.apiAs(t);
  await s.post(`/api/exams/${t.examId}/start`);
  const r = await s.post(`/api/exams/${t.examId}/submit`, { data: { score: 3, total: 3, percent: 100 } }); note('submit with fake score 3/3, no answers', r);
  const res = await (await s.get(`/api/exams/${t.examId}/result`)).json();
  expect(res.score).toBe(0); expect(res.unanswered).toBe(3);
  await H.demoFail(ti, 'Score after fake client score', res.score, 3);
  await s.dispose();
});
test('[X10] Passwords are stored as salted hashes', async ({}, ti) => {
  const s = await H.state(); L.log('Checked every student password column starts with scrypt$ and is not the plain text');
  expect(s.students.length).toBe(4);
  expect(s.students.every(x => x.hashed)).toBe(true);
  await H.demoFail(ti, 'All passwords hashed', s.students.every(x => x.hashed), false);
});
test('[X11] Student is blocked from the admin pages in the browser', async ({}, ti) => {
  await H.uiLogin(L.page, STUDENTS[3], '#exam-list');
  await L.page.goto('/#/admin/students');
  await expect(L.page.locator('h2')).toHaveText('403 - Access denied');
  await expect(L.page.locator('#s-table')).toHaveCount(0);
  await H.demoFail(ti, 'Heading shown to student on admin URL', await L.page.locator('h2').textContent(), 'Students (4)');
});
