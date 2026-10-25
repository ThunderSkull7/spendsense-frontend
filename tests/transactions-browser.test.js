const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const EXPENSE_CATEGORIES = [
  { id: 11, name: 'Food', type: 'expense' },
  { id: 12, name: 'Transport', type: 'expense' },
  { id: 13, name: 'Other', type: 'expense' }
];

const EXPENSES = [
  { id: 1, amount: 12.5, description: 'Fuel at Puma', category_id: 12, category: EXPENSE_CATEGORIES[1], expense_date: '2026-03-05' },
  { id: 2, amount: 30.0, description: 'Groceries', category_id: 11, category: EXPENSE_CATEGORIES[0], expense_date: '2026-03-06' },
  { id: 3, amount: 200.0, description: 'Rent', category_id: 13, category: EXPENSE_CATEGORIES[2], expense_date: '2026-03-20' },
  { id: 4, amount: 45.2, description: 'bus pass', category_id: 12, category: EXPENSE_CATEGORIES[1], expense_date: '2026-03-28' },
  { id: 5, amount: 18.0, description: 'Coffee beans', category_id: 11, category: EXPENSE_CATEGORIES[0], expense_date: '2026-04-02' },
  { id: 6, amount: 65.75, description: 'Pharmacy', category_id: 13, category: EXPENSE_CATEGORIES[2], expense_date: '2026-04-04' },
  { id: 7, amount: 22.1, description: 'Water refills', category_id: 11, category: EXPENSE_CATEGORIES[0], expense_date: '2026-04-05' },
  { id: 8, amount: 14.4, description: 'Taxi', category_id: 12, category: EXPENSE_CATEGORIES[1], expense_date: '2026-04-06' },
  { id: 9, amount: 88.0, description: 'Mobile plan', category_id: 13, category: EXPENSE_CATEGORIES[2], expense_date: '2026-04-07' },
  { id: 10, amount: 54.3, description: 'Movie tickets', category_id: 12, category: EXPENSE_CATEGORIES[1], expense_date: '2026-04-08' },
  { id: 11, amount: 92.0, description: 'Hairy meal', category_id: 11, category: EXPENSE_CATEGORIES[0], expense_date: '2026-04-09' },
  { id: 12, amount: 40.0, description: 'Gift', category_id: 13, category: EXPENSE_CATEGORIES[2], expense_date: '2026-04-10' },
  { id: 13, amount: 70.5, description: 'Repair', category_id: 12, category: EXPENSE_CATEGORIES[1], expense_date: '2026-04-11' },
  { id: 14, amount: 25.0, description: 'Salad', category_id: 11, category: EXPENSE_CATEGORIES[0], expense_date: '2026-04-12' },
  { id: 15, amount: 150.0, description: 'Course', category_id: 13, category: EXPENSE_CATEGORIES[2], expense_date: '2026-04-13' },
  { id: 16, amount: 36.0, description: 'Snacks', category_id: 11, category: EXPENSE_CATEGORIES[0], expense_date: '2026-04-14' },
  { id: 17, amount: 58.8, description: 'Fuel at Caltex', category_id: 12, category: EXPENSE_CATEGORIES[1], expense_date: '2026-04-15' },
  { id: 18, amount: 47.6, description: 'Grocery top-up', category_id: 12, category: EXPENSE_CATEGORIES[1], expense_date: '2026-04-16' },
  { id: 19, amount: 110.0, description: 'Bus card refills', category_id: 12, category: EXPENSE_CATEGORIES[1], expense_date: '2026-04-17' },
  { id: 20, amount: 95.25, description: 'Gym', category_id: 12, category: EXPENSE_CATEGORIES[1], expense_date: '2026-04-18' }
];

const INCOMES = [
  { id: 21, amount: 900.0, source: 'Salary', income_date: '2026-03-01', frequency: 'monthly', notes: 'March pay' },
  { id: 22, amount: 180.0, source: 'Freelance', income_date: '2026-03-12', frequency: 'one-time', notes: '' },
  { id: 23, amount: 240.5, source: 'Rental', income_date: '2026-04-03', frequency: 'monthly', notes: 'unit 4' }
];

function paginate(items, page, perPage = 4) {
  const start = (page - 1) * perPage;
  const data = items.slice(start, start + perPage);
  return {
    success: true,
    data: {
      data,
      current_page: page,
      last_page: Math.max(1, Math.ceil(items.length / perPage)),
      per_page: perPage,
      total: items.length
    }
  };
}

function createServer(rootDir) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    if (pathname === '/api/categories') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: [...EXPENSE_CATEGORIES, { id: 99, name: 'Salary', type: 'income' }] }));
      return;
    }
    if (pathname === '/api/expenses') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(paginate(EXPENSES, Number(url.searchParams.get('page') || '1'))));
      return;
    }
    if (pathname === '/api/incomes') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(paginate(INCOMES, Number(url.searchParams.get('page') || '1'))));
      return;
    }

    const filePath = path.join(rootDir, pathname.slice(1));
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html' || ext === '.js') {
      // Point the normal application API host at this test server so browser
      // pages resolve as they do against the local backend.
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace(/127\.0\.0\.1:8002/g, req.headers.host || '127.0.0.1');
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] });
      res.end(content);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

test('explore and filter history pages with search, date range, sort, and load-more', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome executable not found; skipping browser test');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const server = createServer(rootDir);
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  const devTools = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 10000);
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        cdpPort = Number(match[1]);
        clearTimeout(timer);
        resolve(cdpPort);
      }
    });
  });

  let ws = null;
  let msgId = 1;
  const callbacks = new Map();
  try {
    await devTools;
    const tabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(`http://127.0.0.1:${port}/expense-management/expenses.html`), { method: 'PUT' });
    const tab = await tabRes.json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };
    const send = (method, params = {}) => new Promise((resolve) => {
      const id = msgId++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const response = await send('Runtime.evaluate', {
        expression: `(() => { try { ${expression} } catch (err) { return { error: err.message }; } })()`,
        returnByValue: true
      });
      const value = response.result && response.result.result ? response.result.result.value : null;
      if (value && value.error) throw new Error(value.error);
      return value;
    };

    await send('Page.enable');
    await send('Runtime.enable');

    // Wait until the first page of data has been resolved to rows.
    let loaded = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      loaded = await evaluate(`return document.querySelectorAll('[data-expense-rows] tr').length`);
      if (loaded) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(loaded > 0, 'expenses should load rows');
    assert.ok(await evaluate(`return !document.querySelector('[data-expense-table-wrap]').hidden`), 'table should be visible after load');
    assert.match(await evaluate(`return document.querySelector('[data-list-summary]').textContent`), /15 of 20 expenses/);

    // Search respects case-insensitive matching across description fields.
    await evaluate(`const q=document.querySelector('[data-expense-search]'); q.value='fuel'; q.dispatchEvent(new Event('input',{bubbles:true}));`);
    const searchRows = await evaluate(`return document.querySelectorAll('[data-expense-rows] tr').length`);
    assert.equal(searchRows, 2);

    // Clear filters restores rows.
    await evaluate(`document.querySelector('[data-clear-filters]').click();`);
    const afterClearRows = await evaluate(`return document.querySelectorAll('[data-expense-rows] tr').length`);
    assert.ok(afterClearRows > 1);

    // Sorting by amount toggles direction deterministically.
    await evaluate(`document.querySelector('button[data-sort-field="amount"]').click();`);
    const amountOrder = await evaluate(`return Array.from(document.querySelectorAll('[data-expense-rows] tr')).map(r=>r.querySelector('td.num').textContent)`);
    assert.equal(amountOrder.every((text,idx,arr)=>idx===0||Number(arr[idx-1].replace(/[^\d.]/g,''))>=Number(text.replace(/[^\d.]/g,''))), true, 'amount order should be descending after click');
    await evaluate(`document.querySelector('button[data-sort-field="amount"]').click();`);
    const amountOrderAsc = await evaluate(`return Array.from(document.querySelectorAll('[data-expense-rows] tr')).map(r=>r.querySelector('td.num').textContent)`);
    assert.equal(amountOrderAsc.every((text,idx,arr)=>idx===0||Number(arr[idx-1].replace(/[^\d.]/g,''))<=Number(text.replace(/[^\d.]/g,''))), true, 'second click should reverse to ascending');

    // Date range filters boundaries inclusively.
    await evaluate(`
      const from=document.querySelector('[data-expense-from]');
      const to=document.querySelector('[data-expense-to]');
      from.value='2026-03-05';
      to.value='2026-03-05';
      from.dispatchEvent(new Event('change',{bubbles:true}));
      to.dispatchEvent(new Event('change',{bubbles:true}));
    `);
    let boundaryRows = await evaluate(`return document.querySelectorAll('[data-expense-rows] tr').length`);
    assert.equal(boundaryRows, 1);

    // Clear filters again so load-more is easy to exercise.
    await evaluate(`document.querySelector('[data-clear-filters]').click();`);

    // Load more reveals additional client-paginated rows from the full snapshot.
    const initialRows = await evaluate(`return document.querySelectorAll('[data-expense-rows] tr').length`);
    await evaluate(`document.querySelector('[data-load-more]').click();`);
    const afterLoadRows = await evaluate(`return document.querySelectorAll('[data-expense-rows] tr').length`);
    assert.ok(afterLoadRows > initialRows, 'load more should reveal another page of rows');

    // Restore filters after a reload by relying on the persisted filter state.
    await evaluate(`
      const q = document.querySelector('[data-expense-search]');
      q.value='fuel';
      q.dispatchEvent(new Event('input',{bubbles:true}));
    `);
    const filteredRows = await evaluate(`return document.querySelectorAll('[data-expense-rows] tr').length`);
    assert.equal(filteredRows, 2);
    await evaluate(`window.location.reload();`);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const persistedRows = await evaluate(`return document.querySelectorAll('[data-expense-rows] tr').length`);
    assert.equal(persistedRows, 2, 'filters should persist across a page reload');

    // Navigate to income page and validate similar interactions there.
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/income-management/income.html` });
    await new Promise(resolve => setTimeout(resolve, 1200));
    const firstIncomeSrc = await evaluate(`return document.querySelector('[data-income-rows] tr td[data-label="Source"]').textContent.trim()`);
    assert.ok(firstIncomeSrc.length > 0, 'income rows should render');
    await evaluate(`const q=document.querySelector('[data-income-search]'); q.value='salary'; q.dispatchEvent(new Event('input',{bubbles:true}));`);
    const searchResult = await evaluate(`return document.querySelectorAll('[data-income-rows] tr').length`);
    assert.equal(searchResult, 1);

    // Responsive check: filter controls should remain reachable at 360px and not overflow horizontally.
    await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
    await new Promise(resolve => setTimeout(resolve, 300));
    const overflow = await evaluate(`
      const root = document.scrollingElement;
      const toolbar = document.querySelector('[data-income-filters]');
      return { scrollW: root.scrollWidth, clientW: root.clientWidth, toolbarVisible: !!toolbar };
    `);
    assert.ok(overflow.toolbarVisible);
    assert.ok(overflow.scrollW <= overflow.clientW + 1, 'page must not introduce horizontal overflow at mobile width');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  } finally {
    if (ws) ws.close();
    chrome.kill();
    server.close();
  }
});

test('income edit and delete keep filters and list state consistent', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome executable not found; skipping browser test');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const incomes = [
    { id: 101, amount: 300.0, source: 'Salary', income_date: '2026-03-01', frequency: 'monthly', notes: 'Salary note' },
    { id: 102, amount: 120.0, source: 'Freelance', income_date: '2026-03-10', frequency: 'one-time', notes: '' },
    { id: 103, amount: 240.0, source: 'Rental', income_date: '2026-03-20', frequency: 'monthly', notes: 'unit 2' }
  ];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    if (pathname === '/api/incomes' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(paginate(incomes, 1, 15)));
      return;
    }
    if (pathname === '/api/incomes' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const payload = JSON.parse(body);
        const created = { id: 104, amount: payload.amount, source: payload.source, income_date: payload.income_date, frequency: payload.frequency, notes: payload.notes };
        incomes.push(created);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: created }));
      });
      return;
    }
    const match = pathname.match(/^\/api\/incomes\/(\d+)$/);
    if (match && req.method === 'PUT') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const payload = JSON.parse(body);
        const index = incomes.findIndex((item) => item.id === Number(match[1]));
        if (index >= 0) {
          incomes[index] = { ...incomes[index], ...payload };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: incomes[index] }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Not found.' }));
        }
      });
      return;
    }
    if (match && req.method === 'DELETE') {
      const index = incomes.findIndex((item) => item.id === Number(match[1]));
      if (index >= 0) {
        incomes.splice(index, 1);
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Not found.' }));
      }
      return;
    }

    const filePath = path.join(rootDir, pathname.slice(1));
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html' || ext === '.js') {
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace(/127\.0\.0\.1:8002/g, req.headers.host || '127.0.0.1');
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] });
      res.end(content);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const chrome = spawn(chromePath, [
    '--headless', '--remote-debugging-port=0', '--disable-gpu', '--no-sandbox'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  const devTools = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 10000);
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        cdpPort = Number(match[1]);
        clearTimeout(timer);
        resolve(cdpPort);
      }
    });
  });

  let ws = null;
  let msgId = 1;
  const callbacks = new Map();
  try {
    await devTools;
    const tabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(`http://127.0.0.1:${port}/income-management/income.html`), { method: 'PUT' });
    const tab = await tabRes.json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };
    const send = (method, params = {}) => new Promise((resolve) => {
      const id = msgId++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const response = await send('Runtime.evaluate', {
        expression: `(() => { try { ${expression} } catch (err) { return { error: err.message }; } })()`,
        returnByValue: true
      });
      const value = response.result && response.result.result ? response.result.result.value : null;
      if (value && value.error) throw new Error(value.error);
      return value;
    };

    await send('Page.enable');
    await send('Runtime.enable');

    let rows = 0;
    for (let i = 0; i < 40; i++) {
      rows = await evaluate(`return document.querySelectorAll('[data-income-rows] tr').length`);
      if (rows) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(rows === 3, 'income history should load 3 rows');

    // Edit the first row through the inline form and save.
    await evaluate(`
      const editBtn = document.querySelector('[data-edit-income]');
      editBtn.click();
    `);
    await evaluate(`
      const amountInput = document.querySelector('.income-form #amount');
      amountInput.value = '250.00';
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.income-form button[type="submit"]').click();
    `);
    let changed = null;
    for (let i = 0; i < 40; i++) {
      changed = await evaluate(`return Array.from(document.querySelectorAll('[data-income-rows] tr')).map(r=>r.querySelector('td.num').textContent)`);
      if (changed.some(text => text.includes('250'))) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(changed.some(text => text.includes('250')), 'edited amount should update in place');

    await evaluate(`window.confirm = () => true;`);

    // Edit again just to ensure no stale duplication before delete.
    const beforeDelete = await evaluate(`return document.querySelectorAll('[data-income-rows] tr').length`);
    await evaluate(`
      const firstDelete = document.querySelector('[data-delete-income]');
      firstDelete.click();
    `);
    let afterDelete = 0;
    for (let i = 0; i < 40; i++) {
      afterDelete = await evaluate(`return document.querySelectorAll('[data-income-rows] tr').length`);
      if (afterDelete !== beforeDelete) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(afterDelete, 2, 'delete should remove a single row and keep the others');
  } finally {
    if (ws) ws.close();
    chrome.kill();
    server.close();
  }
});
