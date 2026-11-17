# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: s1-student.spec.js >> [S1-1] Student 1 logs in and sees only the assigned exam (Software Engineering)
- Location: tests/flow.js:10:3

# Error details

```
AggregateError: apiRequestContext.get: connect ECONNREFUSED ::1:9000
connect ECONNREFUSED 127.0.0.1:9000
Call log:
  - → GET http://localhost:9000/api/test/state
    - user-agent: Playwright/1.65.1 (arm64; macOS 27.2) node/26.8
    - accept: */*
    - accept-encoding: gzip,deflate,br

```