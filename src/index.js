import 'dotenv/config';
import { program } from 'commander';
import { saveSession } from './auth.js';
import { extractContent } from './extractor.js';
import { generateQuestions, generateFromPrompt } from './generator.js';
import { createTest } from './automator.js';
import fs from 'fs';

// ── login ──────────────────────────────────────────────────────────────────────
program
  .command('login')
  .description('Open browser to log in via Google and save session')
  .action(async () => {
    await saveSession();
    process.exit(0);
  });

// ── shared helper: generate & save questions ──────────────────────────────────
async function buildQuestions(opts, count) {
  if (!fs.existsSync('./questions')) fs.mkdirSync('./questions');

  if (opts.loadQuestions) {
    console.log(`Loading questions from ${opts.loadQuestions}...`);
    return JSON.parse(fs.readFileSync(opts.loadQuestions, 'utf8'));
  }

  const modelStr = opts.model || process.env.DEFAULT_MODEL || 'claude';

  let questions;
  if (opts.prompt) {
    console.log(`Prompt: "${opts.prompt}"`);
    questions = await generateFromPrompt(opts.prompt, count, modelStr);
  } else {
    const content = await extractContent(opts.source);
    console.log(`Extracted ${content.length} characters from source.`);
    questions = await generateQuestions(content, count, opts.title, modelStr);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const safeTitle = opts.title.replace(/[^a-zA-Zа-яА-ЯіІїЇєЄ0-9]/g, '_').slice(0, 40);
  const autoFile = opts.saveQuestions || `./questions/${ts}_${safeTitle}.json`;
  fs.writeFileSync(autoFile, JSON.stringify(questions, null, 2), 'utf8');
  console.log(`Questions saved → ${autoFile}`);

  return questions;
}

function validateOpts(opts) {
  if (!opts.source && !opts.prompt && !opts.loadQuestions) {
    console.error('Provide --source, --prompt, or --load-questions');
    process.exit(1);
  }
}

// ── generate — тільки JSON, без браузера ─────────────────────────────────────
program
  .command('generate')
  .description('Generate questions and save to JSON (no browser)')
  .option('-s, --source <path_or_url>', 'Source: URL, path to PDF or DOCX')
  .option('-p, --prompt <text>', 'Free-text prompt (no source needed)')
  .requiredOption('-t, --title <title>', 'Test title (used in filename)')
  .option('-c, --count <number>', 'Number of questions', String(process.env.DEFAULT_QUESTION_COUNT || '22'))
  .option('-m, --model <model>', 'Model to use, e.g. claude, groq, ollama:llama3.2 (default: claude)')
  .option('--save-questions <file>', 'Override output file path')
  .action(async (opts) => {
    validateOpts(opts);
    const count = parseInt(opts.count, 10);
    if (isNaN(count) || count < 1) { console.error('Invalid --count'); process.exit(1); }

    const questions = await buildQuestions(opts, count);

    console.log(`\nDone. ${questions.length} questions:`);
    console.log({
      single: questions.filter((q) => q.type === 'single').length,
      multiple: questions.filter((q) => q.type === 'multiple').length,
      text: questions.filter((q) => q.type === 'text').length,
    });
    process.exit(0);
  });

// ── create — генерація + заповнення на сайті ─────────────────────────────────
program
  .command('create')
  .description('Generate questions and fill them on vseosvita.ua')
  .option('-s, --source <path_or_url>', 'Source: URL, path to PDF or DOCX')
  .option('-p, --prompt <text>', 'Free-text prompt (no source needed)')
  .requiredOption('-t, --title <title>', 'Test title')
  .option('-c, --count <number>', 'Number of questions', String(process.env.DEFAULT_QUESTION_COUNT || '22'))
  .option('-m, --model <model>', 'Model to use, e.g. claude, groq, ollama:llama3.2 (default: claude)')
  .option('--headless', 'Run browser in headless mode', false)
  .option('--save-questions <file>', 'Override output file path')
  .option('--load-questions <file>', 'Load questions from JSON (skip generation)')
  .option('--url <url>', 'Direct URL to existing test in designer')
  .action(async (opts) => {
    validateOpts(opts);
    const count = parseInt(opts.count, 10);
    if (isNaN(count) || count < 1) { console.error('Invalid --count'); process.exit(1); }

    const questions = await buildQuestions(opts, count);

    console.log(`\nReady to fill ${questions.length} questions into "${opts.title}"`);
    console.log({
      single: questions.filter((q) => q.type === 'single').length,
      multiple: questions.filter((q) => q.type === 'multiple').length,
      text: questions.filter((q) => q.type === 'text').length,
    });
    console.log('\nPress Enter to open browser (Ctrl+C to cancel)...');
    await new Promise((resolve) => process.stdin.once('data', resolve));

    await createTest(opts.title, questions, {
      headless: opts.headless,
      testUrl: opts.url || null,
    });

    process.exit(0);
  });

program.parse();
