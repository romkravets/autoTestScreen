import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SESSION_DIR = './sessions';
const SESSION_FILE = path.join(SESSION_DIR, 'vseosvita.json');

export function sessionExists() {
  return fs.existsSync(SESSION_FILE);
}

// Open browser for manual Google login, then save session
export async function saveSession() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  console.log('Opening browser. Please log in with Google on vseosvita.ua...');
  console.log('After login, press Enter in terminal to save session.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://vseosvita.ua/login');

  // Wait for user to login manually
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
    console.log('Press Enter after you have logged in...');
  });

  await context.storageState({ path: SESSION_FILE });
  await browser.close();

  console.log(`Session saved to ${SESSION_FILE}`);
}

// Create browser context with saved session
export async function createAuthContext(headless = false) {
  if (!sessionExists()) {
    throw new Error('No session found. Run: node src/index.js login');
  }

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    storageState: SESSION_FILE,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  return { browser, context };
}
