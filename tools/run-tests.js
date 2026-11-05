#!/usr/bin/env node
'use strict';

/**
 * SpendSense Automated Test Discovery & Runner
 *
 * Automatically discovers all `tests/*.test.js` files, categorizes them into
 * lightweight Node unit/integration tests and browser regression tests, avoids
 * uncontrolled parallel Chrome processes, and enforces execution integrity in CI.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(REPO_ROOT, 'tests');

function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function getChromeVersion(chromePath) {
  if (process.platform === 'win32') {
    try {
      const psCmd = `(Get-Item '${chromePath.replace(/'/g, "''")}').VersionInfo.ProductVersion`;
      const ver = execFileSync('powershell.exe', ['-NoProfile', '-Command', psCmd], { encoding: 'utf8', timeout: 5000 }).trim();
      return ver ? `Google Chrome ${ver}` : 'installed (Windows)';
    } catch {
      return 'installed (Windows)';
    }
  }
  try {
    return execFileSync(chromePath, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch (err) {
    return `unknown (${err.message})`;
  }
}

function isBrowserTest(filename) {
  if (filename.endsWith('-browser.test.js') || filename === 'responsive-layout.test.js') {
    return true;
  }
  const content = fs.readFileSync(path.join(TESTS_DIR, filename), 'utf8');
  return content.includes('findChrome');
}

function discoverTests() {
  if (!fs.existsSync(TESTS_DIR)) {
    throw new Error(`Tests directory not found: ${TESTS_DIR}`);
  }

  const entries = fs.readdirSync(TESTS_DIR).sort();
  const testFiles = entries.filter((name) => name.endsWith('.test.js'));

  const nodeTests = [];
  const browserTests = [];

  for (const file of testFiles) {
    if (isBrowserTest(file)) {
      browserTests.push(file);
    } else {
      nodeTests.push(file);
    }
  }

  // Discovery safeguard: Ensure every test file is categorized exactly once
  const totalCategorized = nodeTests.length + browserTests.length;
  if (totalCategorized !== testFiles.length) {
    throw new Error(
      `Test discovery safeguard failure: discovered ${testFiles.length} files, categorized ${totalCategorized}`
    );
  }

  const intersection = nodeTests.filter((f) => browserTests.includes(f));
  if (intersection.length > 0) {
    throw new Error(`Test discovery safeguard collision: ${intersection.join(', ')} in multiple suites`);
  }

  return { all: testFiles, node: nodeTests, browser: browserTests };
}

function parseTestSummary(output) {
  const match = (regex) => {
    const m = output.match(regex);
    return m ? parseInt(m[1], 10) : 0;
  };

  return {
    tests: match(/ℹ\s+tests\s+(\d+)/),
    pass: match(/ℹ\s+pass\s+(\d+)/),
    fail: match(/ℹ\s+fail\s+(\d+)/),
    cancelled: match(/ℹ\s+cancelled\s+(\d+)/),
    skipped: match(/ℹ\s+skipped\s+(\d+)/),
    todo: match(/ℹ\s+todo\s+(\d+)/),
  };
}

function runSuite(suiteName, files, options = {}) {
  return new Promise((resolve, reject) => {
    if (files.length === 0) {
      console.log(`[${suiteName}] No test files to execute.`);
      return resolve({ code: 0, summary: { tests: 0, pass: 0, fail: 0, skipped: 0 } });
    }

    console.log(`============================================================`);
    console.log(`Running suite: ${suiteName} (${files.length} test files)`);
    console.log(`============================================================`);
    for (const f of files) {
      console.log(`  • tests/${f}`);
    }
    console.log('');

    const args = ['--test'];
    if (options.concurrency) {
      args.push(`--test-concurrency=${options.concurrency}`);
    }
    for (const f of files) {
      args.push(path.join('tests', f));
    }

    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let combinedOutput = '';

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      combinedOutput += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      combinedOutput += chunk.toString();
    });

    child.on('error', (err) => reject(err));

    child.on('close', (code) => {
      const summary = parseTestSummary(combinedOutput);
      resolve({ code, summary, output: combinedOutput });
    });
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    suite: 'all', // 'node' | 'browser' | 'all'
    list: false,
    checkChrome: false,
    safeguardOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--suite' && i + 1 < args.length) {
      options.suite = args[++i];
    } else if (arg.startsWith('--suite=')) {
      options.suite = arg.split('=')[1];
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--check-chrome') {
      options.checkChrome = true;
    } else if (arg === '--safeguard-only') {
      options.safeguardOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`SpendSense Test Runner Usage:
  node tools/run-tests.js [options]

Options:
  --suite=node|browser|all   Select test suite to run (default: all)
  --list                     List discovered test files and suites
  --check-chrome             Verify Chrome presence and print version
  --safeguard-only           Verify test discovery integrity without running tests
`);
      process.exit(0);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const discovery = discoverTests();

  if (options.list) {
    console.log(`Discovered ${discovery.all.length} test files in tests/:`);
    console.log(`\nNode unit & integration tests (${discovery.node.length} files):`);
    for (const f of discovery.node) console.log(`  - tests/${f}`);
    console.log(`\nBrowser regression tests (${discovery.browser.length} files):`);
    for (const f of discovery.browser) console.log(`  - tests/${f}`);
    return;
  }

  if (options.checkChrome) {
    const chrome = findChrome();
    if (!chrome) {
      console.error('ERROR: Chrome executable not found on this system.');
      if (process.env.CI) {
        process.exit(1);
      }
      return;
    }
    console.log(`Chrome detected at: ${chrome}`);
    console.log(`Chrome version: ${getChromeVersion(chrome)}`);
    return;
  }

  if (options.safeguardOnly) {
    console.log(`Test discovery safeguard passed: ${discovery.all.length} tests discovered and categorized.`);
    return;
  }

  const isCI = Boolean(process.env.CI);
  let overallExitCode = 0;
  const suiteResults = [];

  // Suite: Node
  if (options.suite === 'node' || options.suite === 'all') {
    const nodeResult = await runSuite('Node unit, orchestration and Worker tests', discovery.node);
    suiteResults.push({ name: 'Node Tests', files: discovery.node.length, ...nodeResult });
    if (nodeResult.code !== 0) {
      overallExitCode = nodeResult.code;
    }
  }

  // Suite: Browser
  if (options.suite === 'browser' || options.suite === 'all') {
    const chrome = findChrome();
    if (chrome) {
      console.log(`Detected Chrome binary : ${chrome}`);
      console.log(`Detected Chrome version: ${getChromeVersion(chrome)}`);
    } else {
      if (isCI) {
        console.error('ERROR: Chrome executable is strictly required in CI environment but was not found.');
        process.exit(1);
      } else {
        console.warn('WARNING: Chrome binary not found. Browser tests will skip in local environment.');
      }
    }

    // Run browser tests with --test-concurrency=1 to avoid uncontrolled parallel Chrome instances
    const browserResult = await runSuite('Browser regression tests', discovery.browser, { concurrency: 1 });
    suiteResults.push({ name: 'Browser Tests', files: discovery.browser.length, ...browserResult });
    if (browserResult.code !== 0) {
      overallExitCode = browserResult.code;
    }

    // CI enforcement: Zero skipped browser tests in CI
    if (isCI && browserResult.summary.skipped > 0) {
      console.error(
        `\nCI ENFORCEMENT ERROR: ${browserResult.summary.skipped} browser test(s) skipped in CI! ` +
        `CI requires 100% execution of all browser regression tests.`
      );
      overallExitCode = 1;
    }
  }

  // Final Summary Report
  console.log(`\n============================================================`);
  console.log(`SpendSense Test Suite Execution Summary`);
  console.log(`============================================================`);
  console.log(`Total test files discovered : ${discovery.all.length}`);
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const res of suiteResults) {
    const { name, files, code, summary } = res;
    const status = code === 0 && summary.fail === 0 ? 'PASS' : 'FAIL';
    console.log(
      `${name.padEnd(16)}: ${status} (${files} files, ${summary.tests || summary.pass} assertions: ` +
      `${summary.pass} passed, ${summary.fail} failed, ${summary.skipped} skipped)`
    );
    totalTests += summary.tests || summary.pass;
    totalPassed += summary.pass;
    totalFailed += summary.fail;
    totalSkipped += summary.skipped;
  }
  console.log(`------------------------------------------------------------`);
  console.log(
    `Overall Result  : ${overallExitCode === 0 ? 'PASSED' : 'FAILED'} ` +
    `(${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped)`
  );
  console.log(`============================================================\n`);

  if (overallExitCode !== 0) {
    process.exit(overallExitCode);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  discoverTests,
  isBrowserTest,
  findChrome,
  getChromeVersion,
  parseTestSummary,
};
