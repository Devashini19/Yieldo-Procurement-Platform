# Yieldo — SIH 2026 (PS 26032)

Farmer procurement queue & slot management platform. Backend uses an
in-memory store so it runs instantly with no DB setup — swap in
Postgres/Firebase later without touching route logic.

## Run it

**Backend** (http://localhost:4000)
```
cd backend
npm install
npm run dev
```

**Frontend** (http://localhost:5173)
```
cd frontend
npm install
npm run dev
```

The frontend proxies `/api` calls to the backend (see `vite.config.js`),
so open http://localhost:5173 and both are wired together.

## What's built

- **Farmer flow:** register → get a live token → check status page shows
  real-time queue position, dynamic ETA (position × centre's average
  processing time — this is the "predictive slot" concept from the pitch,
  not a fixed appointment), and a 5-stage pipeline view
  (Queue → Quality Check → Procured → Payment Initiated → Paid).
- **Admin flow:** load overview across centres, live queue table, one-click
  buttons to advance a farmer through each pipeline stage.
- **SMS:** mocked in `backend/utils/sms.js` — logs to console. Swap in
  Twilio/MSG91 with the same `sendSMS(phone, message)` signature.

## Not built yet (from the original feature list — next to tackle)

- Vernacular/WhatsApp chatbot (reuse your existing Gemini agent code)
- Photo-based quality pre-check
- Geofenced auto check-in
- Persistent DB (currently in-memory — data resets on server restart)

## Structure

```
backend/
  server.js          Express entry point
  routes/farmers.js   register + status endpoints
  routes/admin.js      queue + advance-stage endpoints
  data/store.js         in-memory data + ETA calculation logic
  utils/sms.js            mock SMS sender

frontend/
  src/pages/Register.jsx   booking form + hero
  src/pages/Status.jsx       live status/ETA/pipeline (polls every 8s)
  src/pages/Admin.jsx         centre overview + queue management
  src/index.css                  design system (see tokens at top of file)
```
