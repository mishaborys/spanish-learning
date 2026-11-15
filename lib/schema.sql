CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  grammar_text TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS words (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  spanish TEXT NOT NULL,
  ukrainian TEXT NOT NULL,
  example_es TEXT,
  example_uk TEXT,
  gender TEXT,
  part_of_speech TEXT
);

CREATE TABLE IF NOT EXISTS progress (
  id SERIAL PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE UNIQUE,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'learning', 'known')),
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMPTZ
);

-- Довге повторення (lib/review). Створюються також автоматично в lib/review/store.ts.
CREATE TABLE IF NOT EXISTS review_cards (
  word_key TEXT PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 0,
  due_on DATE NOT NULL,
  last_grade TEXT NOT NULL CHECK (last_grade IN ('known', 'hesitant', 'unknown')),
  times_reviewed INTEGER NOT NULL DEFAULT 0,
  last_reviewed_on DATE
);

CREATE TABLE IF NOT EXISTS review_batches (
  day DATE NOT NULL,
  batch INTEGER NOT NULL,
  mode TEXT NOT NULL,
  word_keys TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, batch)
);

CREATE TABLE IF NOT EXISTS review_answers (
  day DATE NOT NULL,
  batch INTEGER NOT NULL,
  word_key TEXT NOT NULL,
  grade TEXT NOT NULL CHECK (grade IN ('known', 'hesitant', 'unknown')),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, batch, word_key)
);
