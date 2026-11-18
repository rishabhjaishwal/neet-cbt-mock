# MongoDB indexes

Indexes are declared on Mongoose schemas in `src/lib/models.ts` and synced via
`ensureMongoIndexes()` (`src/lib/seed.ts`) on seed / dashboard / charts paths.

## Query patterns → indexes

| Collection | Pattern | Index |
|---|---|---|
| `users` | Login by email | `{ email: 1 }` unique |
| `attempts` | Unique attempt slot | `{ userId: 1, year: 1, attemptNumber: 1 }` unique |
| `attempts` | In-progress / status filters | `{ userId: 1, status: 1 }` |
| `attempts` | Dashboard chart agg (submitted desc) | `{ userId: 1, status: 1, submittedAt: -1 }` |
| `attempts` | Desk latest-by-year listing | `{ userId: 1, year: -1, attemptNumber: -1 }` |
| `topicattempts` | Resume / sequence list | `{ userId: 1, topicId: 1, difficulty: 1, startedAt: -1 }` |
| `topicattempts` | Dashboard topic / NEET AI charts | `{ userId: 1, status: 1, submittedAt: -1 }` |
| `topicattempts` | Per-pack history | `{ userId: 1, topicId: 1, status: 1, submittedAt: -1 }` |
| `competitions` | Invite join | `{ inviteCode: 1 }` unique |
| `competitions` | Host list | `{ hostId: 1, createdAt: -1 }` |
| `competitions` | Member list | `{ members.userId: 1, createdAt: -1 }` |
| `competitions` | Status filter | `{ status: 1 }` |
| `competitionattempts` | One attempt per member | `{ competitionId: 1, userId: 1 }` unique |
| `competitionattempts` | User history | `{ userId: 1, status: 1, startedAt: -1 }` |
| `suggestions` | Student notebook | `{ userId: 1, createdAt: -1 }` |

Legacy unique `{ userId: 1, year: 1 }` on attempts is dropped during seed if present.
