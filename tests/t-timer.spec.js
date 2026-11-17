const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect, ADMIN, BASE } = H;
const L = H.lane(test, 'T');
let admin;
test.beforeAll(async () => { admin = await H.apiAs(ADMIN); });
test.afterEach(async () => { await H.cleanTemps(admin); });
test.afterAll(async () => { await admin.dispose(); });
const advance = (userId, sec) => fetch(BASE + '/api/test/clock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, advanceSeconds: sec }) });

test('[T01] Exam is auto-submitted when the timer expires (accelerated test clock)', async ({}, ti) => {
  const t = await H.makeTemp(admin, { tag: 't', minutes: 1, questions: 3 });
  await H.uiLogin(L.page, t, '#exam-list');
  await L.page.locator('.open-exam').click();
  await L.page.click('#start');
  await expect(L.page.locator('#timer')).toHaveText(/^(00:5\d|01:00)$/);
  await H.pick(L.page, 0);                    // Q1 correct (A)
  await L.page.click('#next'); await H.pick(L.page, 3); // Q2 wrong (correct is B)
  await advance(t.studentId, 61);             // jump this student's clock past the deadline
  await expect(L.page.locator('#auto-note')).toBeVisible({ timeout: 8000 });
  await expect(L.page.locator('#score')).toHaveText('1 / 3');
  const sub = (await (await admin.get('/api/admin/submissions')).json()).find(x => x.email === t.email);
  expect(sub.auto).toBe(1);
  await H.demoFail(ti, 'Score after auto-submit', await L.page.locator('#score').textContent(), '3 / 3');
});
test('[T02] Server rejects answers after the deadline and records the auto-submission', async ({}, ti) => {
  const t = await H.makeTemp(admin, { tag: 'u', minutes: 1 });
  const s = await H.apiAs(t);
  await s.post(`/api/exams/${t.examId}/start`);
  const qs = (await (await s.get(`/api/exams/${t.examId}/attempt`)).json()).questions;
  expect((await s.put(`/api/exams/${t.examId}/answer`, { data: { questionId: qs[0].id, choice: 0 } })).status()).toBe(200);
  await advance(t.studentId, 70);
  const late = await s.put(`/api/exams/${t.examId}/answer`, { data: { questionId: qs[1].id, choice: 1 } });
  const st = await (await s.get(`/api/exams/${t.examId}/status`)).json();
  const again = await s.post(`/api/exams/${t.examId}/submit`);
  L.log(`late answer -> ${late.status()}, status -> ${st.status} (auto=${st.auto}), manual submit -> ${again.status()}`);
  expect(late.status()).toBe(409); expect(st.status).toBe('Submitted'); expect(st.auto).toBe(true); expect(again.status()).toBe(409);
  const res = await (await s.get(`/api/exams/${t.examId}/result`)).json();
  expect(res.score).toBe(1);
  await H.demoFail(ti, 'HTTP status of answer after deadline', late.status(), 200);
  await s.dispose();
});
