@AGENTS.md

# Spanish Learning App — інструкції для AI

## Що це за проект

Next.js 16 / React 19 / TypeScript застосунок для вивчення іспанської мови.
Є два основних типи контенту, якими потрібно керувати:

1. **Теми** (Topics) — словниковий запас + граматика, зберігаються в базі даних Neon PostgreSQL
2. **Домашні завдання** (Homework) — інтерактивні вправи, зберігаються в JSON-файлах на диску

## Технічний стек

- **Framework**: Next.js 16 (App Router)
- **БД**: Neon PostgreSQL через `@neondatabase/serverless`
- **Стилі**: Tailwind CSS v4
- **UI компоненти**: shadcn/ui
- **Іконки**: lucide-react
- **Скрипти**: tsx

## Структура проекту

```
spanish-learning/
├── app/
│   ├── page.tsx                   # Головна — список тем
│   ├── topics/[slug]/page.tsx     # Сторінка теми (слова + граматика)
│   ├── review/page.tsx            # Повторення (spaced repetition)
│   ├── homework/
│   │   ├── page.tsx               # Список домашніх завдань
│   │   └── [id]/
│   │       ├── page.tsx           # Сервер: завантажує JSON
│   │       └── HomeworkClient.tsx # Клієнт: вся інтерактивність
│   └── api/
│       ├── progress/route.ts      # POST/PATCH прогресу слів
│       └── seed/route.ts          # POST — ініціалізація БД
├── components/spanish/
│   ├── TopicTabs.tsx              # Вкладки: Слова / Граматика / Флешкарти / Вправа
│   ├── FlashCards.tsx             # Флешкарти
│   ├── Quiz.tsx                   # Вікторина (вибрати переклад)
│   ├── FillInBlank.tsx            # Вставити слово
│   └── ReviewSession.tsx          # Сесія повторення
├── data/
│   ├── topics/                    # JSON-файли тем (seed → БД)
│   └── homework/                  # JSON-файли домашніх завдань
├── scripts/
│   ├── seed-topic.ts              # npx tsx scripts/seed-topic.ts
│   ├── delete-topic.ts            # npx tsx scripts/delete-topic.ts <slug>
│   ├── migrate.ts                 # npx tsx scripts/migrate.ts
│   └── export-quizlet.ts
├── lib/
│   ├── db.ts                      # SQL клієнт + типи (Topic, Word, Progress)
│   └── schema.sql                 # Схема бази даних
└── audio/                         # MP3-файли для домашніх завдань
```

---

## Як додати нову тему (Topic)

### Крок 1 — створити JSON-файл

Створи файл `data/topics/<slug>.json` за таким шаблоном:

```json
{
  "title": "Назва теми українською",
  "slug": "unique-slug-kebab-case",
  "display_order": 10,
  "grammar_text": "<h2>Заголовок</h2><p>HTML-текст граматики...</p>",
  "words": [
    {
      "spanish": "hola",
      "pronunciation": "ОЛА",
      "ukrainian": "привіт",
      "example_es": "¡Hola! ¿Cómo estás?",
      "example_uk": "Привіт! Як справи?",
      "gender": null,
      "part_of_speech": "вигук"
    }
  ]
}
```

**Поля слів:**
| Поле | Обов'язкове | Опис |
|------|-------------|------|
| `spanish` | ✅ | Іспанське слово |
| `ukrainian` | ✅ | Переклад українською |
| `pronunciation` | — | Вимова великими: `ОЛА`, `усТЕД` |
| `example_es` | — | Приклад речення іспанською |
| `example_uk` | — | Переклад прикладу |
| `gender` | — | `"m"`, `"f"`, або `null` |
| `part_of_speech` | — | `"іменник"`, `"дієслово"`, `"прикметник"` тощо |

**`display_order`**: визначає порядок відображення на головній. Подивися існуючі файли і постав наступне число.

**`grammar_text`**: HTML-рядок. Підтримуються `<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>`, `<table>`, `<strong>`, `<em>`. Рендериться через `@tailwindcss/typography`.

### Крок 2 — залити в базу даних

```bash
# Один файл
npx tsx scripts/seed-topic.ts data/topics/<slug>.json

# Або всі файли одразу
npm run seed
```

Скрипт ідемпотентний: можна запускати повторно — оновить існуючі записи, не задублює.

### Крок 3 — перевірити

Відкрий `http://localhost:3000` — тема з'явиться в списку.

---

## Як додати домашнє завдання (Homework)

### Структура файлу

Створи `data/homework/<id>.json`. Назва файлу = ID завдання (використовується в URL `/homework/<id>`).

```json
{
  "id": "lesson-06",
  "title": "Урок 6 — Назва уроку",
  "due_date": "2026-06-15",
  "audio": [
    { "label": "Аудіо 07", "src": "/audio/au_plus_1_07.mp3" }
  ],
  "exercises": [ ... ]
}
```

**Аудіо**: файли MP3 кладемо в `audio/` (кореневий каталог проекту), посилання `"/audio/<filename>.mp3"`. Next.js автоматично обслуговує файли з `audio/` як статичні.

**`due_date`**: формат `YYYY-MM-DD`. Відображається як "Сьогодні!", "Завтра", "3 дн." або "Минуло".

### Типи вправ

#### Спільні поля вправ

| Поле | Обов'язкове | Опис |
|------|-------------|------|
| `id` | ✅ | Унікальний ідентифікатор вправи (`"A"`, `"B"` тощо) |
| `label` | ✅ | Відображається на значку вправи |
| `instruction` | ✅ | Інструкція іспанською (або будь-якою мовою) |
| `instruction_uk` | — | Переклад інструкції українською. Якщо вказано — під інструкцією з'являється кнопка «Показати переклад» |
| `type` | ✅ | Тип вправи: `"fill-form"` або `"match-category"` |

#### `fill-form` — заповнити форму зі словника

Студент вибирає слова зі словникового банку і вставляє в порожні поля.

```json
{
  "id": "A",
  "label": "A",
  "instruction": "Прочитай та заповни форму.",
  "type": "fill-form",
  "word_bank": ["Barbara", "brasileño", "675312908"],
  "people": [
    {
      "nombre": "Paulo",
      "apellido": "De Souza",
      "correo": "paulo@gmail.com",
      "fields": [
        {
          "id": "p1-edad",
          "label": "Edad:",
          "answer": "27"
        },
        {
          "id": "p1-nac",
          "label": "Nacionalidad:",
          "answer": "brasileño",
          "given": false
        },
        {
          "id": "p1-prof",
          "label": "Profesión:",
          "answer": "estudiante",
          "given": true
        }
      ]
    }
  ]
}
```

- `given: true` — поле вже заповнене (відображається як статичний текст, студент не взаємодіє)
- `given: false` або відсутнє — порожнє поле для заповнення
- `id` полів має бути унікальним в межах всього завдання (`p1-edad`, `p2-nombre` тощо)
- `word_bank` — всі слова, з яких студент вибирає відповіді (включай навіть зайві слова для складності)

#### `match-category` — підібрати категорію

Студент призначає кожному питанню номер категорії.

```json
{
  "id": "B",
  "label": "B",
  "instruction": "Визнач, про що запитують.",
  "type": "match-category",
  "categories": [
    { "id": 1, "text": "la nacionalidad" },
    { "id": 2, "text": "el nombre" },
    { "id": 3, "text": "la edad" }
  ],
  "questions": [
    { "id": "q1", "text": "¿Cómo te llamas?",   "answer": 2 },
    { "id": "q2", "text": "¿Cuántos años tienes?", "answer": 3 },
    { "id": "q3", "text": "¿De dónde eres?",     "answer": 1 }
  ]
}
```

- `categories[].id` — число від 1, відображається як кнопка-цифра
- `questions[].answer` — число, що відповідає `categories[].id`
- `questions[].id` має бути унікальним

### Перевірка

Файл підхоплюється автоматично — перезапуск сервера не потрібен (Next.js читає файл при кожному запиті). Відкрий `http://localhost:3000/homework`.

---

## Схема бази даних

```sql
topics (id, title, slug, grammar_text, display_order, created_at)
words  (id, topic_id→topics, spanish, ukrainian, pronunciation, example_es, example_uk, gender, part_of_speech)
progress (id, word_id→words UNIQUE, status∈{new,learning,known}, correct_count, incorrect_count, next_review_at, last_reviewed_at)
```

Щоб ініціалізувати схему: `POST /api/seed` або `npx tsx scripts/migrate.ts`.

---

## Команди розробки

```bash
npm run dev           # Запустити dev-сервер (http://localhost:3000)
npm run build         # Збірка продакшн
npm run lint          # ESLint
npm run seed          # Залити всі data/topics/*.json в БД
npx tsx scripts/seed-topic.ts data/topics/foo.json   # Один файл
npx tsx scripts/delete-topic.ts <slug>               # Видалити тему
```

---

## Змінні оточення

`.env.local`:
```
DATABASE_URL=postgres://...   # Neon PostgreSQL connection string (обов'язкова)
```

---

## Важливі конвенції

- **Мова UI**: українська (всі написи, підказки, повідомлення про помилки)
- **Мова граматики**: українська пояснення + іспанські приклади
- **Server Components**: сторінки теми та головна — async server components, запити до БД напряму
- **Client Components**: все інтерактивне (флешкарти, вікторина, аудіо) — `"use client"`, стан у `useState`, прогрес зберігається через `fetch('/api/progress', ...)`
- **Homework стан**: прогрес вправ домашніх завдань зберігається в `localStorage` (ключ: `hw-<id>-<exerciseId>`)
- **Slug**: тільки малі літери, цифри, дефіс — `kebab-case`
- **Порядок тем**: `display_order` ASC, потім `created_at` ASC

---

## Як додати новий тип вправи до домашнього завдання

1. Додай новий тип у `HomeworkClient.tsx`:
   - Оголоси TypeScript-тип (за аналогією з `ExerciseA`, `ExerciseB`)
   - Додай до union-типу `Homework["exercises"]`
   - Створи компонент `ExerciseXComponent`
   - Додай `{ex.type === "new-type" && <ExerciseXComponent ... />}` в головний рендер

2. Документуй структуру JSON тут, в цьому файлі

---

## Як видалити тему

```bash
npx tsx scripts/delete-topic.ts <slug>
```

Також видали відповідний файл `data/topics/<slug>.json`, щоб при наступному `npm run seed` він не відновився.

---

## Типові помилки

| Помилка | Причина | Рішення |
|---------|---------|---------|
| `DATABASE_URL` not set | Немає `.env.local` | Скопіюй `.env.local.example` → `.env.local`, встав рядок підключення |
| `notFound()` на сторінці теми | `slug` у URL не співпадає з БД | Перевір slug у JSON та запусти `npm run seed` |
| Домашнє завдання не відображається | Файл не в `data/homework/` або розширення не `.json` | Перевір шлях та ім'я файлу |
| Аудіо не грає | Файл не в `audio/` або неправильний `src` | `src` має бути `/audio/<filename>.mp3` |
