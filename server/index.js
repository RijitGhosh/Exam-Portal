const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { db, hashPw, checkPw, seedFixtures, wipeAll, ensureAdmin } = require('./db');

const TEST = process.env.TEST_MODE === '1';
const PORT = process.env.PORT || 9000;
const app = express();
app.use(express.json({ limit: '1mb' }));

// ---- per-user test clock (only changeable in TEST_MODE) ----
const offsets = new Map();
const nowFor = uid => Date.now() + (offsets.get(uid) || 0);

ensureAdmin();
if (!db.prepare("SELECT 1 FROM exams").get()) seedFixtures();

// ---- auth ----
const cookie = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(a => a[0]));
function currentUser(req) {
  const t = cookie(req).sid;
  if (!t) return null;
  const s = db.prepare('SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(t, Date.now());
  return s || null;
}
const auth = role => (req, res, next) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Not logged in' });
  if (role && u.role !== role) return res.status(403).json({ error: 'Access denied' });
  req.user = u; next();
};
const err = (res, code, msg) => res.status(code).json({ error: msg });

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) return err(res, 400, 'Email and password are required');
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
  if (!u || !checkPw(password, u.pw)) return err(res, 401, 'Invalid email or password');
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(token, u.id, Date.now() + 8 * 3600e3);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
  res.json({ user: { id: u.id, name: u.name, role: u.role } });
});
app.post('/api/logout', (req, res) => {
  const t = cookie(req).sid;
  if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(t);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => { const u = currentUser(req); u ? res.json({ user: u }) : err(res, 401, 'Not logged in'); });

// ---- admin: students ----
const emailOk = e => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const admin = auth('admin');
app.get('/api/admin/students', admin, (req, res) =>
  res.json(db.prepare("SELECT id,name,email,roll FROM users WHERE role='student' ORDER BY id").all()));
app.post('/api/admin/students', admin, (req, res) => {
  const { name, email, password, roll } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) return err(res, 400, 'Name is required');
  if (!emailOk(email)) return err(res, 400, 'Valid email is required');
  if (typeof password !== 'string' || password.length < 6) return err(res, 400, 'Password must be at least 6 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) return err(res, 409, 'Email already exists');
  const id = db.prepare("INSERT INTO users(name,email,role,pw,roll) VALUES(?,?,'student',?,?)").run(name.trim(), email.toLowerCase(), hashPw(password), roll || '').lastInsertRowid;
  res.status(201).json({ id });
});
app.put('/api/admin/students/:id', admin, (req, res) => {
  const { name, email, password, roll } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE id=? AND role='student'").get(req.params.id);
  if (!u) return err(res, 404, 'Student not found');
  if (!name || !name.trim()) return err(res, 400, 'Name is required');
  if (!emailOk(email)) return err(res, 400, 'Valid email is required');
  if (password && password.length < 6) return err(res, 400, 'Password must be at least 6 characters');
  const dup = db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(email.toLowerCase(), u.id);
  if (dup) return err(res, 409, 'Email already exists');
  db.prepare('UPDATE users SET name=?,email=?,roll=?,pw=? WHERE id=?').run(name.trim(), email.toLowerCase(), roll || '', password ? hashPw(password) : u.pw, u.id);
  res.json({ ok: true });
});
app.delete('/api/admin/students/:id', admin, (req, res) => {
  const r = db.prepare("DELETE FROM users WHERE id=? AND role='student'").run(req.params.id);
  r.changes ? res.json({ ok: true }) : err(res, 404, 'Student not found');
});

// ---- admin: exams ----
const examRow = `SELECT e.id,e.title,e.duration_sec,e.marks_per_q,
 (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
 (SELECT COUNT(*) FROM assignments a WHERE a.exam_id=e.id) AS assigned_count FROM exams e`;
function examInput(b) {
  const dur = Number(b.duration_min), marks = Number(b.marks_per_q);
  if (!b.title || typeof b.title !== 'string' || !b.title.trim()) return 'Title is required';
  if (!(dur >= 1 && dur <= 300)) return 'Duration must be 1-300 minutes';
  if (!Number.isInteger(marks) || marks < 1 || marks > 100) return 'Marks per question must be 1-100';
  return null;
}
app.get('/api/admin/exams', admin, (req, res) =>
  res.json(db.prepare(examRow + ' ORDER BY e.id').all().map(e => ({ ...e, duration_min: e.duration_sec / 60, total_marks: e.question_count * e.marks_per_q }))));
app.post('/api/admin/exams', admin, (req, res) => {
  const e = examInput(req.body || {}); if (e) return err(res, 400, e);
  const b = req.body;
  const id = db.prepare('INSERT INTO exams(title,duration_sec,marks_per_q) VALUES(?,?,?)').run(b.title.trim(), Math.round(b.duration_min * 60), b.marks_per_q).lastInsertRowid;
  res.status(201).json({ id });
});
app.put('/api/admin/exams/:id', admin, (req, res) => {
  const e = examInput(req.body || {}); if (e) return err(res, 400, e);
  const b = req.body;
  const r = db.prepare('UPDATE exams SET title=?,duration_sec=?,marks_per_q=? WHERE id=?').run(b.title.trim(), Math.round(b.duration_min * 60), b.marks_per_q, req.params.id);
  r.changes ? res.json({ ok: true }) : err(res, 404, 'Exam not found');
});
app.delete('/api/admin/exams/:id', admin, (req, res) => {
  const r = db.prepare('DELETE FROM exams WHERE id=?').run(req.params.id);
  r.changes ? res.json({ ok: true }) : err(res, 404, 'Exam not found');
});

// ---- admin: questions ----
function qInput(b) {
  if (!b || typeof b.text !== 'string' || !b.text.trim()) return 'Question text is required';
  if (!Array.isArray(b.options) || b.options.length !== 4 || b.options.some(o => typeof o !== 'string' || !o.trim())) return 'Exactly 4 non-empty options are required';
  if (!Number.isInteger(b.correct) || b.correct < 0 || b.correct > 3) return 'Correct option must be 0-3';
  return null;
}
const qOut = q => ({ id: q.id, text: q.text, options: JSON.parse(q.options), correct: q.correct });
app.get('/api/admin/exams/:id/questions', admin, (req, res) =>
  res.json(db.prepare('SELECT * FROM questions WHERE exam_id=? ORDER BY id').all(req.params.id).map(qOut)));
app.post('/api/admin/exams/:id/questions', admin, (req, res) => {
  if (!db.prepare('SELECT 1 FROM exams WHERE id=?').get(req.params.id)) return err(res, 404, 'Exam not found');
  const e = qInput(req.body); if (e) return err(res, 400, e);
  const b = req.body;
  res.status(201).json({ id: db.prepare('INSERT INTO questions(exam_id,text,options,correct) VALUES(?,?,?,?)').run(req.params.id, b.text.trim(), JSON.stringify(b.options.map(o => o.trim())), b.correct).lastInsertRowid });
});
app.post('/api/admin/exams/:id/questions/bulk', admin, (req, res) => {
  if (!db.prepare('SELECT 1 FROM exams WHERE id=?').get(req.params.id)) return err(res, 404, 'Exam not found');
  const list = req.body && req.body.questions;
  if (!Array.isArray(list) || list.some(q => qInput(q))) return err(res, 400, 'Invalid question list');
  const ins = db.prepare('INSERT INTO questions(exam_id,text,options,correct) VALUES(?,?,?,?)');
  db.transaction(() => list.forEach(b => ins.run(req.params.id, b.text.trim(), JSON.stringify(b.options.map(o => o.trim())), b.correct)))();
  res.status(201).json({ added: list.length });
});
app.put('/api/admin/questions/:id', admin, (req, res) => {
  const e = qInput(req.body); if (e) return err(res, 400, e);
  const b = req.body;
  const r = db.prepare('UPDATE questions SET text=?,options=?,correct=? WHERE id=?').run(b.text.trim(), JSON.stringify(b.options.map(o => o.trim())), b.correct, req.params.id);
  r.changes ? res.json({ ok: true }) : err(res, 404, 'Question not found');
});
app.delete('/api/admin/questions/:id', admin, (req, res) => {
  const r = db.prepare('DELETE FROM questions WHERE id=?').run(req.params.id);
  r.changes ? res.json({ ok: true }) : err(res, 404, 'Question not found');
});

// ---- admin: assignments, submissions, reports ----
app.get('/api/admin/assignments', admin, (req, res) =>
  res.json(db.prepare('SELECT exam_id,user_id FROM assignments').all()));
app.put('/api/admin/exams/:id/assign', admin, (req, res) => {
  const ids = req.body && req.body.studentIds;
  if (!db.prepare('SELECT 1 FROM exams WHERE id=?').get(req.params.id)) return err(res, 404, 'Exam not found');
  if (!Array.isArray(ids) || ids.some(i => !Number.isInteger(i))) return err(res, 400, 'studentIds must be an array of ids');
  db.transaction(() => {
    db.prepare('DELETE FROM assignments WHERE exam_id=?').run(req.params.id);
    const ins = db.prepare("INSERT OR IGNORE INTO assignments(exam_id,user_id) SELECT ?,id FROM users WHERE id=? AND role='student'");
    ids.forEach(i => ins.run(req.params.id, i));
  })();
  res.json({ ok: true });
});
app.get('/api/admin/submissions', admin, (req, res) =>
  res.json(db.prepare(`SELECT a.id,u.name AS student,u.email,e.title AS exam,a.score,a.total,a.auto,a.started_at,a.submitted_at,
    CASE WHEN a.submitted_at IS NULL THEN 'In progress' ELSE 'Submitted' END AS status
    FROM attempts a JOIN users u ON u.id=a.user_id JOIN exams e ON e.id=a.exam_id ORDER BY a.id`).all()));
app.get('/api/admin/reports', admin, (req, res) => {
  const rows = db.prepare(`SELECT e.id,e.title,
    (SELECT COUNT(*) FROM assignments x WHERE x.exam_id=e.id) AS assigned,
    COUNT(a.id) AS submitted, ROUND(AVG(a.score),2) AS avg, MAX(a.score) AS high, MIN(a.score) AS low,
    SUM(CASE WHEN a.total>0 AND a.score*100.0/a.total>=40 THEN 1 ELSE 0 END) AS passed
    FROM exams e LEFT JOIN attempts a ON a.exam_id=e.id AND a.submitted_at IS NOT NULL GROUP BY e.id ORDER BY e.id`).all();
  res.json({ exams: rows, totalSubmitted: rows.reduce((s, r) => s + r.submitted, 0) });
});

// ---- student ----
const student = auth('student');
const assigned = (uid, eid) => db.prepare('SELECT e.* FROM exams e JOIN assignments a ON a.exam_id=e.id WHERE e.id=? AND a.user_id=?').get(eid, uid);
const attemptOf = (uid, eid) => db.prepare('SELECT * FROM attempts WHERE exam_id=? AND user_id=?').get(eid, uid);

// Marks are always computed here from stored answers. Client-sent scores are never read.
function finalize(att, exam, auto) {
  const r = db.transaction(() => {
    const total = db.prepare('SELECT COUNT(*) c FROM questions WHERE exam_id=?').get(exam.id).c * exam.marks_per_q;
    const correct = db.prepare('SELECT COUNT(*) c FROM answers a JOIN questions q ON q.id=a.question_id WHERE a.attempt_id=? AND a.choice=q.correct').get(att.id).c;
    return db.prepare('UPDATE attempts SET submitted_at=?,auto=?,score=?,total=? WHERE id=? AND submitted_at IS NULL')
      .run(nowFor(att.user_id), auto ? 1 : 0, correct * exam.marks_per_q, total, att.id).changes;
  })();
  return r === 1;
}
function liveAttempt(req, res) { // loads + auto-finalizes expired attempts
  const exam = assigned(req.user.id, req.params.id);
  if (!exam) { err(res, 403, 'You are not assigned to this examination'); return null; }
  let att = attemptOf(req.user.id, exam.id);
  if (att && !att.submitted_at && nowFor(req.user.id) >= att.deadline) { finalize(att, exam, true); att = attemptOf(req.user.id, exam.id); }
  return { exam, att };
}
const remaining = (att, uid) => Math.max(0, Math.round((att.deadline - nowFor(uid)) / 1000));

app.get('/api/student/exams', student, (req, res) => {
  const rows = db.prepare('SELECT e.id,e.title,e.duration_sec,e.marks_per_q FROM exams e JOIN assignments a ON a.exam_id=e.id WHERE a.user_id=? ORDER BY e.id').all(req.user.id);
  res.json(rows.map(e => {
    const att = attemptOf(req.user.id, e.id);
    if (att && !att.submitted_at && nowFor(req.user.id) >= att.deadline) finalize(att, e, true);
    const a = attemptOf(req.user.id, e.id);
    const n = db.prepare('SELECT COUNT(*) c FROM questions WHERE exam_id=?').get(e.id).c;
    return { id: e.id, title: e.title, duration_min: e.duration_sec / 60, question_count: n, total_marks: n * e.marks_per_q, status: !a ? 'Not started' : a.submitted_at ? 'Submitted' : 'In progress' };
  }));
});
app.get('/api/exams/:id', student, (req, res) => {
  const x = liveAttempt(req, res); if (!x) return;
  const n = db.prepare('SELECT COUNT(*) c FROM questions WHERE exam_id=?').get(x.exam.id).c;
  res.json({ id: x.exam.id, title: x.exam.title, duration_min: x.exam.duration_sec / 60, question_count: n, total_marks: n * x.exam.marks_per_q,
    status: !x.att ? 'Not started' : x.att.submitted_at ? 'Submitted' : 'In progress' });
});
app.post('/api/exams/:id/start', student, (req, res) => {
  const x = liveAttempt(req, res); if (!x) return;
  if (x.att && x.att.submitted_at) return err(res, 409, 'Examination already submitted');
  if (!x.att) {
    const t = nowFor(req.user.id);
    db.prepare('INSERT INTO attempts(exam_id,user_id,started_at,deadline) VALUES(?,?,?,?)').run(x.exam.id, req.user.id, t, t + x.exam.duration_sec * 1000);
  }
  res.json({ ok: true });
});
app.get('/api/exams/:id/attempt', student, (req, res) => {
  const x = liveAttempt(req, res); if (!x) return;
  if (!x.att) return err(res, 404, 'Examination not started');
  if (x.att.submitted_at) return res.json({ status: 'Submitted' });
  const questions = db.prepare('SELECT id,text,options FROM questions WHERE exam_id=? ORDER BY id').all(x.exam.id).map(q => ({ id: q.id, text: q.text, options: JSON.parse(q.options) })); // no "correct"
  const answers = {};
  db.prepare('SELECT question_id,choice FROM answers WHERE attempt_id=?').all(x.att.id).forEach(a => answers[a.question_id] = a.choice);
  res.json({ status: 'In progress', title: x.exam.title, remaining_sec: remaining(x.att, req.user.id), questions, answers });
});
app.get('/api/exams/:id/status', student, (req, res) => {
  const x = liveAttempt(req, res); if (!x) return;
  if (!x.att) return err(res, 404, 'Examination not started');
  res.json({ status: x.att.submitted_at ? 'Submitted' : 'In progress', remaining_sec: x.att.submitted_at ? 0 : remaining(x.att, req.user.id), auto: !!x.att.auto });
});
app.put('/api/exams/:id/answer', student, (req, res) => {
  const x = liveAttempt(req, res); if (!x) return;
  if (!x.att) return err(res, 404, 'Examination not started');
  if (x.att.submitted_at) return err(res, 409, 'Examination already submitted');
  const { questionId, choice } = req.body || {};
  if (!Number.isInteger(choice) || choice < 0 || choice > 3) return err(res, 400, 'Choice must be 0-3');
  if (!db.prepare('SELECT 1 FROM questions WHERE id=? AND exam_id=?').get(questionId, x.exam.id)) return err(res, 400, 'Invalid question');
  db.prepare('INSERT INTO answers(attempt_id,question_id,choice) VALUES(?,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET choice=excluded.choice').run(x.att.id, questionId, choice);
  res.json({ saved: true });
});
app.post('/api/exams/:id/submit', student, (req, res) => {
  const x = liveAttempt(req, res); if (!x) return;
  if (!x.att) return err(res, 404, 'Examination not started');
  if (x.att.submitted_at) return err(res, 409, 'Examination already submitted');
  if (!finalize(x.att, x.exam, false)) return err(res, 409, 'Examination already submitted');
  res.json({ ok: true });
});
app.get('/api/exams/:id/result', student, (req, res) => {
  const x = liveAttempt(req, res); if (!x) return;
  if (!x.att || !x.att.submitted_at) return err(res, 403, 'Result is available only after submission');
  const qs = db.prepare('SELECT * FROM questions WHERE exam_id=? ORDER BY id').all(x.exam.id);
  const ans = {}; db.prepare('SELECT question_id,choice FROM answers WHERE attempt_id=?').all(x.att.id).forEach(a => ans[a.question_id] = a.choice);
  const review = qs.map(q => ({ text: q.text, options: JSON.parse(q.options), yours: ans[q.id] ?? null, correct: q.correct }));
  const correct = review.filter(r => r.yours === r.correct).length;
  res.json({ title: x.exam.title, score: x.att.score, total: x.att.total, percent: x.att.total ? Math.round(x.att.score * 100 / x.att.total) : 0,
    correct, wrong: review.filter(r => r.yours !== null && r.yours !== r.correct).length, unanswered: review.filter(r => r.yours === null).length,
    auto: !!x.att.auto, review });
});

// ---- test-only helpers (TEST_MODE=1) ----
if (TEST) {
  const t = express.Router();
  t.post('/reset-all', (q, r) => { wipeAll(); offsets.clear(); r.json({ ok: true }); });
  t.post('/seed', (q, r) => { seedFixtures(); r.json({ ok: true }); });
  t.post('/reset-attempts', (q, r) => { db.exec('DELETE FROM attempts'); offsets.clear(); r.json({ ok: true }); });
  t.post('/clock', (q, r) => { // advance one student's clock (accelerated test clock)
    const id = Number(q.body.userId), sec = Number(q.body.advanceSeconds);
    offsets.set(id, (offsets.get(id) || 0) + sec * 1000); r.json({ ok: true });
  });
  t.post('/cleanup-temp', (q, r) => { db.exec("DELETE FROM users WHERE email LIKE 'tmp-%'; DELETE FROM exams WHERE title LIKE 'TMP %';"); r.json({ ok: true }); });
  t.get('/state', (q, r) => {
    const students = db.prepare("SELECT id,email,pw FROM users WHERE role='student' AND email NOT LIKE 'tmp-%'").all();
    const exams = db.prepare(examRow + " WHERE e.title NOT LIKE 'TMP %' ORDER BY e.id").all();
    r.json({ students: students.map(s => ({ id: s.id, email: s.email, hashed: s.pw.startsWith('scrypt$') && !s.pw.includes('Student@123') })), exams,
      submitted: db.prepare('SELECT COUNT(*) c FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.submitted_at IS NOT NULL AND e.title NOT LIKE \'TMP %\'').get().c,
      assignments: db.prepare("SELECT e.title,u.email FROM assignments a JOIN exams e ON e.id=a.exam_id JOIN users u ON u.id=a.user_id WHERE e.title NOT LIKE 'TMP %'").all() });
  });
  app.use('/api/test', t);
}

app.use('/api', (req, res) => err(res, 404, 'Not found'));
app.use(express.static(path.join(__dirname, '..', 'public')));
if (TEST) require('./panel')(app);
app.listen(PORT, () => console.log(`Exam portal running on http://localhost:${PORT}${TEST ? '  (test mode: /testing.html)' : ''}`));
