import { createAuthContext } from './auth.js';
import { humanWait, randomDelay, typeInProseMirror } from './utils.js';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://vseosvita.ua';

// Keywords in the type-picker buttons at the bottom of the question editor
const Q_TYPE_TEXT = {
  single: 'однією правильною',
  multiple: 'кількома правильними',
  text: 'полем для вводу',
};

// ── Debug helpers ─────────────────────────────────────────────────────────────

async function screenshot(page, name) {
  const dir = './debug';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const file = path.join(dir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`Screenshot saved: ${file}`);
}

// ── Page-state detection ──────────────────────────────────────────────────────

// Returns 'designer' | 'metadata' | 'unknown'
async function detectPageState(page) {
  // Designer page has the question type-picker at the bottom
  const hasDesigner = await page.locator('#vr-add-quest').isVisible({ timeout: 2000 }).catch(() => false);
  if (hasDesigner) return 'designer';

  // Metadata page (new test creation form) has a subject / topic select
  const hasMeta = await page
    .locator('select, input[name*="title"], input[placeholder*="назв"]')
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (hasMeta) return 'metadata';

  return 'unknown';
}

// ── Navigate to the question-editor section ────────────────────────────────────

async function ensureDesignerReady(page) {
  const state = await detectPageState(page);
  console.log(`Page state: ${state}`);

  if (state === 'designer') return;

  if (state === 'metadata') {
    console.log('Metadata page detected — waiting for manual navigation.');
    console.log('Please fill in the test metadata (name, subject, etc.) and click "Save" / "Next".');
    console.log('Press Enter when you reach the question editor...');
    await new Promise((resolve) => process.stdin.once('data', resolve));
    await humanWait(1000, 2000);
    return;
  }

  // Unknown state — take screenshot and pause
  await screenshot(page, 'unknown-state');
  console.log('Unknown page state. Screenshot saved to ./debug/');
  console.log('Please navigate to the question editor manually, then press Enter...');
  await new Promise((resolve) => process.stdin.once('data', resolve));
  await humanWait(1000, 2000);
}

// ── Question block creation ───────────────────────────────────────────────────

async function scrollToAddSection(page) {
  // The correct button: <a onclick="vo.scrollToNoAnimate('#vr-add-quest', true)" class="btn-create_question-test ...">
  // Use onclick attribute to avoid accidentally clicking "Додати варіант" (test variant button)
  const topBtn = page.locator('a[onclick*="vr-add-quest"]').first();
  const topBtnVisible = await topBtn.isVisible({ timeout: 2000 }).catch(() => false);

  if (topBtnVisible) {
    await topBtn.click();
    await humanWait(800, 1200);
  } else {
    // Fallback: JS scroll
    await page.evaluate(() => {
      const el = document.getElementById('vr-add-quest');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else window.scrollTo(0, document.body.scrollHeight);
    });
    await humanWait(800, 1200);
  }
}

async function addQuestionBlock(page, type) {
  await scrollToAddSection(page);

  // Wait for the type-picker section
  const addSection = page.locator('#vr-add-quest');
  try {
    await addSection.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    await screenshot(page, 'vr-add-quest-not-found');
    throw new Error(
      '#vr-add-quest not found. Screenshot saved to ./debug/\n' +
        'Make sure you are on the question editor page (not the metadata creation form).'
    );
  }

  await humanWait(300, 600);

  // Find and click the type button
  const keyword = Q_TYPE_TEXT[type];
  const btn = addSection.getByText(keyword, { exact: false }).first();
  try {
    await btn.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    // Log what buttons ARE available
    const available = await addSection.locator('a, button').allTextContents();
    console.error(`Button for type "${type}" (keyword: "${keyword}") not found.`);
    console.error('Available buttons:', available);
    await screenshot(page, `btn-not-found-${type}`);
    throw new Error(`Cannot find question type button: "${keyword}"`);
  }

  const blocksBefore = await page.locator('.test-block').count();
  await btn.click();
  await humanWait(800, 1500);

  // Wait for a new block to appear
  await page.waitForFunction(
    (before) => document.querySelectorAll('.test-block').length > before,
    blocksBefore,
    { timeout: 8000 }
  );

  const blocks = page.locator('.test-block');
  const count = await blocks.count();
  return blocks.nth(count - 1);
}

// ── Fill question helpers ─────────────────────────────────────────────────────

async function fillSingleOrMultiple(page, block, question) {
  const isMultiple = question.type === 'multiple';
  const answers = question.answers;

  const addVariantBtn = block.locator('.v-tests-page-answers button');
  let existingSlots = await block.locator('.i-item').count();

  // Add extra answer slots if needed
  while (existingSlots < answers.length) {
    await addVariantBtn.click();
    await humanWait(300, 600);
    existingSlots = await block.locator('.i-item').count();
  }

  // Type answer text
  const items = block.locator('.i-item');
  for (let i = 0; i < answers.length; i++) {
    const editor = items.nth(i).locator('.ProseMirror');
    await typeInProseMirror(page, editor, answers[i].text);
    await humanWait(300, 700);
  }

  // Mark correct — scope to .i-item to avoid the "Встановити бали" checkbox
  const items2 = block.locator('.i-item');
  if (isMultiple) {
    for (let i = 0; i < answers.length; i++) {
      if (answers[i].correct) {
        const cb = items2.nth(i).locator('input[type="checkbox"]');
        await cb.scrollIntoViewIfNeeded();
        await cb.click();
        await humanWait(200, 400);
      }
    }
  } else {
    const correctIdx = answers.findIndex((a) => a.correct);
    if (correctIdx >= 0) {
      const rb = items2.nth(correctIdx).locator('input[type="radio"]');
      await rb.scrollIntoViewIfNeeded();
      await rb.click();
      await humanWait(200, 400);
    }
  }
}

async function fillTextQuestion(page, block, question) {
  const correctAnswers = question.answers
    .filter((a) => a.correct)
    .map((a) => a.text);

  // "З полем для вводу" uses plain <input type="text"> for each correct answer,
  // not a ProseMirror editor. Wait for the block to fully render first.
  await humanWait(500, 800);

  // Each correct answer gets its own input field
  for (let i = 0; i < correctAnswers.length; i++) {
    // Try to find an existing empty input
    const inputs = block.locator('input[type="text"]:not([disabled])');
    const inputCount = await inputs.count();

    // If we need more fields than exist, click "Додати варіант" inside the block
    if (i >= inputCount) {
      const addBtn = block.locator('button').filter({ hasText: /додати/i }).first();
      const addBtnExists = await addBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (addBtnExists) {
        await addBtn.click();
        await humanWait(300, 500);
      }
    }

    const input = block.locator('input[type="text"]:not([disabled])').nth(i);
    const inputVisible = await input.isVisible({ timeout: 3000 }).catch(() => false);
    if (inputVisible) {
      await input.scrollIntoViewIfNeeded();
      await input.click();
      await humanWait(150, 300);
      await input.fill(correctAnswers[i]);
      await humanWait(200, 400);
    } else {
      console.warn(`  Answer input #${i} not found, skipping`);
    }
  }
}

async function fillQuestion(page, block, question) {
  // Fill question text
  const questionEditor = block.locator('.ProseMirror').first();
  await typeInProseMirror(page, questionEditor, question.question);
  await humanWait(500, 1000);

  if (question.type === 'single' || question.type === 'multiple') {
    await fillSingleOrMultiple(page, block, question);
  } else if (question.type === 'text') {
    await fillTextQuestion(page, block, question);
  }

  // Save the question block
  await humanWait(500, 1000);
  const saveBtn = block.locator('button.vo-btn-green');
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();
  await humanWait(1000, 2000);
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function createTest(title, questions, options = {}) {
  const { headless = false, testUrl = null } = options;
  const { browser, context } = await createAuthContext(headless);
  const page = await context.newPage();

  try {
    const url = testUrl || `${BASE_URL}/test/designer`;
    console.log(`Opening: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanWait(2000, 3000);

    // Make sure we are on the question editor (not the metadata form)
    await ensureDesignerReady(page);

    // Process each question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      console.log(`[${i + 1}/${questions.length}] type=${q.type} — ${q.question.slice(0, 60)}...`);

      try {
        const block = await addQuestionBlock(page, q.type);
        await fillQuestion(page, block, q);
      } catch (err) {
        console.error(`Error on question ${i + 1}:`, err.message);
        await screenshot(page, `error-q${i + 1}`);
        console.log('Skipping this question. Press Enter to continue...');
        await new Promise((resolve) => process.stdin.once('data', resolve));
      }

      // Anti-bot pause every 5 questions
      if ((i + 1) % 5 === 0 && i + 1 < questions.length) {
        console.log('Pausing 5s...');
        await humanWait(4000, 7000);
      }
    }

    console.log('\nAll questions processed. Review in browser and publish manually.');
    console.log('Press Enter to close browser...');
    await new Promise((resolve) => process.stdin.once('data', resolve));
  } finally {
    await browser.close();
  }
}
