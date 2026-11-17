const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect, ADMIN, STUDENTS, TARGET, bank } = H;
const L = H.lane(test, 'R');

test.beforeAll(async () => {
  test.setTimeout(150000);
  const end = Date.now() + 120000;
  while (Date.now() < end && (await H.state()).submitted < 4) await new Promise(r => setTimeout(r, 400));
  const s = await H.state();
  if (s.submitted < 4) { // subset run: submit the missing attempts through the API so results can be verified
    const admin = await H.apiAs(ADMIN);
    const exams = await (await admin.get('/api/admin/exams')).json();
    for (const st of STUDENTS) {
      const c = await H.apiAs(st); const e = exams.find(x => x.title === st.exam);
      await c.post(`/api/exams/${e.id}/start`);
      const a = await (await c.get(`/api/exams/${e.id}/attempt`)).json();
      if (a.status === 'Submitted') { await c.dispose(); continue; }
      for (let i = 0; i < a.questions.length; i++) await c.put(`/api/exams/${e.id}/answer`, { data: { questionId: a.questions[i].id, choice: H.choiceFor(st, i) } });
      await c.post(`/api/exams/${e.id}/submit`); await c.dispose();
    }
    await admin.dispose();
  }
});

test('[R01] Admin sees all four submissions with the correct marks', async ({}, ti) => {
  await H.adminTab(L.page, 'results');
  const trs = L.page.locator('#r-table tbody tr');
  for (const s of STUDENTS) {
    const row = trs.filter({ hasText: s.exam }).filter({ hasText: s.name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${TARGET[s.n - 1]} / 10`);
    await expect(row).toContainText('Submitted');
  }
  await H.demoFail(ti, 'Student 3 marks in results table', await trs.filter({ hasText: 'Student 3' }).first().locator('td').nth(3).textContent(), '10 / 10');
});
test('[R02] Reports show the correct count, average, highest and lowest marks', async ({}, ti) => {
  await H.adminTab(L.page, 'reports');
  for (const s of STUDENTS) {
    const row = L.page.locator('#rep-table tbody tr').filter({ hasText: s.exam });
    const cells = (await row.locator('td').allTextContents());
    expect(cells.slice(1)).toEqual(['1', '1', String(TARGET[s.n - 1]), String(TARGET[s.n - 1]), String(TARGET[s.n - 1]), '1']);
  }
  const total = TARGET.length;
  await H.demoFail(ti, 'Software Engineering average mark', await L.page.locator('#rep-table tbody tr').first().locator('td').nth(3).textContent(), '5');
});
