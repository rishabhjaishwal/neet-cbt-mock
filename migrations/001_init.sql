create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null check (role in ('student', 'examiner')),
  created_at timestamptz not null default now()
);

create table if not exists papers (
  year integer primary key,
  code text not null,
  title text not null,
  candidate_count integer not null,
  duration_minutes integer not null,
  total_questions integer not null,
  attempt_limit integer not null,
  structure text not null,
  source_note text not null,
  gaps_json text not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id text primary key,
  year integer not null references papers(year) on delete cascade,
  number integer not null,
  subject text not null,
  section text not null,
  topic text not null,
  stem text not null,
  options_json text not null,
  correct_option text not null,
  is_placeholder boolean not null default false,
  answer_estimated boolean not null default false,
  unique (year, number)
);

create index if not exists questions_year_idx on questions(year);

create table if not exists attempts (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  year integer not null references papers(year),
  status text not null check (status in ('in_progress', 'submitted', 'approved')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by text references users(id),
  score integer,
  correct_count integer,
  wrong_count integer,
  unattempted_count integer,
  subject_stats_json text,
  topic_stats_json text,
  percentile numeric,
  estimated_rank integer,
  unique (user_id, year)
);

create table if not exists attempt_answers (
  attempt_id text not null references attempts(id) on delete cascade,
  question_id text not null references questions(id),
  selected_option text,
  status text not null check (status in ('not_attempted', 'attempted', 'marked')),
  primary key (attempt_id, question_id)
);

create index if not exists attempts_status_idx on attempts(status);
create index if not exists attempts_user_idx on attempts(user_id);
