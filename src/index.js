import 'dotenv/config';
import { program } from 'commander';
import { saveSession } from './auth.js';
import { extractContent } from './extractor.js';
import { generateQuestions } from './generator.js';
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

// ── create ─────────────────────────────────────────────────────────────────────
program
  .command('create')
  .description('Generate and fill a test on vseosvita.ua')
  .requiredOption('-s, --source <path_or_url>', 'Source: URL, path to PDF or DOCX')
  .requiredOption('-t, --title <title>', 'Test title')
  .option('-c, --count <number>', 'Number of questions', String(process.env.DEFAULT_QUESTION_COUNT || '22'))
  .option('--headless', 'Run browser in headless mode', false)
  .option('--save-questions <file>', 'Save generated questions JSON to file')
  .option('--load-questions <file>', 'Load questions from JSON file (skip generation)')
  .option('--url <url>', 'Direct URL to test designer (if editing existing test)')
  .action(async (opts) => {
    const count = parseInt(opts.count, 10);
    if (isNaN(count) || count < 1) {
      console.error('Invalid --count value');
      process.exit(1);
    }

    if (!fs.existsSync('./questions')) fs.mkdirSync('./questions');

    let questions;

    if (opts.loadQuestions) {
      console.log(`Loading questions from ${opts.loadQuestions}...`);
      questions = JSON.parse(fs.readFileSync(opts.loadQuestions, 'utf8'));
    } else {
      // Extract content from source
      const content = await extractContent(opts.source);
      console.log(`Extracted ${content.length} characters from source.`);

      // Generate questions
      questions = await generateQuestions(content, count, opts.title);

      // Always auto-save JSON before touching the browser
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const safeTitle = opts.title.replace(/[^a-zA-Zа-яА-ЯіІїЇєЄ0-9]/g, '_').slice(0, 40);
      const autoFile = opts.saveQuestions || `./questions/${ts}_${safeTitle}.json`;
      fs.writeFileSync(autoFile, JSON.stringify(questions, null, 2), 'utf8');
      console.log(`Questions saved to ${autoFile}`);
    }

    console.log(`\nReady to fill ${questions.length} questions into "${opts.title}"`);
    console.log('Types:', {
      single: questions.filter((q) => q.type === 'single').length,
      multiple: questions.filter((q) => q.type === 'multiple').length,
      text: questions.filter((q) => q.type === 'text').length,
    });
    console.log('Press Enter to start browser automation (or Ctrl+C to cancel)...');
    await new Promise((resolve) => process.stdin.once('data', resolve));

    await createTest(opts.title, questions, {
      headless: opts.headless,
      testUrl: opts.url || null,
    });

    process.exit(0);
  });

program.parse();
