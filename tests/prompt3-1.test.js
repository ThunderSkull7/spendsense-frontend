const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');

const rootDir = path.resolve(__dirname, '..');

// Synthetic 90-day dataset generator
function generate90DayData() {
  const buckets = [];
  const start = new Date('2026-08-01');
  for (let i = 0; i < 90; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split('T')[0];
    const exp = 500 + Math.sin(i / 5) * 300 + (i % 7 === 0 ? 1200 : 0);
    const roll = 550 + Math.sin(i / 5) * 200;
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
        { category_id: 1, category_name: 'Food & Dining', amount: 20000, previous_amount: 18000, change_percent: 11.1, share_percent: 37, transaction_count: 45 },
        { category_id: 2, category_name: 'Shopping', amount: 15000, previous_amount: 12000, change_percent: 25.0, share_percent: 27, transaction_count: 20 }
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

function createServer(port) {
  const mockData = generate90DayData();
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
  return server;
}

test('Prompt 3.1: Spending trajectory layout, stride, bar preservation, and no internal overflow across 8 viewports', async () => {
  const port = 8097;
  const server = createServer(port);
  await new Promise(r => server.listen(port, r));

  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: '1920', width: 1920, height: 1080 },
    { name: '1440', width: 1440, height: 900 },
    { name: '1280', width: 1280, height: 800 },
    { name: '1024', width: 1024, height: 768 },
    { name: '768', width: 768, height: 1024 },
    { name: '390', width: 390, height: 844 },
    { name: '375', width: 375, height: 812 },
    { name: '320', width: 320, height: 568 }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`http://localhost:${port}/spending-trends/spending-trends.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.trends-bar-slot');

    // 1. Verify 90 bars rendered (bar count preservation)
    const barCount = await page.$$eval('.trends-bar-slot', els => els.length);
    assert.equal(barCount, 90, `Viewport ${vp.name} must preserve all 90 daily bars`);

    // 2. Verify width-based date label stride thinning
    const labelData = await page.$$eval('.trends-bar-label', els => els.map(el => el.textContent.trim()));
    const visibleLabels = labelData.filter(t => t.length > 0 && t !== '');
    assert.ok(visibleLabels.length < 90, `Viewport ${vp.name} must thin labels (found ${visibleLabels.length} visible)`);

    // Verify visible labels do not visually overlap
    const visibleBoxes = await page.$$eval('.trends-bar-label', els => {
      return els
        .filter(el => el.textContent.trim().length > 0)
        .map(el => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, text: el.textContent.trim() };
        });
    });

    for (let i = 0; i < visibleBoxes.length - 1; i++) {
      const b1 = visibleBoxes[i];
      const b2 = visibleBoxes[i + 1];
      assert.ok(b1.right <= b2.left + 1, `Viewport ${vp.name} labels must not overlap: ${b1.text} [${b1.left}, ${b1.right}] vs ${b2.text} [${b2.left}, ${b2.right}]`);
    }

    // 3. Verify no internal card scrollable overflow on the trajectory card
    const overflowStatus = await page.$eval('#trends-chart-canvas-wrap', el => {
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        hasHorizontalOverflow: el.scrollWidth > el.clientWidth
      };
    });
    assert.equal(overflowStatus.hasHorizontalOverflow, false, `Viewport ${vp.name} must have no internal scrollable overflow (scrollWidth: ${overflowStatus.scrollWidth}, clientWidth: ${overflowStatus.clientWidth})`);

    // 4. Verify tooltip contents on bar slot
    const tooltip = await page.$eval('.trends-bar-slot', el => el.getAttribute('title'));
    assert.match(tooltip, /Interval:/, 'Tooltip must contain interval');
    assert.match(tooltip, /Actual Expenses:/, 'Tooltip must contain Actual Expenses');
    assert.match(tooltip, /Rolling Average:/, 'Tooltip must contain Rolling Average');

    await page.close();
  }

  await browser.close();
  server.close();
});
