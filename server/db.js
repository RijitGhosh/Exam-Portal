const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const bank = require('./questionBank');

const db = new Database(process.env.DB_FILE || path.join(__dirname, '..', 'data.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN('admin','student')), pw TEXT NOT NULL, roll TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS exams(id INTEGER PRIMARY KEY, title TEXT NOT NULL, duration_sec INTEGER NOT NULL, marks_per_q INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE, text TEXT NOT NULL, options TEXT NOT NULL, correct INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS assignments(exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(exam_id,user_id));
CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, started_at INTEGER NOT NULL, deadline INTEGER NOT NULL, submitted_at INTEGER, auto INTEGER DEFAULT 0, score INTEGER, total INTEGER, UNIQUE(exam_id,user_id));
CREATE TABLE IF NOT EXISTS answers(attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE, question_id INTEGER NOT NULL, choice INTEGER NOT NULL, PRIMARY KEY(attempt_id,question_id));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
`);

function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
function checkPw(pw, stored) {
  const [, salt, hash] = stored.split('$');
  const h = crypto.scryptSync(pw, salt, 32);
  const s = Buffer.from(hash, 'hex');
  return s.length === h.length && crypto.timingSafeEqual(h, s);
}

const ADMIN = { name: 'Administrator', email: 'admin@college.edu', password: 'Admin@123' };
const STUDENT_PW = 'Student@123';
const EXAMS = Object.keys(bank); // order = student 1..4

function ensureAdmin() {
  if (!db.prepare('SELECT 1 FROM users WHERE role=?').get('admin'))
    db.prepare('INSERT INTO users(name,email,role,pw) VALUES(?,?,?,?)').run(ADMIN.name, ADMIN.email, 'admin', hashPw(ADMIN.password));
}

// Idempotent: creates the 4 students, 4 exams (10 Qs each) and assignments if missing.
function seedFixtures() {
  ensureAdmin();
  const tx = db.transaction(() => {
    EXAMS.forEach((title, i) => {
      const email = `student${i + 1}@college.edu`;
      let u = db.prepare('SELECT id FROM users WHERE email=?').get(email);
      if (!u) u = { id: db.prepare('INSERT INTO users(name,email,role,pw,roll) VALUES(?,?,?,?,?)').run(`Student ${i + 1}`, email, 'student', hashPw(STUDENT_PW), `CS2026${String(i + 1).padStart(3, '0')}`).lastInsertRowid };
      let e = db.prepare('SELECT id FROM exams WHERE title=?').get(title);
      if (!e) {
        e = { id: db.prepare('INSERT INTO exams(title,duration_sec,marks_per_q) VALUES(?,?,1)').run(title, 1200).lastInsertRowid };
        const ins = db.prepare('INSERT INTO questions(exam_id,text,options,correct) VALUES(?,?,?,?)');
        bank[title].forEach(q => ins.run(e.id, q.q, JSON.stringify(q.o), q.c));
      }
      db.prepare('INSERT OR IGNORE INTO assignments(exam_id,user_id) VALUES(?,?)').run(e.id, u.id);
    });
  });
  tx();
}

function wipeAll() {
  db.exec("DELETE FROM attempts; DELETE FROM assignments; DELETE FROM questions; DELETE FROM exams; DELETE FROM users WHERE role='student'; DELETE FROM sessions;");
}

module.exports = { db, hashPw, checkPw, seedFixtures, wipeAll, ensureAdmin, ADMIN, STUDENT_PW, EXAMS };
