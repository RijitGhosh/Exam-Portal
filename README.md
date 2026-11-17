# College Exam Portal + Automated Testing Dashboard

Node.js + Express + SQLite backend, plain HTML/JS frontend (light/dark mode), Playwright tests.

## Setup (once)
1. Install Node.js 18+ and Google Chrome.
2. `cd exam-portal`
3. `npm install`
4. `npx playwright install chromium`   (if you do not have Chrome: skip it and set `PW_CHANNEL=chrome` only when Chrome is installed)

## Run everything
    npm run demo
Opens http://localhost:9000/testing.html. Application is at http://localhost:9000.

## Run the automated tests
1. In the dashboard tick "Fail on purpose" for the tests you want to fail (default: A04 and S1-6).
2. Pick a speed: Presentation / Normal / Fast Full Test.
3. Click **Run Automated Tests** once. Left = live app browser, right = live test results.
4. Click any FAIL row for expected, actual, explanation and screenshot.
Evidence is saved in `evidence/<run-id>/` (screenshots, videos, HTML report, report.csv, errors.log, results.json).

## Login credentials
| Role | Email | Password |
|---|---|---|
| Admin | admin@college.edu | Admin@123 |
| Student 1 (Software Engineering) | student1@college.edu | Student@123 |
| Student 2 (Database Management Systems) | student2@college.edu | Student@123 |
| Student 3 (Computer Networks) | student3@college.edu | Student@123 |
| Student 4 (Software Testing) | student4@college.edu | Student@123 |

## Notes
- Database file `data.sqlite` is created and seeded automatically on first start.
- Test-only endpoints (`/api/test/*`, accelerated clock) exist only when `TEST_MODE=1` (set by `npm run demo`). `npm start` runs without them.
- Intentional failures come only from deliberately wrong expected values in the test; the app is never altered.
- Measured on this build: 47 tests, ~26 s (Fast), ~52 s (Presentation).
