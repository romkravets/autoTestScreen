// Human-like random delay between min and max ms
export function randomDelay(min = 40, max = 120) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Wait for a random amount of ms
export function humanWait(min = 500, max = 1500) {
  const ms = randomDelay(min, max);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Type text into a ProseMirror contenteditable div
export async function typeInProseMirror(page, locator, text) {
  await locator.click();
  await humanWait(200, 400);
  // Select all existing content first and replace
  await page.keyboard.press('Control+a');
  await humanWait(100, 200);
  await page.keyboard.type(text, { delay: randomDelay(30, 80) });
}
