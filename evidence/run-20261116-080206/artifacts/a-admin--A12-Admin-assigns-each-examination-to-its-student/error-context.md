# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: a-admin.spec.js >> [A12] Admin assigns each examination to its student
- Location: tests/a-admin.spec.js:119:1

# Error details

```
Error: page.click: Target page, context or browser has been closed
```

# Test source

```ts
  26  |     await L.page.fill('#s-name', s.name); await L.page.fill('#s-email', s.email); await L.page.fill('#s-pass', s.password); await L.page.fill('#s-roll', s.roll);
  27  |     await L.page.click('#s-save');
  28  |     await expect(rows('#s-table')).toHaveCount(k + 1);
  29  |     await expect(L.page.locator('#s-msg')).toHaveText('Student added');
  30  |   }
  31  |   await expect(rows('#s-table')).toHaveCount(4);
  32  |   await H.demoFail(ti, 'Number of students in table', await rows('#s-table').count(), 5);
  33  | });
  34  | test('[A04] Admin edits a student record', async ({}, ti) => {
  35  |   await H.adminTab(L.page, 'students');
  36  |   await L.page.locator('.s-edit').nth(1).click();
  37  |   await expect(L.page.locator('#s-save')).toHaveText('Save Student');
  38  |   await L.page.fill('#s-roll', 'CS2026102'); await L.page.click('#s-save');
  39  |   await expect(L.page.locator('#s-msg')).toHaveText('Student updated');
  40  |   await expect(rows('#s-table').nth(1)).toContainText('CS2026102');
  41  |   await H.demoFail(ti, 'Roll number of Student 2', (await rows('#s-table').nth(1).locator('td').nth(2).textContent()), 'CS2026999');
  42  | });
  43  | test('[A05] Admin deletes a student', async ({}, ti) => {
  44  |   await H.adminTab(L.page, 'students');
  45  |   await expect(rows('#s-table')).toHaveCount(4);
  46  |   await L.page.fill('#s-name', 'Temp Delete'); await L.page.fill('#s-email', 'tmp-delete@college.edu'); await L.page.fill('#s-pass', 'Temp@1234');
  47  |   await L.page.click('#s-save');
  48  |   await expect(rows('#s-table')).toHaveCount(5);
  49  |   await L.page.locator('#s-table tr', { hasText: 'tmp-delete@college.edu' }).locator('.s-del').click();
  50  |   await L.page.click('#confirm-yes');
  51  |   await expect(rows('#s-table')).toHaveCount(4);
  52  |   await H.demoFail(ti, 'Students after delete', await rows('#s-table').count(), 5);
  53  | });
  54  | test('[A06] Admin creates the four examinations with duration and marks', async ({}, ti) => {
  55  |   await H.adminTab(L.page, 'exams');
  56  |   for (const [k, t] of TITLES.entries()) {
  57  |     await expect(rows('#e-table')).toHaveCount(k);
  58  |     await L.page.fill('#e-title', t); await L.page.fill('#e-dur', '20'); await L.page.fill('#e-marks', '1');
  59  |     await L.page.click('#e-save');
  60  |     await expect(rows('#e-table')).toHaveCount(k + 1);
  61  |     await expect(L.page.locator('#e-msg')).toHaveText('Exam created');
  62  |   }
  63  |   await expect(rows('#e-table')).toHaveCount(4);
  64  |   await expect(rows('#e-table').first()).toContainText('20 min');
  65  |   await H.demoFail(ti, 'Number of exams in table', await rows('#e-table').count(), 3);
  66  | });
  67  | test('[A07] Admin edits an examination (duration)', async ({}, ti) => {
  68  |   await H.adminTab(L.page, 'exams');
  69  |   await L.page.locator('.e-edit').nth(3).click();
  70  |   await expect(L.page.locator('#e-save')).toHaveText('Save Exam');
  71  |   await L.page.fill('#e-dur', '25'); await L.page.click('#e-save');
  72  |   await expect(rows('#e-table').nth(3)).toContainText('25 min');
  73  |   await L.page.locator('.e-edit').nth(3).click();
  74  |   await expect(L.page.locator('#e-save')).toHaveText('Save Exam');
  75  |   await L.page.fill('#e-dur', '20'); await L.page.click('#e-save');
  76  |   await expect(rows('#e-table').nth(3)).toContainText('20 min');
  77  |   await H.demoFail(ti, 'Duration of Software Testing', await rows('#e-table').nth(3).locator('td').nth(1).textContent(), '25 min');
  78  | });
  79  | test('[A08] Admin adds an MCQ question through the form', async ({}, ti) => {
  80  |   await H.adminTab(L.page, 'questions');
  81  |   await L.page.fill('#q-text', 'Extra UI question: which is a testing tool?');
  82  |   for (const [i, o] of ['Playwright', 'Word', 'Paint', 'Calculator'].entries()) await L.page.fill('#q-o' + i, o);
  83  |   await L.page.selectOption('#q-correct', '0');
  84  |   await L.page.click('#q-save');
  85  |   await expect(L.page.locator('#q-msg')).toHaveText('Question added');
  86  |   await expect(L.page.locator('#q-count')).toHaveText('1');
  87  |   await H.demoFail(ti, 'Question count', await L.page.locator('#q-count').textContent(), '2');
  88  | });
  89  | test('[A09] Admin loads 10 questions into each examination', async ({}, ti) => {
  90  |   await H.adminTab(L.page, 'questions');
  91  |   const api = L.page.request;
  92  |   const exams = await (await api.get('/api/admin/exams')).json();
  93  |   for (const t of TITLES) {
  94  |     const e = exams.find(x => x.title === t);
  95  |     const r = await api.post(`/api/admin/exams/${e.id}/questions/bulk`, { data: { questions: bank[t].map(q => ({ text: q.q, options: q.o, correct: q.c })) } });
  96  |     expect(r.status()).toBe(201);
  97  |   }
  98  |   const after = (await (await api.get('/api/admin/exams')).json()).filter(e => !e.title.startsWith('TMP '));
  99  |   expect(after.map(e => e.question_count)).toEqual([11, 10, 10, 10]); // 10 + the 1 question added through the form
  100 |   await H.demoFail(ti, 'Question counts per exam', after.map(e => e.question_count).join(','), '10,10,10,10');
  101 | });
  102 | test('[A10] Admin edits a question', async ({}, ti) => {
  103 |   await H.adminTab(L.page, 'questions');
  104 |   await L.page.locator('.q-edit').first().click();
  105 |   await expect(L.page.locator('#q-save')).toHaveText('Save Question');
  106 |   await L.page.fill('#q-text', 'Extra UI question (edited): which is a testing tool?');
  107 |   await L.page.click('#q-save');
  108 |   await expect(L.page.locator('#q-msg')).toHaveText('Question updated');
  109 |   await expect(L.page.locator('#q-table tbody tr').first()).toContainText('(edited)');
  110 |   await H.demoFail(ti, 'Edited question text visible', String(await L.page.locator('#q-table').textContent()).includes('(edited)'), false);
  111 | });
  112 | test('[A11] Admin deletes a question', async ({}, ti) => {
  113 |   await H.adminTab(L.page, 'questions');
  114 |   await expect(L.page.locator('#q-count')).toHaveText('11');
  115 |   await L.page.locator('.q-del').first().click(); await L.page.click('#confirm-yes');
  116 |   await expect(L.page.locator('#q-count')).toHaveText('10');
  117 |   await H.demoFail(ti, 'Question count after delete', await L.page.locator('#q-count').textContent(), '11');
  118 | });
  119 | test('[A12] Admin assigns each examination to its student', async ({}, ti) => {
  120 |   await H.adminTab(L.page, 'assign');
  121 |   const exams = await (await L.page.request.get('/api/admin/exams')).json();
  122 |   const studs = await (await L.page.request.get('/api/admin/students')).json();
  123 |   for (const s of STUDENTS) {
  124 |     const e = exams.find(x => x.title === s.exam), u = studs.find(x => x.email === s.email);
  125 |     await L.page.check(`#as-${e.id}-${u.id}`);
> 126 |     await L.page.click(`#a-save-${e.id}`);
      |                  ^ Error: page.click: Target page, context or browser has been closed
  127 |     await expect(L.page.locator('#a-msg')).toContainText(`${s.exam} assigned to 1 student`);
  128 |   }
  129 |   await H.demoFail(ti, 'Last assignment message', await L.page.locator('#a-msg').textContent(), 'Saved: Software Testing assigned to 4 student(s)');
  130 | });
  131 | test('[A13] Admin verifies students, exams, questions and assignments', async ({}, ti) => {
  132 |   const s = await H.state();
  133 |   expect(H.fixturesReady(s)).toBe(true);
  134 |   expect(s.exams.every(e => e.duration_sec === 1200 && e.assigned_count === 1 && e.marks_per_q === 1)).toBe(true);
  135 |   await H.demoFail(ti, 'Fixtures ready (4 students, 4 exams x 10 questions, assigned)', H.fixturesReady(s), false);
  136 | });
  137 | test('[A14] Admin logs out and returns to the login page', async ({}, ti) => {
  138 |   await H.adminTab(L.page, 'results');
  139 |   await L.page.click('#logout');
  140 |   await expect(L.page.locator('#login-form')).toBeVisible();
  141 |   await H.demoFail(ti, 'Login form visible after logout', await L.page.locator('#login-form').isVisible(), false);
  142 | });
  143 | 
```