# autoTestScreen

Автоматична генерація та заповнення тестів на [vseosvita.ua](https://vseosvita.ua) за допомогою Claude AI + Playwright.

**Що робить:**
- Читає джерело (URL статті, PDF, DOCX)
- Генерує питання через Claude API
- Автоматично заповнює конструктор тестів у браузері

---

## Встановлення

```bash
git clone https://github.com/romkravets/autoTestScreen.git
cd autoTestScreen
npm install
npx playwright install chromium
```

Скопіюй `.env.example` → `.env` і встав свій ключ:

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_QUESTION_COUNT=22
```

---

## Використання

### 1. Логін (один раз)

```bash
node src/index.js login
```

Відкриється браузер — увійди через Google на vseosvita.ua, потім натисни **Enter** у терміналі. Сесія збережеться у `sessions/vseosvita.json`.

---

### 2. Створити тест

#### З URL статті

```bash
node src/index.js create \
  --source "https://uk.wikipedia.org/wiki/Стаття" \
  --title "Назва тесту"
```

#### З PDF

```bash
node src/index.js create \
  --source ./підручник.pdf \
  --title "Назва тесту"
```

#### З DOCX

```bash
node src/index.js create \
  --source ./матеріал.docx \
  --title "Назва тесту" \
  --count 15
```

---

### 3. Флоу після запуску

1. Claude генерує питання → **автоматично зберігає** у `./questions/дата_назва.json`
2. Термінал показує питання і чекає **Enter** для підтвердження
3. Відкривається браузер на `vseosvita.ua/test/designer`
4. Якщо сторінка з метаданими — заповни назву/предмет вручну → натисни **Enter**
5. Скрипт автоматично заповнює всі питання
6. Після завершення — перевір тест у браузері і опублікуй вручну → **Enter** для закриття

---

### Всі параметри команди `create`

| Параметр | Опис | За замовчуванням |
|---|---|---|
| `-s, --source` | URL, PDF або DOCX (обов'язково) | — |
| `-t, --title` | Назва тесту (обов'язково) | — |
| `-c, --count` | Кількість питань | `22` |
| `--url` | URL існуючого тесту в редакторі | — |
| `--save-questions` | Зберегти питання у вказаний файл | автофайл |
| `--load-questions` | Завантажити питання з JSON (пропустити генерацію) | — |
| `--headless` | Запустити браузер у фоні (без вікна) | `false` |

---

### Перезапуск після помилки

Якщо скрипт впав — питання вже збережені у `./questions/`. Запусти повторно без генерації:

```bash
node src/index.js create \
  --load-questions ./questions/2026-04-02T13-04_Назва.json \
  --title "Назва тесту" \
  --url "https://vseosvita.ua/test/designer?id=XXXXX"
```

---

## Типи питань

Скрипт генерує три типи у пропорції ~50/30/20:

| Тип | Опис |
|---|---|
| `single` | Одна правильна відповідь (4 варіанти) |
| `multiple` | Кілька правильних відповідей (5–6 варіантів) |
| `text` | Поле для вводу відповіді |

---

## Структура проєкту

```
src/
├── index.js       — CLI (login / create)
├── auth.js        — збереження Google-сесії
├── extractor.js   — парсинг URL / PDF / DOCX
├── generator.js   — генерація питань через Claude API
├── automator.js   — Playwright автоматизація
└── utils.js       — людиноподібні затримки
questions/         — збережені JSON з питаннями
sessions/          — сесія браузера (не комітити!)
debug/             — скриншоти при помилках
```
