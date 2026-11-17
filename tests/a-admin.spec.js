const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect, ADMIN, STUDENTS, TITLES, bank } = H;
const L = H.lane(test, 'A');
const rows = sel => L.page.locator(sel + ' tbody tr');
const msgOf = async s => (await L.page.locator(s).textContent()) || '';

test('[A01] Admin login with a wrong password is rejected', async ({}, ti) => {
  await L.page.goto('/');
  await L.page.fill('#email', ADMIN.email); await L.page.fill('#password', 'wrong-password');
  await L.page.click('#login-btn');
  await expect(L.page.locator('#login-msg')).toHaveText('Invalid email or password');
  await H.demoFail(ti, 'Error message shown', await msgOf('#login-msg'), 'Login successful');
});
test('[A02] Admin logs in with valid credentials', async ({}, ti) => {
  await L.page.fill('#password', ADMIN.password);
  await L.page.click('#login-btn');
  await expect(L.page.locator('#tabs')).toBeVisible();
  await expect(L.page.locator('#who')).toHaveText('Administrator (admin)');
  await H.demoFail(ti, 'Logged-in user label', await L.page.locator('#who').textContent(), 'Student 1 (student)');
});
test('[A03] Admin adds the four student accounts', async ({}, ti) => {
  await H.adminTab(L.page, 'students');
  for (const [k, s] of STUDENTS.entries()) {
    await expect(rows('#s-table')).toHaveCount(k);
    await L.page.fill('#s-name', s.name); await L.page.fill('#s-email', s.email); await L.page.fill('#s-pass', s.password); await L.page.fill('#s-roll', s.roll);
    await L.page.click('#s-save');
    await expect(rows('#s-table')).toHaveCount(k + 1);
    await expect(L.page.locator('#s-msg')).toHaveText('Student added');
  }
  await expect(rows('#s-table')).toHaveCount(4);
  await H.demoFail(ti, 'Number of students in table', await rows('#s-table').count(), 5);
});
test('[A04] Admin edits a student record', async ({}, ti) => {
  await H.adminTab(L.page, 'students');
  await L.page.locator('.s-edit').nth(1).click();
  await expect(L.page.locator('#s-save')).toHaveText('Save Student');
  await L.page.fill('#s-roll', 'CS2026102'); await L.page.click('#s-save');
  await expect(L.page.locator('#s-msg')).toHaveText('Student updated');
  await expect(rows('#s-table').nth(1)).toContainText('CS2026102');
  await H.demoFail(ti, 'Roll number of Student 2', (await rows('#s-table').nth(1).locator('td').nth(2).textContent()), 'CS2026999');
});
test('[A05] Admin deletes a student', async ({}, ti) => {
  await H.adminTab(L.page, 'students');
  await expect(rows('#s-table')).toHaveCount(4);
  await L.page.fill('#s-name', 'Temp Delete'); await L.page.fill('#s-email', 'tmp-delete@college.edu'); await L.page.fill('#s-pass', 'Temp@1234');
  await L.page.click('#s-save');
  await expect(rows('#s-table')).toHaveCount(5);
  await L.page.locator('#s-table tr', { hasText: 'tmp-delete@college.edu' }).locator('.s-del').click();
  await L.page.click('#confirm-yes');
  await expect(rows('#s-table')).toHaveCount(4);
  await H.demoFail(ti, 'Students after delete', await rows('#s-table').count(), 5);
});
test('[A06] Admin creates the four examinations with duration and marks', async ({}, ti) => {
  await H.adminTab(L.page, 'exams');
  for (const [k, t] of TITLES.entries()) {
    await expect(rows('#e-table')).toHaveCount(k);
    await L.page.fill('#e-title', t); await L.page.fill('#e-dur', '20'); await L.page.fill('#e-marks', '1');
    await L.page.click('#e-save');
    await expect(rows('#e-table')).toHaveCount(k + 1);
    await expect(L.page.locator('#e-msg')).toHaveText('Exam created');
  }
  await expect(rows('#e-table')).toHaveCount(4);
  await expect(rows('#e-table').first()).toContainText('20 min');
  await H.demoFail(ti, 'Number of exams in table', await rows('#e-table').count(), 3);
});
test('[A07] Admin edits an examination (duration)', async ({}, ti) => {
  await H.adminTab(L.page, 'exams');
  await L.page.locator('.e-edit').nth(3).click();
  await expect(L.page.locator('#e-save')).toHaveText('Save Exam');
  await L.page.fill('#e-dur', '25'); await L.page.click('#e-save');
  await expect(rows('#e-table').nth(3)).toContainText('25 min');
  await L.page.locator('.e-edit').nth(3).click();
  await expect(L.page.locator('#e-save')).toHaveText('Save Exam');
  await L.page.fill('#e-dur', '20'); await L.page.click('#e-save');
  await expect(rows('#e-table').nth(3)).toContainText('20 min');
  await H.demoFail(ti, 'Duration of Software Testing', await rows('#e-table').nth(3).locator('td').nth(1).textContent(), '25 min');
});
test('[A08] Admin adds an MCQ question through the form', async ({}, ti) => {
  await H.adminTab(L.page, 'questions');
  await L.page.fill('#q-text', 'Extra UI question: which is a testing tool?');
  for (const [i, o] of ['Playwright', 'Word', 'Paint', 'Calculator'].entries()) await L.page.fill('#q-o' + i, o);
  await L.page.selectOption('#q-correct', '0');
  await L.page.click('#q-save');
  await expect(L.page.locator('#q-msg')).toHaveText('Question added');
  await expect(L.page.locator('#q-count')).toHaveText('1');
  await H.demoFail(ti, 'Question count', await L.page.locator('#q-count').textContent(), '2');
});
test('[A09] Admin loads 10 questions into each examination', async ({}, ti) => {
  await H.adminTab(L.page, 'questions');
  const api = L.page.request;
  const exams = await (await api.get('/api/admin/exams')).json();
  for (const t of TITLES) {
    const e = exams.find(x => x.title === t);
    const r = await api.post(`/api/admin/exams/${e.id}/questions/bulk`, { data: { questions: bank[t].map(q => ({ text: q.q, options: q.o, correct: q.c })) } });
    expect(r.status()).toBe(201);
  }
  const after = (await (await api.get('/api/admin/exams')).json()).filter(e => !e.title.startsWith('TMP '));
  expect(after.map(e => e.question_count)).toEqual([11, 10, 10, 10]); // 10 + the 1 question added through the form
  await H.demoFail(ti, 'Question counts per exam', after.map(e => e.question_count).join(','), '10,10,10,10');
});
test('[A10] Admin edits a question', async ({}, ti) => {
  await H.adminTab(L.page, 'questions');
  await L.page.locator('.q-edit').first().click();
  await expect(L.page.locator('#q-save')).toHaveText('Save Question');
  await L.page.fill('#q-text', 'Extra UI question (edited): which is a testing tool?');
  await L.page.click('#q-save');
  await expect(L.page.locator('#q-msg')).toHaveText('Question updated');
  await expect(L.page.locator('#q-table tbody tr').first()).toContainText('(edited)');
  await H.demoFail(ti, 'Edited question text visible', String(await L.page.locator('#q-table').textContent()).includes('(edited)'), false);
});
test('[A11] Admin deletes a question', async ({}, ti) => {
  await H.adminTab(L.page, 'questions');
  await expect(L.page.locator('#q-count')).toHaveText('11');
  await L.page.locator('.q-del').first().click(); await L.page.click('#confirm-yes');
  await expect(L.page.locator('#q-count')).toHaveText('10');
  await H.demoFail(ti, 'Question count after delete', await L.page.locator('#q-count').textContent(), '11');
});
test('[A12] Admin assigns each examination to its student', async ({}, ti) => {
  await H.adminTab(L.page, 'assign');
  const exams = await (await L.page.request.get('/api/admin/exams')).json();
  const studs = await (await L.page.request.get('/api/admin/students')).json();
  for (const s of STUDENTS) {
    const e = exams.find(x => x.title === s.exam), u = studs.find(x => x.email === s.email);
    await L.page.check(`#as-${e.id}-${u.id}`);
    await L.page.click(`#a-save-${e.id}`);
    await expect(L.page.locator('#a-msg')).toContainText(`${s.exam} assigned to 1 student`);
  }
  await H.demoFail(ti, 'Last assignment message', await L.page.locator('#a-msg').textContent(), 'Saved: Software Testing assigned to 4 student(s)');
});
test('[A13] Admin verifies students, exams, questions and assignments', async ({}, ti) => {
  const s = await H.state();
  expect(H.fixturesReady(s)).toBe(true);
  expect(s.exams.every(e => e.duration_sec === 1200 && e.assigned_count === 1 && e.marks_per_q === 1)).toBe(true);
  await H.demoFail(ti, 'Fixtures ready (4 students, 4 exams x 10 questions, assigned)', H.fixturesReady(s), false);
});
test('[A14] Admin logs out and returns to the login page', async ({}, ti) => {
  await H.adminTab(L.page, 'results');
  await L.page.click('#logout');
  await expect(L.page.locator('#login-form')).toBeVisible();
  await H.demoFail(ti, 'Login form visible after logout', await L.page.locator('#login-form').isVisible(), false);
});
