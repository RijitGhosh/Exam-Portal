const { BASE } = require('./helpers');
module.exports = async () => {
  const ids = (process.env.RUN_IDS || 'ALL');
  const post = p => fetch(BASE + '/api/test/' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const adminLane = ids === 'ALL' || ids.split(',').some(i => /^A\d/.test(i));
  if (adminLane) await post('reset-all');      // admin tests build the 4 students/exams themselves through the UI
  else { await post('seed'); await post('reset-attempts'); }
  await post('cleanup-temp');
};
