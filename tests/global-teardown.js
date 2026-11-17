const { BASE } = require('./helpers');
module.exports = async () => { await fetch(BASE + '/api/test/cleanup-temp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); };
