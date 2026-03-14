import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const OUT = 'screenshots';

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function shot(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  if (fn) await fn(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
  console.log(`  ${name}.png`);
}

console.log('Taking screenshots...');

await shot('gallery-dark', null);

await shot('gallery-light', async (page) => {
  await page.click('#theme-toggle');
  await page.waitForTimeout(300);
});

await shot('search', async (page) => {
  await page.fill('.search-input', 'laugh');
  await page.waitForTimeout(500);
});

await shot('hover-actions', async (page) => {
  await page.hover('gif-card:nth-child(3) .card');
  await page.waitForTimeout(300);
});

await shot('lightbox', async (page) => {
  await page.click('gif-card:nth-child(3) .card');
  await page.waitForTimeout(500);
});

await shot('command-palette', async (page) => {
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(500);
});

await browser.close();
console.log('Done.');
