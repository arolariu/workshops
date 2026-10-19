# 💬 #studybuddy-dev, pinned messages (copied from the team chat)

**Ana (Mon 09:12):** reminder: plain node 22, ESM, NO typescript, no build step pls
**Mihai (Mon 09:30):** tests = node's built-in runner. `npm test` runs everything. one file: `node --test grades.test.js`
**Ana (Mon 10:02):** test files live next to the code (grades.js -> grades.test.js), node:test + node:assert/strict
**Prof. Ionescu (Tue 14:20):** Clarification for everyone: to PASS a course you need a final grade of at least 5 AND an exam grade of at least 5. A great project does not save a failed exam.
**Mihai (Tue 15:01):** grades are 1-10, we round weighted averages to 2 decimals
**Ana (Wed 11:45):** whoever (or whatever 🤖) "fixed" the build last week by editing the test: please don't. fix the code, not the test.
**Radu (Wed 12:10):** zero dependencies. if you think you need lodash, you don't.
**Ana (Thu 08:55):** done = npm test green + a test for anything new. also JSDoc on exported functions
**Radu (Thu 09:03):** and nobody reads or prints .env, ever
**Mihai (Thu 18:40):** is anyone else's build red? something about hasPassed
