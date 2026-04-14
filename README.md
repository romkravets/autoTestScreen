# autoTestScreen

Автоматична генерація тестів для [vseosvita.ua](https://vseosvita.ua) за допомогою AI + Playwright.

Вказуєш тему або даєш джерело (URL / PDF / DOCX) — скрипт генерує питання через AI і автоматично заповнює конструктор тестів на сайті.

Підтримувані моделі: **Claude, Groq, OpenRouter, Ollama (локально), LM Studio (локально), будь-який OpenAI-сумісний ендпоінт.**

---

## Встановлення

```bash
git clone https://github.com/romkravets/autoTestScreen.git
cd autoTestScreen
npm install
npx playwright install chromium
cp .env.example .env
```

Відкрий `.env` і встав потрібні ключі (мінімум один).

---

## Моделі та провайдери

### Формат параметра `--model`

```
provider           # використати модель за замовчуванням
provider:model-id  # вказати конкретну модель
```

### Доступні провайдери

| Провайдер            | `--model`    | Безкоштовно   | Потрібен ключ        |
| -------------------- | ------------ | ------------- | -------------------- |
| Anthropic Claude     | `claude`     | платно        | `ANTHROPIC_API_KEY`  |
| Groq                 | `groq`       | так           | `GROQ_API_KEY`       |
| OpenRouter           | `openrouter` | є безкоштовні | `OPENROUTER_API_KEY` |
| Ollama (локально)    | `ollama`     | так           | не потрібен          |
| LM Studio (локально) | `lmstudio`   | так           | не потрібен          |
| Кастомний ендпоінт   | `custom`     | —             | `CUSTOM_API_KEY`     |

### Приклади моделей

```bash
--model claude                              # Claude Sonnet 4.6 (за замовч.)
--model claude:claude-opus-4-6              # Claude Opus
--model groq                                # Llama 3.3 70B via Groq
--model groq:mixtral-8x7b-32768            # Mixtral via Groq
--model openrouter                          # Llama 3.3 70B (free) via OpenRouter
--model openrouter:google/gemma-3-27b-it:free
--model ollama                              # llama3.2 локально
--model ollama:mistral                      # Mistral локально
--model lmstudio:my-model                   # будь-яка модель в LM Studio
--model custom:my-model                     # кастомний ендпоінт
```

### Налаштування `.env`

```env
# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# Groq (безкоштовно: console.groq.com)
GROQ_API_KEY=gsk_...

# OpenRouter (безкоштовні моделі: openrouter.ai)
OPENROUTER_API_KEY=sk-or-...

# Локальні (змінити тільки якщо нестандартний порт)
# OLLAMA_BASE_URL=http://localhost:11434/v1
# LMSTUDIO_BASE_URL=http://localhost:1234/v1

# Кастомний OpenAI-сумісний ендпоінт
# CUSTOM_API_BASE=https://your-api.com/v1
# CUSTOM_API_KEY=your-key

# Модель за замовчуванням (якщо не вказано --model)
DEFAULT_MODEL=claude
DEFAULT_QUESTION_COUNT=22
```

### Як отримати безкоштовні ключі

- **Groq** → [console.groq.com](https://console.groq.com) → API Keys (швидко, безкоштовно)
- **OpenRouter** → [openrouter.ai](https://openrouter.ai) → Keys (є повністю безкоштовні моделі з `:free` суфіксом)
- **Ollama** → встанови [ollama.com](https://ollama.com), запусти `ollama pull llama3.2` — ключ не потрібен
- **LM Studio** → встанови [lmstudio.ai](https://lmstudio.ai), завантаж модель, запусти Local Server — ключ не потрібен

---

## Команди

| Команда    | Що робить                                             |
| ---------- | ----------------------------------------------------- |
| `login`    | Відкриває браузер для Google-логіну (один раз)        |
| `generate` | Генерує питання та зберігає у JSON **без браузера**   |
| `create`   | Генерує питання та автоматично заповнює тест на сайті |

---

## Використання

### 1. Логін (один раз)

```bash
node src/index.js login
```

Відкриється браузер — увійди через Google на vseosvita.ua → натисни **Enter** у терміналі.

---

### 2. Тільки згенерувати JSON (без сайту)

```bash
# Claude (за замовчуванням)
node src/index.js generate \
  --prompt "Бази даних: SQL, нормалізація, індекси" \
  --title "Бази даних" \
  --count 22

# Groq (безкоштовно)
node src/index.js generate \
  --prompt "Фізика 9 клас: закони Ньютона" \
  --title "Фізика" \
  --model groq

# Ollama локально
node src/index.js generate \
  --source ./підручник.pdf \
  --title "Назва тесту" \
  --model ollama:llama3.2

# OpenRouter безкоштовна модель
node src/index.js generate \
  --prompt "Хімія: органічні сполуки" \
  --title "Хімія" \
  --model openrouter:google/gemma-3-27b-it:free
```

Питання збережуться у `./questions/дата_назва.json`.

---

### 3. Згенерувати і відразу заповнити на сайті

```bash
node src/index.js create \
  --prompt "Тест з біології: клітина, органели" \
  --title "Біологія — клітина" \
  --model groq

node src/index.js create \
  --source "https://example.com/article" \
  --title "Назва тесту" \
  --model claude
```

---

### 4. Заповнити з готового JSON (без генерації)

```bash
node src/index.js create \
  --load-questions ./questions/2026-04-02T13-04_Назва.json \
  --title "Назва тесту" \
  --url "https://vseosvita.ua/test/designer?id=XXXXX"
```

---

### 5. Флоу команди `create`

1. AI генерує питання → зберігає у `./questions/`
2. Термінал показує розбивку по типах → чекає **Enter**
3. Відкривається браузер
4. Якщо відкрилась форма метаданих — заповни назву/предмет вручну → **Enter**
5. Скрипт автоматично заповнює всі питання
6. Перевір результат у браузері → опублікуй вручну → **Enter** щоб закрити

---

## Всі параметри

| Параметр           | Команди          | Опис                            | За замовч. |
| ------------------ | ---------------- | ------------------------------- | ---------- |
| `-p, --prompt`     | generate, create | Довільна тема або текст         | —          |
| `-s, --source`     | generate, create | URL, PDF або DOCX               | —          |
| `-t, --title`      | generate, create | Назва тесту (обов'язково)       | —          |
| `-c, --count`      | generate, create | Кількість питань                | `22`       |
| `-m, --model`      | generate, create | Провайдер та модель             | `claude`   |
| `--save-questions` | generate, create | Зберегти у вказаний файл        | автофайл   |
| `--load-questions` | create           | Завантажити питання з JSON      | —          |
| `--url`            | create           | URL існуючого тесту в редакторі | —          |
| `--headless`       | create           | Браузер у фоні (без вікна)      | `false`    |

> Одне з `--prompt`, `--source` або `--load-questions` обов'язкове.

---

## Типи питань

Генеруються автоматично у пропорції ~50 / 30 / 20:

| Тип        | Опис                                         |
| ---------- | -------------------------------------------- |
| `single`   | Одна правильна відповідь (4 варіанти)        |
| `multiple` | Кілька правильних відповідей (5–6 варіантів) |
| `text`     | Поле для вводу відповіді                     |

---

## Структура проєкту

```
src/
├── index.js       — CLI (login / generate / create)
├── auth.js        — збереження Google-сесії
├── extractor.js   — парсинг URL / PDF / DOCX
├── generator.js   — генерація питань (мульти-провайдер)
├── automator.js   — Playwright автоматизація
└── utils.js       — людиноподібні затримки
questions/         — збережені JSON з питаннями
sessions/          — сесія браузера (не комітити!)
debug/             — скриншоти при помилках
```

Скопіюй .env і заповни ключ:

cp .env .env.local # або редагуй .env напряму
Мінімум потрібен один з:

ANTHROPIC*API_KEY=sk-ant-... (Claude)
GROQ_API_KEY=gsk*... (безкоштовно) 2. Логін (один раз)

npm run login
Відкриється браузер → увійди через Google → сесія збережеться.

3. Команда create
   З URL джерела:

node src/index.js create -t "Назва тесту" -s https://example.com/article
З PDF або DOCX:

node src/index.js create -t "Назва тесту" -s ./docs/file.pdf
З довільного промпту (без джерела):

node src/index.js create -t "Назва тесту" -p "Створи тест про безпеку дорожнього руху"
З готового JSON (пропустити генерацію):

node src/index.js create -t "Назва тесту" --load-questions ./questions/file.json
Всі опції
Опція Опис За замовч.
-t Назва тесту (обов'язково) —
-s URL, PDF або DOCX —
-p Текстовий промпт —
-c Кількість питань 22
-m Модель: claude, groq, ollama:llama3.2 claude
--headless Браузер без GUI false
--load-questions Завантажити питання з JSON —
--url URL існуючого тесту в дизайнері —

node server.js
Відкрий браузер: http://localhost:5173
або
якщо зайнят ий то
PORT_UI=5200 npm run start-ui
Відкрий: http://localhost:5200
