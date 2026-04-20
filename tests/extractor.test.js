import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectSourceType } from '../src/extractor.js';

describe('detectSourceType', () => {
  test('http URL → "url"', () => {
    assert.strictEqual(detectSourceType('http://example.com/page'), 'url');
  });

  test('https URL → "url"', () => {
    assert.strictEqual(detectSourceType('https://vseosvita.ua/article'), 'url');
  });

  test('.pdf файл → "pdf"', () => {
    assert.strictEqual(detectSourceType('./docs/підручник.pdf'), 'pdf');
  });

  test('.PDF великими літерами → "pdf"', () => {
    assert.strictEqual(detectSourceType('/home/user/FILE.PDF'), 'pdf');
  });

  test('.docx файл → "docx"', () => {
    assert.strictEqual(detectSourceType('./матеріал.docx'), 'docx');
  });

  test('.DOCX великими літерами → "docx"', () => {
    assert.strictEqual(detectSourceType('C:/docs/FILE.DOCX'), 'docx');
  });

  test('невідомий тип кидає Error', () => {
    assert.throws(() => detectSourceType('./file.txt'), /Unknown source type/);
    assert.throws(() => detectSourceType('./image.png'), /Unknown source type/);
    assert.throws(() => detectSourceType('not-a-url-or-path'), /Unknown source type/);
  });
});
