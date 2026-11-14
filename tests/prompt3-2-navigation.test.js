const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const rootDir = path.resolve(__dirname, '..');

function generateMockTrends(hasRolling = true) {
  const buckets = [];
  const start = new Date('2026-08-01');
  for (let i = 0; i < 90; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split('T')[0];
    const exp = 500 + Math.sin(i / 5) * 300;
    const roll = hasRolling ? (550 + Math.sin(i / 5) * 200) : 0;
    buckets.push({
      key,
      start: key,
      end: key,
      expenses_amount: exp.toFixed(2),
      rolling_average_expense: roll.toFixed(2)
    });
  }
  return {
    success: true,
    data: {
      from: '2026-08-01',
      to: '2026-10-29',
      granularity: 'day',
      summary: {
        has_data: true,
        expenses_amount: 54000,
        average_per_bucket: 600,
        bucket_count: 90,
        anomaly_count: 2
      },
      buckets,
      categories: [
        { category_id: 1, category_name: 'Food & Dining', amount: 20000, previous_amount: 18000, change_percent: 11.1, share_percent: 37, transaction_count: 45 }
      ],
      anomalies: [
        { expense_date: '2026-08-15', description: 'Weekend Getaway', category_id: 1, category_name: 'Food & Dining', amount: 2400 }
      ],
      largest_expenses: [
        { expense_date: '2026-08-15', description: 'Weekend Getaway', category_id: 1, category_name: 'Food & Dining', amount: 2400 }
      ]
    }
  };
}

test('Prompt 3.2: Spending Trends navigation away and return resize test', async () => {
  const port = 8094;
  const mockData = generateMockTrends(true);
  const server = http.createServer((req, res) => {
    let pathname = req.url.split('?')[0];
    if (pathname === '/sanctum/csrf-cookie') {
      res.setHeader('Set-Cookie', 'XSRF-TOKEN=test; Path=/');
      res.writeHead(204);
      return res.end();
    }
    if (pathname === '/api/user') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { user: { id: 1, name: 'Test User' } } }));
    }
    if (pathname === '/api/analytics/spending-trends') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(mockData));
    }
    let filePath = path.join(rootDir, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end(); }
    let content = fs.readFileSync(filePath, 'utf8');
    if (filePath.endsWith('.html')) {
      content = content.split('http://127.0.0.1:8002').join(`http://localhost:${port}`);
    }
    res.writeHead(200);
    res.end(content);
  });

  await new Promise(r => server.listen(port, r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Visit Spending Trends
  await page.goto(`http://localhost:${port}/spending-trends/spending-trends.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.trends-bar-slot');

  let wrapInitial = await page.$eval('#trends-chart-canvas-wrap', el => el.clientWidth);
  assert.ok(wrapInitial > 800, 'Initial wrap client width is wide desktop');

  // 2. Navigate away to another page (e.g. Dashboard or Settings)
  await page.goto(`http://localhost:${port}/dashboard/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  // 3. Return to Spending Trends
  await page.goto(`http://localhost:${port}/spending-trends/spending-trends.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.trends-bar-slot');

  // 4. Trigger resize to tablet 768px
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(300); // Debounce delay

  let wrapResized = await page.$eval('#trends-chart-canvas-wrap', el => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    hasOverflow: el.scrollWidth > el.clientWidth
  }));

  assert.equal(wrapResized.hasOverflow, false, 'No horizontal overflow after navigating away, returning, and resizing');
  assert.ok(wrapResized.clientWidth <= 768, 'Wrap adjusted client width to tablet');

  await browser.close();
  server.close();
});
