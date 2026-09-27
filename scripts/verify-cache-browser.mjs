import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/terribde/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const errors = [];
const api = [];
try {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().includes('/api/teachers')) api.push({ url: response.url(), status: response.status() });
  });
  await page.goto('http://127.0.0.1:4175', { waitUntil: 'networkidle', timeout: 60000 });
  await page.screenshot({ path: 'temp/cache-deploy/desktop.png', fullPage: true });
  console.log(JSON.stringify({ title: await page.title(), api, errors,
    inputs: await page.locator('input').evaluateAll(nodes => nodes.map(node => ({ placeholder: node.placeholder, type: node.type }))),
    buttons: (await page.getByRole('button').allTextContents()).slice(0, 24),
  }));
  assert.ok(api.some(response => response.status === 200));
  assert.equal(errors.length, 0);
  await page.getByText('赵春明', { exact: true }).first().click();
  const firstReviews = page.waitForResponse(response => response.url().includes('/reviews?') && response.status() === 200);
  await page.getByRole('button', { name: '学生真实评价' }).click();
  const firstPage = await (await firstReviews).json();
  assert.equal(firstPage.data.total, 120);
  assert.equal(firstPage.data.items.length, 20);
  const nextReviews = page.waitForResponse(response => response.url().includes('/reviews?page=1') && response.status() === 200);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  const nextPage = await (await nextReviews).json();
  assert.equal(nextPage.data.items.length, 20);
  assert.ok(nextPage.data.items.every(row => !firstPage.data.items.some(first => first.id === row.id)));
  await page.screenshot({ path: 'temp/cache-deploy/reviews.png', fullPage: true });
  console.log('Historical review modal and next-page cache requests passed');
  await context.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto('http://127.0.0.1:4175', { waitUntil: 'networkidle', timeout: 60000 });
  await mobilePage.screenshot({ path: 'temp/cache-deploy/mobile.png', fullPage: true });
  assert.ok(await mobilePage.locator('body').innerText());
  await fs.writeFile('temp/cache-deploy/browser-verification.json', JSON.stringify({ api, errors }, null, 2));
  await mobile.close();
} finally { await browser.close(); }
