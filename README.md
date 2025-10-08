
# Aurora Bistro — Tombola (RO/HU)

This is a small Node.js + Express + SQLite app to collect phone numbers for a **free promotional raffle** and pick winners fairly.

## Prizes (default)
1. Espressor de cafea
2. Pachet cadou 100 Lei
3. Pizza pentru 2 persoane (la alegere)

## Campaign
- Start: 1 octombrie 2025
- Draw: 22 decembrie 2025
- Address: Strada Csorgo, Joseni 537130, Romania
- Phone: +40 758 504 137

## Quick start
```bash
npm install
# IMPORTANT: set a strong admin token
export ADMIN_TOKEN="your-very-strong-token"
npm start
# open http://localhost:3000
# admin: http://localhost:3000/admin.html (use token in the input)
```

## Admin API
- `GET /admin/count` — headers: `x-admin-token`
- `GET /admin/entries.csv` — headers or `?token=`
- `POST /admin/draw?n=3` body: `{ "prizes": ["Espressor", "Pachet 100 Lei", "Pizza pentru 2"] }`
- `GET /admin/winners`

## Notes
- Phone is **unique** to prevent duplicate entries.
- Randomness uses Node `crypto.randomInt`.
- Replace logo at `public/logo.jpg` if needed.
- Edit texts in `public/index.html` (RO/HU) and docs in `/docs`.
