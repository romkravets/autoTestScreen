import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDERS,
  parseModelString,
  buildTypeDistribution,
  buildPrompt,
} from '../src/generator.js';

// ── parseModelString ──────────────────────────────────────────────────────────

describe('parseModelString', () => {
  test('тільки назва провайдера → бере defaultModel', () => {
    const r = parseModelString('claude');
    assert.strictEqual(r.providerName, 'claude');
    assert.strictEqual(r.modelId, PROVIDERS.claude.defaultModel);
  });

  test('provider:model розбивається правильно', () => {
    const r = parseModelString('groq:mixtral-8x7b-32768');
    assert.strictEqual(r.providerName, 'groq');
    assert.strictEqual(r.modelId, 'mixtral-8x7b-32768');
  });

  test('ollama з назвою моделі', () => {
    const r = parseModelString('ollama:mistral');
    assert.strictEqual(r.providerName, 'ollama');
    assert.strictEqual(r.modelId, 'mistral');
  });

  test('openrouter з довгою назвою моделі', () => {
    const r = parseModelString('openrouter:google/gemma-3-27b-it:free');
    assert.strictEqual(r.providerName, 'openrouter');
    assert.strictEqual(r.modelId, 'google/gemma-3-27b-it:free');
  });

  test('невідомий провайдер кидає Error', () => {
    assert.throws(
      () => parseModelString('unknown-provider'),
      /Unknown provider/
    );
  });

  test('порожній рядок кидає Error', () => {
    assert.throws(() => parseModelString(''), /Unknown provider/);
  });
});

// ── buildTypeDistribution ─────────────────────────────────────────────────────

describe('buildTypeDistribution', () => {
  test('сума завжди дорівнює count', () => {
    for (const count of [10, 15, 20, 22, 25, 30, 50, 100]) {
      const { single, multiple, text } = buildTypeDistribution(count);
      assert.strictEqual(
        single + multiple + text,
        count,
        `count=${count}: ${single}+${multiple}+${text} ≠ ${count}`
      );
    }
  });

  test('single приблизно 50%, multiple ~30%, text ~20%', () => {
    const { single, multiple, text } = buildTypeDistribution(100);
    assert.ok(single >= 45 && single <= 55, `single=${single}`);
    assert.ok(multiple >= 25 && multiple <= 35, `multiple=${multiple}`);
    assert.ok(text >= 10 && text <= 25, `text=${text}`);
  });

  test('всі значення невід\'ємні', () => {
    for (const count of [1, 2, 3, 5]) {
      const d = buildTypeDistribution(count);
      assert.ok(d.single >= 0);
      assert.ok(d.multiple >= 0);
      assert.ok(d.text >= 0);
    }
  });
});

// ── buildPrompt ───────────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  test('містить кількість питань', () => {
    const p = buildPrompt('тест', 22, false);
    assert.ok(p.includes('22'), 'не знайдено "22" у prompt');
  });

  test('для prompt-режиму містить текст завдання', () => {
    const p = buildPrompt('Цикл for у Python', 10, false);
    assert.ok(p.includes('Цикл for у Python'));
  });

  test('для source-режиму містить тему', () => {
    const p = buildPrompt('текст підручника...', 10, true, 'Фізика');
    assert.ok(p.includes('Фізика'));
  });

  test('містить типи питань single/multiple/text', () => {
    const p = buildPrompt('тема', 20, false);
    assert.ok(p.includes('"single"'));
    assert.ok(p.includes('"multiple"'));
    assert.ok(p.includes('"text"'));
  });

  test('містить інструкцію повернути JSON', () => {
    const p = buildPrompt('тема', 10, false);
    assert.ok(p.toLowerCase().includes('json'));
  });

  test('розподіл у prompt відповідає buildTypeDistribution', () => {
    const { single, multiple, text } = buildTypeDistribution(20);
    const p = buildPrompt('тема', 20, false);
    assert.ok(p.includes(String(single)));
    assert.ok(p.includes(String(multiple)));
    assert.ok(p.includes(String(text)));
  });
});

// ── PROVIDERS ─────────────────────────────────────────────────────────────────

describe('PROVIDERS', () => {
  test('всі очікувані провайдери присутні', () => {
    const required = ['claude', 'groq', 'openrouter', 'ollama', 'lmstudio', 'custom'];
    for (const name of required) {
      assert.ok(name in PROVIDERS, `провайдер "${name}" відсутній`);
    }
  });

  test('кожен провайдер має label і defaultModel', () => {
    for (const [name, p] of Object.entries(PROVIDERS)) {
      assert.ok(p.label, `${name}: відсутній label`);
      assert.ok(p.defaultModel, `${name}: відсутній defaultModel`);
    }
  });

  test('ollama та lmstudio мають local:true', () => {
    assert.strictEqual(PROVIDERS.ollama.local, true);
    assert.strictEqual(PROVIDERS.lmstudio.local, true);
  });

  test('groq і openrouter мають free:true', () => {
    assert.strictEqual(PROVIDERS.groq.free, true);
    assert.strictEqual(PROVIDERS.openrouter.free, true);
  });
});
