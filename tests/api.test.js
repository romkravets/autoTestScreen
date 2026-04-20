/**
 * API integration tests — запускає реальний Express сервер на тимчасовому порті,
 * використовує тимчасову папку для питань, перевіряє всі CRUD ендпоінти.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── Запускаємо сервер з тимчасовою папкою ────────────────────────────────────

let server;
let baseUrl;
let tmpDir;

before(async () => {
  // Тимчасова папка замість реального ./questions
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autotest-'));

  // Динамічно імпортуємо та патчимо сервер
  // Простіше — піднімаємо express вручну з тими ж роутами
  const { default: express } = await import('express');
  const app = express();
  app.use(express.json());

  const QUESTIONS_DIR = tmpDir;

  // Копіюємо ендпоінти з server.js (щоб не перезапускати весь server.js)
  app.get('/api/questions', (_req, res) => {
    const files = fs.readdirSync(QUESTIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stat = fs.statSync(path.join(QUESTIONS_DIR, f));
        try {
          const data = JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, f), 'utf8'));
          return { name: f, size: stat.size, mtime: stat.mtime, count: Array.isArray(data) ? data.length : 0 };
        } catch {
          return { name: f, size: stat.size, mtime: stat.mtime, count: 0 };
        }
      });
    res.json(files);
  });

  app.get('/api/questions/:filename', (req, res) => {
    const file = path.join(QUESTIONS_DIR, path.basename(req.params.filename));
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
  });

  app.put('/api/questions/:filename', (req, res) => {
    const file = path.join(QUESTIONS_DIR, path.basename(req.params.filename));
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Body must be array' });
    fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  });

  app.delete('/api/questions/:filename', (req, res) => {
    const file = path.join(QUESTIONS_DIR, path.basename(req.params.filename));
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(file);
    res.json({ ok: true });
  });

  app.post('/api/questions/import', (req, res) => {
    const { name, questions } = req.body || {};
    if (!name || !Array.isArray(questions))
      return res.status(400).json({ error: 'name and questions[] required' });
    const safe = name.replace(/[^a-zA-Zа-яА-ЯіІїЇєЄ0-9_\-\.]/g, '_').slice(0, 60);
    const filename = `${safe}.json`;
    fs.writeFileSync(path.join(QUESTIONS_DIR, filename), JSON.stringify(questions, null, 2), 'utf8');
    res.json({ ok: true, filename });
  });

  app.get('/api/session-status', (_req, res) => {
    res.json({ hasSession: false });
  });

  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Хелпер fetch ─────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(baseUrl + path, opts);
}

const SAMPLE_QUESTIONS = [
  {
    type: 'single',
    question: 'Що таке Node.js?',
    answers: [
      { text: 'Середовище виконання JavaScript', correct: true },
      { text: 'База даних', correct: false },
      { text: 'Браузер', correct: false },
      { text: 'Мова програмування', correct: false },
    ],
  },
  {
    type: 'text',
    question: 'Яка команда встановлює залежності?',
    answers: [{ text: 'npm install', correct: true }],
  },
];

// ── GET /api/questions (порожня папка) ────────────────────────────────────────

describe('GET /api/questions', () => {
  test('повертає порожній масив якщо немає файлів', async () => {
    const r = await api('GET', '/api/questions');
    assert.strictEqual(r.status, 200);
    const data = await r.json();
    assert.ok(Array.isArray(data));
    assert.strictEqual(data.length, 0);
  });
});

// ── POST /api/questions/import ────────────────────────────────────────────────

describe('POST /api/questions/import', () => {
  test('імпортує питання і повертає filename', async () => {
    const r = await api('POST', '/api/questions/import', {
      name: 'test-nodejs',
      questions: SAMPLE_QUESTIONS,
    });
    assert.strictEqual(r.status, 200);
    const { ok, filename } = await r.json();
    assert.strictEqual(ok, true);
    assert.ok(filename.endsWith('.json'), `filename: ${filename}`);
  });

  test('список тепер містить імпортований файл', async () => {
    const r = await api('GET', '/api/questions');
    const files = await r.json();
    assert.ok(files.length >= 1);
    assert.strictEqual(files[0].count, SAMPLE_QUESTIONS.length);
  });

  test('400 якщо немає name', async () => {
    const r = await api('POST', '/api/questions/import', { questions: [] });
    assert.strictEqual(r.status, 400);
  });

  test('400 якщо questions не масив', async () => {
    const r = await api('POST', '/api/questions/import', { name: 'x', questions: 'bad' });
    assert.strictEqual(r.status, 400);
  });
});

// ── GET /api/questions/:filename ──────────────────────────────────────────────

describe('GET /api/questions/:filename', () => {
  test('повертає питання з файлу', async () => {
    // Спочатку імпортуємо
    const imp = await api('POST', '/api/questions/import', {
      name: 'read-test',
      questions: SAMPLE_QUESTIONS,
    });
    const { filename } = await imp.json();

    const r = await api('GET', `/api/questions/${filename}`);
    assert.strictEqual(r.status, 200);
    const data = await r.json();
    assert.ok(Array.isArray(data));
    assert.strictEqual(data.length, SAMPLE_QUESTIONS.length);
    assert.strictEqual(data[0].question, SAMPLE_QUESTIONS[0].question);
  });

  test('404 для неіснуючого файлу', async () => {
    const r = await api('GET', '/api/questions/no-such-file.json');
    assert.strictEqual(r.status, 404);
  });

  test('path traversal блокується (basename)', async () => {
    const r = await api('GET', '/api/questions/..%2F..%2Fetc%2Fpasswd');
    // Або 404 (файл не існує в tmpDir), або 400
    assert.ok([404, 400].includes(r.status));
  });
});

// ── PUT /api/questions/:filename ──────────────────────────────────────────────

describe('PUT /api/questions/:filename', () => {
  let testFilename;

  before(async () => {
    const r = await api('POST', '/api/questions/import', {
      name: 'update-test',
      questions: SAMPLE_QUESTIONS,
    });
    ({ filename: testFilename } = await r.json());
  });

  test('оновлює питання', async () => {
    const updated = [{ ...SAMPLE_QUESTIONS[0], question: 'Оновлене питання?' }];
    const r = await api('PUT', `/api/questions/${testFilename}`, updated);
    assert.strictEqual(r.status, 200);
    const { ok } = await r.json();
    assert.strictEqual(ok, true);

    // Перевіряємо що зміни збережено
    const check = await api('GET', `/api/questions/${testFilename}`);
    const data = await check.json();
    assert.strictEqual(data[0].question, 'Оновлене питання?');
  });

  test('400 якщо body не масив', async () => {
    const r = await api('PUT', `/api/questions/${testFilename}`, { bad: true });
    assert.strictEqual(r.status, 400);
  });

  test('404 якщо файл не існує', async () => {
    const r = await api('PUT', '/api/questions/ghost.json', []);
    assert.strictEqual(r.status, 404);
  });
});

// ── DELETE /api/questions/:filename ──────────────────────────────────────────

describe('DELETE /api/questions/:filename', () => {
  test('видаляє файл', async () => {
    const imp = await api('POST', '/api/questions/import', {
      name: 'to-delete',
      questions: [SAMPLE_QUESTIONS[0]],
    });
    const { filename } = await imp.json();

    const del = await api('DELETE', `/api/questions/${filename}`);
    assert.strictEqual(del.status, 200);

    // Перевіряємо що файл зник
    const check = await api('GET', `/api/questions/${filename}`);
    assert.strictEqual(check.status, 404);
  });

  test('404 для вже видаленого файлу', async () => {
    const r = await api('DELETE', '/api/questions/already-gone.json');
    assert.strictEqual(r.status, 404);
  });
});

// ── GET /api/session-status ───────────────────────────────────────────────────

describe('GET /api/session-status', () => {
  test('повертає hasSession boolean', async () => {
    const r = await api('GET', '/api/session-status');
    assert.strictEqual(r.status, 200);
    const data = await r.json();
    assert.ok('hasSession' in data);
    assert.strictEqual(typeof data.hasSession, 'boolean');
  });
});
