const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
let me = null;

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  if (!r.ok) { const e = new Error((d && d.error) || r.statusText); e.status = r.status; throw e; }
  return d;
}
const fmtTime = t => t ? new Date(t).toLocaleString() : '-';
const msg = (el, text, cls = 'ok') => { el.className = 'msg ' + cls; el.textContent = text; };

// theme
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.theme = t; } catch {} $('#theme').textContent = t === 'dark' ? 'Light mode' : 'Dark mode'; }
$('#theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
setTheme(document.documentElement.dataset.theme || 'light');
$('#logout').onclick = async () => { await api('POST', '/api/logout'); me = null; clearTimers(); location.hash = ''; boot(); };

let timers = [];
const clearTimers = () => { timers.forEach(clearInterval); timers = []; };

function confirmBox(text, yes = 'Confirm') {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="card" role="dialog"><p id="confirm-text">${esc(text)}</p><div class="row"><button class="btn" id="confirm-yes">${esc(yes)}</button><button class="btn alt" id="confirm-no">Cancel</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('#confirm-yes').onclick = () => { m.remove(); res(true); };
    m.querySelector('#confirm-no').onclick = () => { m.remove(); res(false); };
  });
}

async function boot() {
  clearTimers();
  try { me = (await api('GET', '/api/me')).user; } catch { me = null; }
  $('#who').textContent = me ? `${me.name} (${me.role})` : '';
  $('#logout').hidden = !me;
  if (!me) return loginPage();
  route();
}
window.addEventListener('hashchange', () => me && route());

function loginPage() {
  app.innerHTML = `<form class="card login" id="login-form"><h2>Sign in</h2>
   <div class="row"><label>Email<input id="email" type="email" autocomplete="username" required></label>
   <label>Password<input id="password" type="password" autocomplete="current-password" required></label></div>
   <button class="btn" id="login-btn" type="submit">Login</button><div id="login-msg" role="alert"></div></form>`;
  $('#login-form').onsubmit = async e => {
    e.preventDefault();
    try {
      const d = await api('POST', '/api/login', { email: $('#email').value, password: $('#password').value });
      location.hash = d.user.role === 'admin' ? '#/admin/students' : '#/student';
      boot();
    } catch (er) { const m = $('#login-msg'); msg(m, er.message, 'err'); }
  };
}

function route() {
  clearTimers();
  const h = location.hash.replace(/^#\/?/, '').split('/');
  if (h[0] === 'admin') {
    if (me.role !== 'admin') return app.innerHTML = '<div class="card"><h2>403 - Access denied</h2><p>Students cannot open admin pages.</p><a href="#/student">Back to my exams</a></div>';
    return adminPage(h[1] || 'students');
  }
  if (me.role === 'admin') { location.hash = '#/admin/students'; return; }
  if (h[0] === 'student' && h[1] === 'exam') return examPage(h[2]);
  studentHome();
}

// ---------------- ADMIN ----------------
const TABS = [['students', 'Students'], ['exams', 'Exams'], ['questions', 'Questions'], ['assign', 'Assign'], ['results', 'Results'], ['reports', 'Reports']];
function adminPage(tab) {
  app.innerHTML = `<div class="tabs" id="tabs">${TABS.map(([k, n]) => `<a href="#/admin/${k}" id="tab-${k}" class="${k === tab ? 'on' : ''}">${n}</a>`).join('')}</div><div id="panel"></div>`;
  ({ students: adminStudents, exams: adminExams, questions: adminQuestions, assign: adminAssign, results: adminResults, reports: adminReports }[tab] || adminStudents)($('#panel'));
}

async function adminStudents(p) {
  let editing = null;
  const draw = async () => {
    const list = await api('GET', '/api/admin/students');
    p.innerHTML = `<div class="card"><h2>${editing ? 'Edit student' : 'Add student'}</h2>
     <div class="row"><label>Name<input id="s-name"></label><label>Email<input id="s-email"></label><label>Password${editing ? ' (leave blank to keep)' : ''}<input id="s-pass" type="text"></label><label>Roll no.<input id="s-roll"></label>
     <button class="btn" id="s-save">${editing ? 'Save Student' : 'Add Student'}</button>${editing ? '<button class="btn alt" id="s-cancel">Cancel</button>' : ''}</div><div id="s-msg" role="status"></div></div>
     <div class="card"><h2>Students (${list.length})</h2><table id="s-table"><thead><tr><th>Name</th><th>Email</th><th>Roll no.</th><th></th></tr></thead><tbody>
     ${list.map(s => `<tr data-id="${s.id}"><td>${esc(s.name)}</td><td>${esc(s.email)}</td><td>${esc(s.roll)}</td><td><button class="btn sm alt s-edit" data-id="${s.id}">Edit</button> <button class="btn sm danger s-del" data-id="${s.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;
    if (editing) { $('#s-name').value = editing.name; $('#s-email').value = editing.email; $('#s-roll').value = editing.roll; }
    const m = $('#s-msg');
    $('#s-save').onclick = async () => {
      const b = { name: $('#s-name').value, email: $('#s-email').value, password: $('#s-pass').value, roll: $('#s-roll').value };
      try {
        editing ? await api('PUT', '/api/admin/students/' + editing.id, b) : await api('POST', '/api/admin/students', b);
        const was = editing; editing = null; await draw(); msg($('#s-msg'), was ? 'Student updated' : 'Student added');
      } catch (e) { msg(m, e.message, 'err'); }
    };
    if (editing) $('#s-cancel').onclick = () => { editing = null; draw(); };
    p.querySelectorAll('.s-edit').forEach(b => b.onclick = () => { editing = list.find(s => s.id == b.dataset.id); draw(); });
    p.querySelectorAll('.s-del').forEach(b => b.onclick = async () => {
      if (!await confirmBox('Delete this student and their attempts?', 'Delete')) return;
      await api('DELETE', '/api/admin/students/' + b.dataset.id); await draw(); msg($('#s-msg'), 'Student deleted');
    });
  };
  draw();
}

async function adminExams(p) {
  let editing = null;
  const draw = async () => {
    const list = await api('GET', '/api/admin/exams');
    p.innerHTML = `<div class="card"><h2>${editing ? 'Edit examination' : 'Create examination'}</h2>
     <div class="row"><label>Title<input id="e-title"></label><label>Duration (minutes)<input id="e-dur" type="number" min="1" value="20" style="width:110px"></label><label>Marks per question<input id="e-marks" type="number" min="1" value="1" style="width:110px"></label>
     <button class="btn" id="e-save">${editing ? 'Save Exam' : 'Add Exam'}</button>${editing ? '<button class="btn alt" id="e-cancel">Cancel</button>' : ''}</div><div id="e-msg" role="status"></div></div>
     <div class="card"><h2>Examinations</h2><table id="e-table"><thead><tr><th>Title</th><th>Duration</th><th>Questions</th><th>Total marks</th><th>Assigned</th><th></th></tr></thead><tbody>
     ${list.map(e => `<tr data-id="${e.id}"><td>${esc(e.title)}</td><td>${e.duration_min} min</td><td>${e.question_count}</td><td>${e.total_marks}</td><td>${e.assigned_count}</td><td><button class="btn sm alt e-edit" data-id="${e.id}">Edit</button> <button class="btn sm danger e-del" data-id="${e.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;
    if (editing) { $('#e-title').value = editing.title; $('#e-dur').value = editing.duration_min; $('#e-marks').value = editing.marks_per_q; }
    $('#e-save').onclick = async () => {
      const b = { title: $('#e-title').value, duration_min: +$('#e-dur').value, marks_per_q: +$('#e-marks').value };
      try {
        editing ? await api('PUT', '/api/admin/exams/' + editing.id, b) : await api('POST', '/api/admin/exams', b);
        const was = editing; editing = null; await draw(); msg($('#e-msg'), was ? 'Exam updated' : 'Exam created');
      } catch (e) { msg($('#e-msg'), e.message, 'err'); }
    };
    if (editing) $('#e-cancel').onclick = () => { editing = null; draw(); };
    p.querySelectorAll('.e-edit').forEach(b => b.onclick = () => { editing = list.find(e => e.id == b.dataset.id); draw(); });
    p.querySelectorAll('.e-del').forEach(b => b.onclick = async () => {
      if (!await confirmBox('Delete this examination and all its questions?', 'Delete')) return;
      await api('DELETE', '/api/admin/exams/' + b.dataset.id); await draw(); msg($('#e-msg'), 'Exam deleted');
    });
  };
  draw();
}

async function adminQuestions(p) {
  const exams = await api('GET', '/api/admin/exams');
  let cur = exams[0] && exams[0].id, editing = null;
  const draw = async () => {
    const qs = cur ? await api('GET', `/api/admin/exams/${cur}/questions`) : [];
    p.innerHTML = `<div class="card"><div class="row"><label>Examination<select id="q-exam">${exams.map(e => `<option value="${e.id}" ${e.id == cur ? 'selected' : ''}>${esc(e.title)}</option>`).join('')}</select></label></div>
     <h2>${editing ? 'Edit question' : 'Add question'}</h2>
     <div class="row"><label style="flex:1;min-width:260px">Question<input id="q-text"></label></div>
     <div class="row">${[0, 1, 2, 3].map(i => `<label>Option ${i + 1}<input id="q-o${i}"></label>`).join('')}<label>Correct<select id="q-correct">${[1, 2, 3, 4].map(i => `<option value="${i - 1}">Option ${i}</option>`).join('')}</select></label></div>
     <button class="btn" id="q-save">${editing ? 'Save Question' : 'Add Question'}</button>${editing ? ' <button class="btn alt" id="q-cancel">Cancel</button>' : ''}<div id="q-msg" role="status"></div></div>
     <div class="card"><h2>Questions (<span id="q-count">${qs.length}</span>)</h2><table id="q-table"><tbody>${qs.map((q, i) => `<tr data-id="${q.id}"><td>${i + 1}</td><td>${esc(q.text)}<br><span class="muted">${q.options.map((o, j) => (j === q.correct ? '✔ ' : '') + esc(o)).join(' | ')}</span></td><td><button class="btn sm alt q-edit" data-id="${q.id}">Edit</button> <button class="btn sm danger q-del" data-id="${q.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`;
    if (editing) { $('#q-text').value = editing.text; editing.options.forEach((o, i) => $('#q-o' + i).value = o); $('#q-correct').value = editing.correct; }
    $('#q-exam').onchange = e => { cur = +e.target.value; editing = null; draw(); };
    $('#q-save').onclick = async () => {
      const b = { text: $('#q-text').value, options: [0, 1, 2, 3].map(i => $('#q-o' + i).value), correct: +$('#q-correct').value };
      try {
        editing ? await api('PUT', '/api/admin/questions/' + editing.id, b) : await api('POST', `/api/admin/exams/${cur}/questions`, b);
        const was = editing; editing = null; await draw(); msg($('#q-msg'), was ? 'Question updated' : 'Question added');
      } catch (e) { msg($('#q-msg'), e.message, 'err'); }
    };
    if (editing) $('#q-cancel').onclick = () => { editing = null; draw(); };
    p.querySelectorAll('.q-edit').forEach(b => b.onclick = () => { editing = qs.find(q => q.id == b.dataset.id); draw(); });
    p.querySelectorAll('.q-del').forEach(b => b.onclick = async () => {
      if (!await confirmBox('Delete this question?', 'Delete')) return;
      await api('DELETE', '/api/admin/questions/' + b.dataset.id); await draw(); msg($('#q-msg'), 'Question deleted');
    });
  };
  draw();
}

async function adminAssign(p) {
  const [exams, students, asg] = await Promise.all([api('GET', '/api/admin/exams'), api('GET', '/api/admin/students'), api('GET', '/api/admin/assignments')]);
  const has = (e, s) => asg.some(a => a.exam_id === e && a.user_id === s);
  p.innerHTML = `<div class="card"><h2>Assign examinations</h2><div id="a-msg" role="status"></div>${exams.map(e => `<div class="row" data-exam="${e.id}" style="align-items:center;border-bottom:1px solid var(--border);padding:8px 0">
    <strong style="min-width:220px">${esc(e.title)}</strong>${students.map(s => `<label style="flex-direction:row;align-items:center;gap:5px;color:var(--text)"><input type="checkbox" id="as-${e.id}-${s.id}" ${has(e.id, s.id) ? 'checked' : ''}>${esc(s.name)}</label>`).join('')}
    <button class="btn sm a-save" data-exam="${e.id}" id="a-save-${e.id}">Save</button></div>`).join('') || '<p>No exams yet.</p>'}</div>`;
  p.querySelectorAll('.a-save').forEach(b => b.onclick = async () => {
    const eid = +b.dataset.exam;
    const ids = students.filter(s => $(`#as-${eid}-${s.id}`).checked).map(s => s.id);
    await api('PUT', `/api/admin/exams/${eid}/assign`, { studentIds: ids });
    const ex = exams.find(e => e.id === eid); msg($('#a-msg'), `Saved: ${ex.title} assigned to ${ids.length} student(s)`);
  });
}

async function adminResults(p) {
  const rows = await api('GET', '/api/admin/submissions');
  p.innerHTML = `<div class="card"><h2>Submissions &amp; results</h2><table id="r-table"><thead><tr><th>Student</th><th>Exam</th><th>Status</th><th>Marks</th><th>Submitted</th></tr></thead><tbody>
   ${rows.map(r => `<tr><td>${esc(r.student)}</td><td>${esc(r.exam)}</td><td>${r.status}${r.auto ? ' (auto)' : ''}</td><td>${r.status === 'Submitted' ? `${r.score} / ${r.total}` : '-'}</td><td>${fmtTime(r.submitted_at)}</td></tr>`).join('') || '<tr><td colspan="5">No attempts yet</td></tr>'}</tbody></table></div>`;
}

async function adminReports(p) {
  const d = await api('GET', '/api/admin/reports');
  p.innerHTML = `<div class="card"><h2>Reports</h2><p>Total submissions: <strong id="rep-total">${d.totalSubmitted}</strong> <span class="muted">(pass mark = 40%)</span></p>
   <table id="rep-table"><thead><tr><th>Exam</th><th>Assigned</th><th>Submitted</th><th>Average</th><th>Highest</th><th>Lowest</th><th>Passed</th></tr></thead><tbody>
   ${d.exams.map(e => `<tr><td>${esc(e.title)}</td><td>${e.assigned}</td><td>${e.submitted}</td><td>${e.avg ?? '-'}</td><td>${e.high ?? '-'}</td><td>${e.low ?? '-'}</td><td>${e.passed ?? 0}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------------- STUDENT ----------------
async function studentHome() {
  const list = await api('GET', '/api/student/exams');
  app.innerHTML = `<div class="card"><h2>My examinations</h2><div class="grid" id="exam-list">${list.map(e => `<div class="card exam-card" style="margin:0"><h3>${esc(e.title)}</h3>
   <p class="muted">${e.duration_min} min · ${e.question_count} questions · ${e.total_marks} marks</p><span class="badge">${e.status}</span>
   <p><a class="btn open-exam" id="open-${e.id}" href="#/student/exam/${e.id}">${e.status === 'Submitted' ? 'View result' : e.status === 'In progress' ? 'Resume' : 'Open'}</a></p></div>`).join('') || '<p>No examination assigned.</p>'}</div></div>`;
}

async function examPage(id) {
  let info;
  try { info = await api('GET', '/api/exams/' + id); }
  catch (e) { return app.innerHTML = `<div class="card"><h2>${e.status === 403 ? '403 - Access denied' : 'Error'}</h2><p>${esc(e.message)}</p><a href="#/student">Back to my exams</a></div>`; }
  if (info.status === 'Submitted') return resultPage(id);
  if (info.status === 'In progress') return runExam(id);
  app.innerHTML = `<div class="card"><h2 id="exam-title">${esc(info.title)}</h2><p class="muted">${info.duration_min} minutes · ${info.question_count} questions · ${info.total_marks} marks</p>
   <h3>Instructions</h3><ul id="instructions"><li>Each question has four options and one correct answer.</li><li>The countdown starts when you press Start and cannot be paused.</li><li>Answers are saved as soon as you select them.</li><li>The exam is submitted automatically when time runs out.</li><li>You can submit only once.</li></ul>
   <button class="btn" id="start">Start Examination</button><div id="x-msg"></div></div>`;
  $('#start').onclick = async () => {
    try { await api('POST', `/api/exams/${id}/start`); runExam(id); } catch (e) { msg($('#x-msg'), e.message, 'err'); }
  };
}

async function runExam(id) {
  let d;
  try { d = await api('GET', `/api/exams/${id}/attempt`); } catch (e) { return examPage(id); }
  if (d.status === 'Submitted') return resultPage(id);
  const qs = d.questions, ans = d.answers; let i = 0, rem = d.remaining_sec, last = performance.now(), submitting = false;
  const poll = window.__POLL_MS || 1000;
  app.innerHTML = `<div class="card"><div class="bar"><h2 style="margin:0" id="exam-title">${esc(d.title)}</h2><span class="timer" id="timer"></span></div>
   <div class="pal" id="palette"></div><div id="qbox"></div>
   <div class="bar" style="margin-top:14px"><div><button class="btn alt" id="prev">Previous</button> <button class="btn alt" id="next">Next</button></div><span id="saved" class="muted"></span><button class="btn" id="submit-btn">Submit Examination</button></div><div id="x-msg"></div></div>`;
  const show = () => {
    const q = qs[i];
    $('#qbox').innerHTML = `<p class="muted" id="qnum">Question ${i + 1} of ${qs.length}</p><h3 id="qtext">${esc(q.text)}</h3>` +
      q.options.map((o, j) => `<label class="opt ${ans[q.id] === j ? 'sel' : ''}" id="opt-${j}"><input type="radio" name="opt" value="${j}" ${ans[q.id] === j ? 'checked' : ''}> <span>${esc(o)}</span></label>`).join('');
    $('#qbox').querySelectorAll('input').forEach(inp => inp.onchange = async () => {
      const choice = +inp.value; ans[q.id] = choice;
      $('#qbox').querySelectorAll('.opt').forEach((l, k) => l.classList.toggle('sel', k === choice));
      try { await api('PUT', `/api/exams/${id}/answer`, { questionId: q.id, choice }); $('#saved').textContent = 'Saved'; pal(); }
      catch (e) { if (e.status === 409) finish(); else $('#saved').textContent = 'Not saved: ' + e.message; }
    });
    $('#prev').disabled = i === 0; $('#next').disabled = i === qs.length - 1; pal();
  };
  const pal = () => { $('#palette').innerHTML = qs.map((q, k) => `<button id="pal-${k + 1}" class="${k === i ? 'cur' : ans[q.id] !== undefined ? 'done' : ''}">${k + 1}</button>`).join(''); $('#palette').querySelectorAll('button').forEach((b, k) => b.onclick = () => { i = k; show(); }); };
  $('#prev').onclick = () => { if (i > 0) { i--; show(); } };
  $('#next').onclick = () => { if (i < qs.length - 1) { i++; show(); } };
  const tick = () => { const left = Math.max(0, rem - (performance.now() - last) / 1000); const s = Math.ceil(left); $('#timer') && ($('#timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, $('#timer').classList.toggle('low', s <= 60)); return left; };
  const finish = () => { if (submitting) return; submitting = true; clearTimers(); resultPage(id, true); };
  const sync = async () => {
    try {
      const s = await api('GET', `/api/exams/${id}/status`);
      if (s.status === 'Submitted') return finish();
      rem = s.remaining_sec; last = performance.now();
    } catch { /* ignore transient errors */ }
  };
  timers.push(setInterval(() => { if (tick() <= 0) sync(); }, 250), setInterval(sync, poll));
  tick(); show();
  $('#submit-btn').onclick = async () => {
    const answered = Object.keys(ans).length;
    if (!await confirmBox(`Submit now? You answered ${answered} of ${qs.length} questions. You cannot change answers after submitting.`, 'Submit Exam')) return;
    try { await api('POST', `/api/exams/${id}/submit`); finish(); } catch (e) { if (e.status === 409) finish(); else msg($('#x-msg'), e.message, 'err'); }
  };
}

async function resultPage(id, justSubmitted) {
  let r;
  try { r = await api('GET', `/api/exams/${id}/result`); } catch (e) { return app.innerHTML = `<div class="card"><p>${esc(e.message)}</p></div>`; }
  app.innerHTML = `<div class="card" id="result"><h2>${esc(r.title)} - Result</h2>
   ${justSubmitted ? '<div class="msg ok" id="submitted-msg">Examination submitted successfully.</div>' : ''}${r.auto ? '<div class="msg err" id="auto-note">Time expired: examination was auto-submitted.</div>' : ''}
   <div class="big" id="score">${r.score} / ${r.total}</div><p id="percent">${r.percent}% · <span class="good">${r.correct} correct</span> · <span class="bad">${r.wrong} wrong</span> · ${r.unanswered} unanswered</p>
   <h3>Review</h3><table id="review"><tbody>${r.review.map((q, k) => `<tr><td>${k + 1}</td><td>${esc(q.text)}<br><span class="muted">Your answer: ${q.yours === null ? 'none' : esc(q.options[q.yours])} · Correct: ${esc(q.options[q.correct])}</span></td><td class="${q.yours === q.correct ? 'good' : 'bad'}">${q.yours === q.correct ? '✔' : '✘'}</td></tr>`).join('')}</tbody></table>
   <p><a class="btn" href="#/student" id="back">Back to my exams</a></p></div>`;
}

boot();
