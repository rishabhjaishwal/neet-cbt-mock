# NEET CBT Mock

Laptop-style NEET UG CBT mock: student signup/login, year selection, timed palette UI, instant scored results on submit (marks, chosen vs correct, modelled rank/stats). Examiners can still review attempts; approval is not required.

## Stack

- Next.js App Router + TypeScript + Tailwind
- **MongoDB Atlas** via Mongoose with **MONGODB-X509** (TLS client cert)

## Quick start

```bash
npm install
cp .env.example .env.local   # set URI + X509 cert path/PEM
npm run preseed
npm run dev                  # http://127.0.0.1:3000
```

### Seeded logins

| Role | Email | Password |
|------|-------|----------|
| Examiner | examiner@neet.local | Examiner@123 |
| Demo student | student@neet.local | Student@123 |

## Docs

Project store: `/cursor/stores/self/docs/` — product overview, local run, free deploy, paper sources, MongoDB Atlas X509.
