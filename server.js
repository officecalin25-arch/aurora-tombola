
// Aurora Bistro Tombola server
// node server.js
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const app = express();
const express = require('express');
const app = express();

app.use(express.static(require('path').join(__dirname, 'public')));



const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me-strong-token';

app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/docs', express.static('docs'));

// open DB
const db = new sqlite3.Database('./tombola.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT UNIQUE,
    consent INTEGER,
    created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS draws (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drawn_at TEXT,
    seed TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draw_id INTEGER,
    entry_id INTEGER,
    prize TEXT,
    FOREIGN KEY(draw_id) REFERENCES draws(id),
    FOREIGN KEY(entry_id) REFERENCES entries(id)
  )`);
});

// helper: sanitize phone minimal (store canonical)
function canonicalPhone(p) {
  return (p || '').replace(/[^\d+]/g, '');
}

// subscribe endpoint
app.post('/api/subscribe', (req, res) => {
  const {name, phone, consent} = req.body || {};
  if (!phone || !consent) return res.status(400).json({message: 'Telefonul și acordul sunt obligatorii / Phone and consent required.'});
  const cphone = canonicalPhone(phone);
  if (cphone.length < 6) return res.status(400).json({message:'Număr invalid'});
  const now = new Date().toISOString();

  const stmt = db.prepare('INSERT INTO entries (name, phone, consent, created_at) VALUES (?,?,?,?)');
  stmt.run(name||null, cphone, consent?1:0, now, function(err) {
    if (err) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(409).json({message: 'Acest număr este deja înregistrat / This phone is already registered.'});
      }
      return res.status(500).json({message:'Eroare BD / DB error'});
    }
    return res.json({message:'Înregistrat! Mult succes! / Registered. Good luck!', id: this.lastID});
  });
});

// admin auth middleware
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({message:'Unauthorized'});
  next();
}

// count
app.get('/admin/count', requireAdmin, (req, res) => {
  db.get('SELECT COUNT(*) AS c FROM entries', (err,row) => {
    if (err) return res.status(500).json({message:'DB error'});
    res.json({count: row.c});
  });
});

// export CSV (simple)
app.get('/admin/entries.csv', requireAdmin, (req,res) => {
  db.all('SELECT id,name,phone,created_at FROM entries ORDER BY id', (err, rows) => {
    if (err) return res.status(500).send('DB error');
    let csv = 'id,name,phone,created_at\n';
    for (const r of rows) { csv += `${r.id},${(r.name||'').replace(/,/g,' ')},${r.phone},${r.created_at}\n`; }
    res.setHeader('Content-Type','text/csv');
    res.send(csv);
  });
});

// draw winners: ?n=3 returns n unique winners, assign prizes if provided
// Example: POST /admin/draw?n=3 with JSON { "prizes": ["Espressor", "Pachet 100 Lei", "Pizza pentru 2"] }
app.post('/admin/draw', requireAdmin, (req, res) => {
  const n = Math.max(1, Math.min(parseInt(req.query.n || '1', 10), 20));
  const prizes = Array.isArray(req.body?.prizes) ? req.body.prizes : [];
  db.all('SELECT id FROM entries', (err, rows) => {
    if (err) return res.status(500).json({message:'DB error'});
    if (!rows || rows.length === 0) return res.status(400).json({message:'Nu există înscrieri / No entries'});
    const total = rows.length;
    const seed = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    db.run('INSERT INTO draws (drawn_at, seed) VALUES (?,?)', [now, seed], function(err2) {
      if (err2) return res.status(500).json({message:'DB error saving draw'});
      const drawId = this.lastID;

      // pick n unique indices
      const used = new Set();
      const winners = [];
      while (winners.length < Math.min(n, total)) {
        const idx = crypto.randomInt(0, total);
        if (!used.has(idx)) {
          used.add(idx);
          winners.push(rows[idx].id);
        }
      }

      // insert winners with prizes
      const out = [];
      let pending = winners.length;
      winners.forEach((entryId, i) => {
        const prize = prizes[i] || `Premiul #${i+1}`;
        db.run('INSERT INTO winners (draw_id, entry_id, prize) VALUES (?,?,?)', [drawId, entryId, prize], function(err3) {
          if (err3) return res.status(500).json({message:'DB error saving winners'});
          db.get('SELECT id,name,phone,created_at FROM entries WHERE id = ?', [entryId], (err4, row) => {
            if (err4) return res.status(500).json({message:'DB error retrieving winner'});
            out.push({prize, entry: row});
            pending--;
            if (pending===0) {
              res.json({draw_id: drawId, seed, winners: out});
            }
          });
        });
      });
    });
  });
});

// winners list
app.get('/admin/winners', requireAdmin, (req, res) => {
  db.all('SELECT w.id, w.prize, e.name, e.phone, e.created_at, w.draw_id FROM winners w JOIN entries e ON w.entry_id = e.id ORDER BY w.id', (err, rows) => {
    if (err) return res.status(500).json({message:'DB error'});
    res.json({winners: rows});
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Aurora Tombola listening on ' + PORT));
