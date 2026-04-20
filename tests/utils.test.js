import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomDelay, humanWait } from '../src/utils.js';

describe('randomDelay', () => {
  test('повертає число в межах [min, max]', () => {
    for (let i = 0; i < 200; i++) {
      const d = randomDelay(10, 50);
      assert.ok(d >= 10 && d <= 50, `очікували [10,50], отримали ${d}`);
    }
  });

  test('повертає ціле число', () => {
    for (let i = 0; i < 50; i++) {
      const d = randomDelay(0, 1000);
      assert.strictEqual(d, Math.floor(d));
    }
  });

  test('min === max повертає точно min', () => {
    assert.strictEqual(randomDelay(42, 42), 42);
  });
});

describe('humanWait', () => {
  test('resolve після очікуваної затримки', async () => {
    const start = Date.now();
    await humanWait(50, 80);
    const elapsed = Date.now() - start;
    // допускаємо 20ms похибки таймера
    assert.ok(elapsed >= 30, `занадто швидко: ${elapsed}ms`);
    assert.ok(elapsed < 300, `занадто довго: ${elapsed}ms`);
  });

  test('повертає Promise', () => {
    const result = humanWait(1, 5);
    assert.ok(result instanceof Promise);
    return result;
  });
});
