# NEET CBT Mock

Laptop-style NEET UG CBT mock: **student-only** signup/login, year papers, topic drills, friend competitions (invite code), and instant scored results on submit.

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
| Demo student | student@neet.local | Student@123 |

Public `/login` rejects examiner accounts. Seed examiner exists for local audit only.

## Docs

Project store: `/cursor/stores/self/docs/` — product overview, local run, free deploy, paper sources, MongoDB Atlas X509.
