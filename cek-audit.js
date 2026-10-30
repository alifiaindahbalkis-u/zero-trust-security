const db = require('./src/config/database');

const hasil = db.prepare(`
    SELECT
        endpoint,
        decision,
        reason,
        COUNT(*) AS jumlah
    FROM audit_logs
    GROUP BY endpoint, decision, reason
    ORDER BY endpoint
`).all();

console.table(hasil);