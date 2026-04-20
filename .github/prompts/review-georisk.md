# GeoRisk Analyzer — Repository-Specific Review Overlay

**Extends**: `.github/prompts/review-base.md`

Use the base prompt for structure, output format, deduplication rules, and review philosophy.
This overlay defines all project-specific rules, patterns, and invariants.

---

## Repository Context

- **Purpose**: Geopolitical risk monitor for SMEs — collects news, scores countries 0–100, displays on interactive map
- **Stack**:
  - Pipeline: Python 3.12, APScheduler, feedparser, NewsAPI, GDELT CSV, ACLED API
  - Backend: FastAPI, SQLAlchemy 2.0, psycopg3, Redis, Pydantic v2
  - Frontend: Next.js 14 (App Router), TypeScript (strict), Tailwind CSS, Leaflet.js, Recharts
  - Infra: Docker Compose, PostgreSQL 16, Redis 7
- **Package managers**: pip (pipeline/backend), npm (frontend)
- **Python version**: 3.12 — not 3.14 (torch/psycopg wheels incompatibility)

### Architecture

```
pipeline/
  collector.py        — NewsAPI + RSS + GDELT CSV + ACLED
  sentiment.py        — Rule-based sentiment, keyword_boost
  scorer.py           — Risk score formula 0–100
  country_mapper.py   — ISO2 mapping via keyword index
  scheduler.py        — APScheduler BlockingScheduler, 10-min cycle
  models.py           — SQLAlchemy: Country, Article, RiskScore, AlertSubscription
  database.py         — Engine + SessionLocal

backend/
  main.py             — FastAPI app, CORS, routers
  routers/            — countries.py, news.py, alerts.py
  schemas.py          — Pydantic response models
  cache.py            — Redis get/set with TTL
  config.py           — pydantic-settings, reads .env

frontend/
  src/app/            — Next.js App Router pages
  src/components/     — WorldMap, CountryCard, RiskGauge, RiskBadge
  src/lib/api.ts      — axios client, TypeScript interfaces
  src/lib/utils.ts    — scoreToLevel(), RISK_COLORS, formatScore()
```

### Risk Score Formula (invariant — do not change without full recalibration)

```python
avg_boost = sum(a["keyword_boost"] for a in articles) / total
normalized_boost = min(avg_boost / 400.0, 1.0)
score = (negative_ratio * 80.0) + (normalized_boost * 20.0)
score = round(min(100.0, score), 2)
```

### Risk Level Thresholds (invariant)

| Level    | Score     |
|----------|-----------|
| LOW      | 0–24.99   |
| MEDIUM   | 25–49.99  |
| HIGH     | 50–74.99  |
| CRITICAL | 75–100    |

---

## File Type Handling (Extends Base)

**ALSO REVIEW IN DETAIL:**

- `pipeline/*.py` — data correctness, deduplication, datetime handling
- `backend/routers/*.py` — SQL queries, cache logic, response models
- `backend/schemas.py` — Pydantic field types and validators
- `frontend/src/components/*.tsx` — client/server boundary, Leaflet SSR, hooks
- `frontend/src/lib/*.ts` — API types, utility functions

**ALSO SKIP:**

- `pipeline/__pycache__/`, `pipeline/.venv/` — generated
- `frontend/.next/` — build artifacts
- `frontend/public/world.geojson` — third-party GeoJSON data
- `*.lock`, `package-lock.json` — dependency lockfiles

---

## Project Severity Rules

### 🔴 CRITICAL

<!-- prettier-ignore -->
| Rule | Why |
|------|-----|
| Hardcoded credentials in source (API keys, DB passwords, tokens) | Secrets in git — exposed permanently even after removal |
| Raw SQL via `text()` in SQLAlchemy | SQL injection; project uses `select()` ORM exclusively |
| `any` type in TypeScript | Bypasses `strict: true` type checker — silent runtime errors |
| `datetime.utcnow()` usage | Deprecated in Python 3.12, removed in 3.14; use `datetime.now(timezone.utc)` |
| Score guard `min(100.0, score)` removed | Score can exceed 100, breaking all risk level thresholds downstream |
| DB URL without `postgresql+psycopg://` prefix | psycopg3 requires this prefix; wrong prefix silently uses psycopg2 or fails |
| Scorer formula weights changed without updating divisor | `80.0/20.0/400.0` are calibrated together; changing one without others breaks all country scores |

### 🟠 HIGH

| Rule | Why |
|------|-----|
| Legacy `session.query()` instead of `select()` | SQLAlchemy 2.0 style is mandatory; `query()` is removed in SA 3.0 |
| Missing `response_model=` on FastAPI endpoint | Skips Pydantic serialization — leaks internal ORM fields to clients |
| Redis `cache_set()` called without TTL | Infinite TTL = stale data; cache never expires after pipeline updates |
| `from pipeline.X import` or `from backend.X import` | Breaks execution when running from within subdirectory (e.g., `python scheduler.py`) |
| Leaflet imported at module top level | `window` is undefined on server; must use `import("leaflet")` inside `useEffect` |
| Missing `"use client"` on component using hooks/events | Next.js App Router silently ships static HTML with no interactivity |
| GDELT polled more often than `GDELT_MIN_INTERVAL_MIN = 60` | GDELT updates every 15 min; faster polling wastes bandwidth and risks block |
| APScheduler job without top-level try/except | Unhandled exception stops the scheduler permanently — silent data collection halt |

### 🟡 MEDIUM

| Rule | Why |
|------|-----|
| `from X import` inside function body in pipeline | e.g., `from sentiment import NEGATIVE_KEYWORDS` inside loop — re-imports on every call |
| Missing `timeout=` on `requests.get()` | Pipeline hangs indefinitely on slow/dead sources (Reuters RSS, ACLED) |
| Missing `exc_info=True` on `logger.error()` | Stack trace lost in production logs — impossible to debug |
| Magic numbers `80.0`, `20.0`, `400.0` in scorer.py | Should be named constants — one change breaks calibration invisibly |
| ISO2 code not normalized with `.upper()` before DB query | `country:ua` ≠ `country:UA` — cache miss + potential 404 |
| `url_hash` truncation reduced below 64 chars | Current 64 chars (SHA256) is collision-safe; reduction increases collision probability |
| Arbitrary Tailwind `[...]` values for non-one-off styling | Prefer standard utility classes from `tailwind.config.ts` color scale |
| `clsx` not used for conditional Tailwind classes | String concatenation with ternary breaks on complex conditions |

---

## Mandatory Project Patterns

### 1. Secrets and Config

All credentials come from `.env` via `pydantic-settings`. Never in source code.

```python
# CORRECT
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")
if not NEWS_API_KEY:
    logger.warning("NEWS_API_KEY not set — skipping NewsAPI")
    return []

# WRONG
client = NewsApiClient(api_key="sk-abc123...")
```

**Check:** No API keys, passwords, or tokens hardcoded. Placeholder detection for ACLED credentials (`{"your_email_here", "", "your_api_key_here"}`).

### 2. SQLAlchemy 2.0 Style

```python
# CORRECT — SQLAlchemy 2.0
from sqlalchemy import select
stmt = select(Article).where(Article.country_id == country_id).limit(20)
articles = session.scalars(stmt).all()

# WRONG — legacy, removed in SA 3.0
articles = session.query(Article).filter_by(country_id=country_id).all()
```

**Check:** `select()` everywhere, `Mapped[T]` + `mapped_column()` in models, no `DeclarativeBase` vs `declarative_base()` mix.

### 3. Timezone-aware Datetimes

```python
# CORRECT
from datetime import datetime, timezone
now = datetime.now(timezone.utc)

# WRONG — deprecated in 3.12, removed in 3.14
now = datetime.utcnow()
```

### 4. Redis Cache Pattern

```python
# CORRECT — always check/set with TTL, wrap in try/except
def list_countries(db):
    cached = cache_get("countries:all")
    if cached:
        return cached
    result = fetch_from_db(db)
    cache_set("countries:all", result)   # TTL set in cache_set default
    return result

# WRONG — no cache check, or cache without TTL
```

**Check:** Every `cache_set()` has TTL. Redis failure (`except Exception`) must not crash the request. Invalidate `countries:all` and `country:{iso2}` after score recalculation.

### 5. FastAPI Response Models

```python
# CORRECT
@router.get("/{iso2}", response_model=CountryDetail)
def get_country(iso2: str, db: Session = Depends(get_db)):
    ...

# WRONG — no schema, no validation
@app.get("/country")
def get_country():
    return {"data": ...}
```

**Check:** Every `@router.get/post/delete` has `response_model=`. POST/DELETE have explicit `status_code=`. `tags=` present on every router.

### 6. Pipeline Import Style

```python
# CORRECT — run from within pipeline/ directory
from sentiment import enrich_article
from scorer import calculate_country_score

# WRONG — breaks `python scheduler.py` from pipeline/ dir
from pipeline.sentiment import enrich_article
```

### 7. Leaflet in Next.js

```tsx
// CORRECT — dynamic import inside useEffect, client-only
useEffect(() => {
  import("leaflet").then((L) => {
    // init map
  });
}, []);

// WRONG — top-level import crashes SSR
import L from "leaflet";
```

**Check:** No top-level `import ... from "leaflet"`. Component has `"use client"` directive.

### 8. TypeScript Types

```ts
// CORRECT — typed API responses, no any
export interface CountryRisk {
  iso2: string;
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

// WRONG
const data: any = await fetchCountries();
```

**Check:** All API response types defined in `lib/api.ts`. No `as any` casts.

### 9. ISO2 Normalization

```python
# CORRECT — always uppercase before DB/cache operations
iso2 = iso2.upper()
country = db.execute(select(Country).where(Country.iso2 == iso2)).scalar_one_or_none()

# WRONG — lowercase iso2 misses cache and DB records
cache_key = f"country:{iso2}"  # if iso2 is "ua" not "UA"
```

---

## Pipeline Data Invariants

When reviewing changes to pipeline files, verify these:

### collector.py

- `url_hash()` uses SHA256 truncated to **64 chars** — do not reduce
- `collect_all()` deduplicates by `url_hash` before returning
- GDELT: `GDELT_MIN_INTERVAL_MIN = 60` respected — never bypass
- ACLED: placeholder detection set `{"your_email_here", "", "your_api_key_here", "your_password_here"}` — must include all variants
- All `requests.get()` calls have `timeout=` argument

### sentiment.py

- `analyze_sentiment()` returns `(SentimentLabel, float)` — label is `"positive"/"negative"/"neutral"`
- `calculate_keyword_boost()` sums **all** matched NEGATIVE_KEYWORDS weights (not binary 0/1)
- `enrich_article()` returns new dict with `**article` spread — does NOT mutate input

### scorer.py

- Formula: `score = (negative_ratio * 80.0) + (min(avg_boost / 400.0, 1.0) * 20.0)`
- Final guard: `round(min(100.0, score), 2)` — must remain
- `calculate_country_score()` returns `None` for empty articles list — callers must handle

### country_mapper.py

- `COUNTRY_KEYWORDS` covers exactly 25 countries (check `len(COUNTRY_KEYWORDS) == 25` if countries added/removed)
- `_INDEX` is built at module load — adding keywords at runtime won't update it
- `map_article_to_country()` returns ISO2 with **most keyword matches**, not first match

---

## Backend Correctness Checks

When reviewing `backend/routers/`:

- Latest score subquery uses `func.max(RiskScore.calculated_at)` grouped by `country_id`
- Trend endpoint accepts `days` query param with sensible default (30) — validate range
- News endpoint returns articles ordered by `keyword_boost DESC` for most relevant first
- All endpoints raise `HTTPException(404)` for missing country/score — not 500

---

## Frontend Correctness Checks

When reviewing `frontend/src/`:

- `scoreToLevel()` in `utils.ts` thresholds match backend: 75=CRITICAL, 50=HIGH, 25=MEDIUM
- `RISK_COLORS` uses hex values consistent across WorldMap choropleth, RiskGauge, RiskBadge
- `fetchCountries()` in `api.ts` calls `/api/countries` (no trailing slash issues with axios baseURL)
- `WorldMap` stores `geoJsonLayerRef` and calls `setStyle()` on it when `countries` prop changes — not `map.eachLayer()`

---

## Review Workflow

1. **Scope check** — Identify changed files. Only review those.
2. **Secrets scan** — Any hardcoded credentials? CRITICAL if yes.
3. **Formula invariants** — If `scorer.py` changed: are weights/divisor/guard intact?
4. **SQLAlchemy style** — `select()` only, no `session.query()`
5. **Cache correctness** — TTL present, invalidation on write, Redis failure handled
6. **TypeScript types** — No `any`, response types match backend schemas
7. **Datetime safety** — No `datetime.utcnow()`, always `timezone.utc`
8. **Pipeline imports** — No `from pipeline.X` or `from backend.X` within subdirectory
9. **Leaflet SSR** — Dynamic import only, `"use client"` present
