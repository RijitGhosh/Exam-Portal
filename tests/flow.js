// Student exam flow shared by s1..s4 spec files
const H = require('./helpers');
const { expect, bank } = H;
module.exports = (test, n, extras) => {
  const S = H.STUDENTS[n - 1];
  const L = H.lane(test, 'S' + n);
  const p = () => L.page;
  const tag = i => `[S${n}-${i}]`;

  test(`${tag(1)} Student ${n} logs in and sees only the assigned exam (${S.exam})`, async ({}, ti) => {
    await H.uiLogin(p(), S, '#exam-list');
    await expect(p().locator('.exam-card')).toHaveCount(1);
    await expect(p().locator('.exam-card h3')).toHaveText(S.exam);
    await H.demoFail(ti, 'Exams visible on dashboard', await p().locator('.exam-card').count(), 4);
  });
  test(`${tag(2)} Student ${n} reads instructions and starts the exam`, async ({}, ti) => {
    await H.openExam(p(), S);
    if (await p().locator('#start').count()) {
      await expect(p().locator('#instructions')).toBeVisible();
      await p().click('#start');
    }
    await expect(p().locator('#timer')).toBeVisible();
    await expect(p().locator('#qnum')).toHaveText('Question 1 of 10');
    await expect(p().locator('#timer')).toHaveText(/^(19|20):\d\d$/);
    await H.demoFail(ti, 'Question counter', await p().locator('#qnum').textContent(), 'Question 1 of 20');
  });
  if (extras) test(`${tag(3)} Student ${n} navigates with Previous, Next and the question palette`, async ({}, ti) => {
    await H.startExam(p(), S);
    await p().click('#pal-1');
    await p().click('#next'); await p().click('#next');
    await expect(p().locator('#qnum')).toHaveText('Question 3 of 10');
    await p().click('#prev');
    await expect(p().locator('#qnum')).toHaveText('Question 2 of 10');
    await p().click('#pal-10');
    await expect(p().locator('#qnum')).toHaveText('Question 10 of 10');
    await expect(p().locator('#next')).toBeDisabled();
    await H.demoFail(ti, 'Question shown after clicking palette 10', await p().locator('#qnum').textContent(), 'Question 1 of 10');
  });
  test(`${tag(4)} Student ${n} answers all 10 questions and answers are saved`, async ({}, ti) => {
    await H.answerAll(p(), S);
    await expect(p().locator("#palette .done, #palette .cur")).toHaveCount(10);
    await H.demoFail(ti, 'Questions marked answered in palette', await p().locator('#palette .done, #palette .cur').count(), 8);
  });
  if (extras) test(`${tag(5)} Student ${n} answers are still selected after reloading the page`, async ({}, ti) => {
    await p().reload();
    await p().locator('#qtext').waitFor();
    await p().click('#pal-1');
    const j = H.choiceFor(S, 0);
    await expect(p().locator(`#opt-${j} input`)).toBeChecked();
    await H.demoFail(ti, 'Option 1 still selected after reload', await p().locator(`#opt-${j} input`).isChecked(), false);
  });
  test(`${tag(6)} Student ${n} submits with confirmation and sees the correct result`, async ({}, ti) => {
    await H.answerAll(p(), S);
    const expected = H.TARGET[n - 1];
    if (await p().locator('#result').count() === 0) {
      await p().click('#submit-btn');
      await expect(p().locator('#confirm-text')).toContainText('answered 10 of 10');
      await p().click('#confirm-yes');
    }
    await expect(p().locator('#submitted-msg, #score').first()).toBeVisible();
    await expect(p().locator('#score')).toHaveText(`${expected} / 10`);
    await expect(p().locator('#percent')).toContainText(`${expected * 10}%`);
    await H.demoFail(ti, 'Score shown on result page', await p().locator('#score').textContent(), `${expected - 1} / 10`);
  });
};
