// Aurora Bistro Tombola – Express + Supabase Postgres (Render-ready)
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- DB init (run once at start)
async function init() {
  await pool.query(`
    create table if not exists entries (
      id bigserial primary key,
      name text,
      phone text unique not null,
      consent boolean not null default true,
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    create table if not exists draws (
      id bigserial primary key,
      seed text not null,
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    create table if not exists winners (
      id bigserial primary key,
      draw_id bigint references draws(id) on delete cascade,
      entry_id bigint references entries(id) on delete cascade,
      prize text not null,
      created_at timestamptz not null default now()
    );
  `);
}

// --- helpers
function requireAdmin(req, res, next) {
  const t = req.headers['x-admin-token'] || req.query.token || '';
  if (!ADMIN_TOKEN || t !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// --- public routes
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// form submit: { name, phone, consent }
app.post('/api/subscribe', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const phone = (req.body.phone || '').trim();
    const consent = !!req.body.consent;

    if (!phone) return res.status(400).json({ error: 'Telefonszám szükséges.' });

    // insert or ignore on duplicate phone
    const q = `
      insert into entries (name, phone, consent)
      values ($1, $2, $3)
      on conflict (phone) do nothing
      returning id, created_at
    `;
    const r = await pool.query(q, [name || null, phone, consent]);

    if (r.rowCount === 0) {
      return res.json({ message: 'Már regisztráltál ezzel a számmal. Sok sikert!' });
    }
    return res.json({ message: 'Sikeres jelentkezés! Sok szerencsét!' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Szerver hiba.' });
  }
});

// --- admin routes
app.get('/admin/count', requireAdmin, async (_req, res) => {
  const r = await pool.query('select count(*)::int as count from entries');
  res.json({ count: r.rows[0].count });
});

app.get('/admin/entries', requireAdmin, async (_req, res) => {
  const r = await pool.query(
    'select id, name, phone, created_at from entries order by id desc'
  );
  res.json({ entries: r.rows });
});

app.delete('/admin/entries/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const r = await pool.query('delete from entries where id = $1', [id]);
  res.json({ ok: true, deleted: r.rowCount });
});

app.get('/admin/entries.csv', requireAdmin, async (_req, res) => {
  const r = await pool.query(
    'select id, coalesce(name, \'\') as name, phone, created_at from entries order by id'
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="entries.csv"');
  res.write('id,name,phone,created_at\n');
  for (const row of r.rows) {
    const line = [
      row.id,
      `"${(row.name || '').replace(/"/g, '""')}"`,
      `"${row.phone.replace(/"/g, '""')}"`,
      row.created_at.toISOString()
    ].join(',');
    res.write(line + '\n');
  }
  res.end();
});

app.post('/admin/draw', requireAdmin, async (req, res) => {
  try {
    const n = Math.max(1, Math.min(20, parseInt(req.query.n || '3', 10)));
    const prizes = Array.isArray(req.body?.prizes) ? req.body.prizes.filter(Boolean) : [];

    // fetch N random entries
    const ent = await pool.query('select id, name, phone, created_at from entries order by random() limit $1', [n]);

    // create draw
    const seed = crypto.randomBytes(32).toString('hex');
    const dr = await pool.query('insert into draws (seed) values ($1) returning id', [seed]);
    const draw_id = dr.rows[0].id;

    const winners = [];
    const limit = Math.min(ent.rowCount, prizes.length || n);
    for (let i = 0; i < limit; i++) {
      const entry = ent.rows[i];
      const prize = prizes[i] || `Díj #${i + 1}`;
      await pool.query(
        'insert into winners (draw_id, entry_id, prize) values ($1, $2, $3)',
        [draw_id, entry.id, prize]
      );
      winners.push({ prize, entry });
    }

    res.json({ draw_id, seed, winners });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'draw failed' });
  }
});

app.get('/admin/winners', requireAdmin, async (_req, res) => {
  const r = await pool.query(`
    select w.id, w.draw_id, w.prize, w.created_at,
           e.id as entry_id, e.name, e.phone, e.created_at as entry_created_at
    from winners w
    join entries e on e.id = w.entry_id
    order by w.id desc
  `);
  res.json({ winners: r.rows });
});

// --- start
const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, () => console.log('Aurora Tombola listening on ' + PORT)))
  .catch(err => {
    console.error('DB init failed', err);
    process.exit(1);
  });
