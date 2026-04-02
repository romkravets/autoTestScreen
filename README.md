# autoTestScreen

Автоматична генерація тестів для [vseosvita.ua](https://vseosvita.ua) за допомогою Claude AI + Playwright.

Вказуєш тему або даєш джерело (URL / PDF / DOCX) — скрипт генерує питання через AI і автоматично заповнює конструктор тестів на сайті.

---

## Встановлення

```bash
git clone https://github.com/romkravets/autoTestScreen.git
cd autoTestScreen
npm install
npx playwright install chromium
cp .env.example .env
```

Відкрий `.env` і встав свій [Anthropic API ключ](https://console.anthropic.com/):

```env
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_QUESTION_COUNT=22
```

---

## Швидкий старт

```bash
# 1. Логін (один раз)
node src/index.js login

# 2. Згенерувати тест з теми
node src/index.js create --prompt "Бази даних: SQL, нормалізація" --title "Бази даних"
```

---

## Команди

### `login` — зберегти сесію

```bash
node src/index.js login
```

Відкриється браузер. Увійди через Google на vseosvita.ua → натисни **Enter** у терміналі. Потрібно зробити лише один раз.

---

### `generate` — тільки JSON, без браузера

Генерує питання та зберігає у `./questions/`. Браузер не відкривається — зручно щоб перевірити питання перед заповненням.

```bash
# З довільної теми
node src/index.js generate \
  --prompt "Фізика 9 клас: закони Ньютона, кінематика. Акцент на практичних задачах" \
  --title "Фізика" \
  --count 22

# З URL статті
node src/index.js generate \
  --source "https://uk.wikipedia.org/wiki/Стаття" \
  --title "Назва тесту"

# З PDF або DOCX
node src/index.js generate \
  --source ./підручник.pdf \
  --title "Назва тесту" \
  --count 15
```

---

### `create` — згенерувати і заповнити на сайті

Те саме що `generate`, але після збереження JSON відкриває браузер і автоматично заповнює тест.

```bash
# З теми
node src/index.js create \
  --prompt "Хімія 10 клас: органічна хімія, алкани, алкени" \
  --title "Органічна хімія"

# З URL
node src/index.js create \
  --source "https://example.com/article" \
  --title "Назва тесту"

# Завантажити готовий JSON і заповнити (без генерації)
node src/index.js create \
  --load-questions ./questions/2026-04-02T13-04_Назва.json \
  --title "Назва тесту"

# Заповнити конкретний існуючий тест за URL
node src/index.js create \
  --load-questions ./questions/файл.json \
  --title "Назва" \
  --url "https://vseosvita.ua/test/designer?id=XXXXX"
```

**Флоу після запуску:**
1. Claude генерує питання → зберігає у `./questions/`
2. Термінал показує розбивку по типах → чекає **Enter**
3. Відкривається браузер
4. Якщо відкрилась форма метаданих — заповни назву/предмет вручну → **Enter**
5. Скрипт автоматично заповнює всі питання
6. Перевір результат у браузері → опублікуй вручну → **Enter** щоб закрити

---

## Параметри

| Параметр | Команди | Опис | За замовч. |
|---|---|---|---|
| `-p, --prompt` | generate, create | Довільна тема або текст | — |
| `-s, --source` | generate, create | URL, PDF або DOCX | — |
| `-t, --title` | generate, create | Назва тесту (обов'язково) | — |
| `-c, --count` | generate, create | Кількість питань | `22` |
| `--save-questions` | generate, create | Зберегти у вказаний файл | автофайл |
| `--load-questions` | create | Завантажити питання з JSON | — |
| `--url` | create | URL існуючого тесту в редакторі | — |
| `--headless` | create | Браузер у фоні (без вікна) | `false` |

> Одне з `--prompt`, `--source` або `--load-questions` обов'язкове.

---

## Типи питань

Генеруються автоматично у пропорції ~50 / 30 / 20:

| Тип | Опис |
|---|---|
| `single` | Одна правильна відповідь (4 варіанти) |
| `multiple` | Кілька правильних відповідей (5–6 варіантів) |
| `text` | Поле для вводу відповіді |

---

## Структура проєкту

```
src/
├── index.js       — CLI (login / generate / create)
├── auth.js        — збереження Google-сесії
├── extractor.js   — парсинг URL / PDF / DOCX
├── generator.js   — генерація питань через Claude API
├── automator.js   — Playwright автоматизація
└── utils.js       — людиноподібні затримки
questions/         — збережені JSON з питаннями
sessions/          — сесія браузера (не комітити!)
debug/             — скриншоти при помилках
```
