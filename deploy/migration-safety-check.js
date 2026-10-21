#!/usr/bin/env node
/**
 * migration-safety-check.js
 *
 * Analyzes Laravel migrations for safety concerns before production deployment.
 * Checks for:
 * - Fail-closed rollbacks
 * - Data-transforming operations
 * - Lock-prone operations
 * - Irreversible changes
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'backend', 'database', 'migrations');

function analyzeMigration(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);

  const analysis = {
    filename,
    createsTables: [],
    altersTables: [],
    dropsTables: [],
    dropsColumns: [],
    addsConstraints: [],
    failClosedRollback: false,
    dataTransforms: false,
    lockProne: false,
    irreversible: false,
    concerns: []
  };

  // Check for table creation
  const createTableMatches = content.matchAll(/Schema::create\(['"]([^'"]+)['"]/g);
  for (const match of createTableMatches) {
    analysis.createsTables.push(match[1]);
  }

  // Check for table alteration
  const alterTableMatches = content.matchAll(/Schema::table\(['"]([^'"]+)['"]/g);
  for (const match of alterTableMatches) {
    analysis.altersTables.push(match[1]);
  }

  // Check for table drops
  const dropTableMatches = content.matchAll(/Schema::dropIfExists\(['"]([^'"]+)['"]/g);
  for (const match of dropTableMatches) {
    analysis.dropsTables.push(match[1]);
  }

  // Check for column drops
  const dropColumnMatches = content.matchAll(/\$table->dropColumn\(/g);
  analysis.dropsColumns = dropColumnMatches ? Array.from(dropColumnMatches).length : 0;

  // Check for constraint additions
  if (content.includes('ADD CONSTRAINT') || content.includes('->unique(') || content.includes('->primary(')) {
    analysis.addsConstraints = true;
  }

  // Check for fail-closed rollbacks (throws exception if data exists)
  if (content.includes('Refusing to drop') || content.includes('Refusing to remove') || 
      content.includes('Refusing to drop') || content.includes('throw new RuntimeException') ||
      content.includes('exists()') && content.includes('throw')) {
    analysis.failClosedRollback = true;
    analysis.concerns.push('Fail-closed rollback - refuses to drop if data exists');
  }

  // Check for data transforms
  if (content.includes('DB::table(') && (content.includes('->update(') || content.includes('->insert(') || content.includes('->delete('))) {
    analysis.dataTransforms = true;
    analysis.concerns.push('Data transformation in migration');
  }

  // Check for lock-prone operations
  if (content.includes('CREATE UNIQUE INDEX') || content.includes('CREATE INDEX') || 
      content.includes('ALTER TABLE') && content.includes('ADD CONSTRAINT')) {
    analysis.lockProne = true;
    analysis.concerns.push('Lock-prone operation (index/constraint creation)');
  }

  // Check for irreversible operations
  if (content.includes('dropColumn') || content.includes('dropTable') || 
      content.includes('DROP CONSTRAINT') || content.includes('DROP INDEX')) {
    analysis.irreversible = true;
    analysis.concerns.push('Irreversible schema change');
  }

  return analysis;
}

function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.php'))
    .sort();

  console.log('=== Migration Safety Analysis ===\n');

  const allAnalyses = [];
  for (const file of files) {
    const analysis = analyzeMigration(path.join(MIGRATIONS_DIR, file));
    allAnalyses.push(analysis);
  }

  // Summary by risk level
  const highRisk = allAnalyses.filter(a => a.concerns.some(c => c.includes('fail-closed') || c.includes('fail-closed') || c.includes('Fail-closed')));
  const mediumRisk = allAnalyses.filter(a => a.lockProne || a.irreversible || a.addsConstraints);
  const lowRisk = allAnalyses.filter(a => !a.lockProne && !a.irreversible && !a.addsConstraints && !a.failClosedRollback);

  console.log('=== HIGH RISK (Fail-closed rollbacks) ===');
  for (const a of highRisk) {
    console.log(`  ${a.filename}`);
    for (const c of a.concerns) console.log(`    - ${c}`);
  }

  console.log('\n=== MEDIUM RISK (Lock-prone / constraints / irreversible) ===');
  for (const a of mediumRisk) {
    if (highRisk.some(h => h.filename === a.filename)) continue;
    console.log(`  ${a.filename}`);
    for (const c of a.concerns) console.log(`    - ${c}`);
  }

  console.log('\n=== LOW RISK ===');
  for (const a of lowRisk) {
    console.log(`  ${a.filename}`);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total migrations: ${allAnalyses.length}`);
  console.log(`High risk (fail-closed rollback): ${highRisk.length}`);
  console.log(`Medium risk (lock-prone/constraints): ${mediumRisk.length}`);
  console.log(`Low risk: ${lowRisk.length}`);

  // Production readiness checks
  console.log('\n=== PRODUCTION READINESS CHECKS ===');
  console.log('Before deploying to production, verify:');
  console.log('1. Run migration rehearsal on staging branch with synthetic data');
  console.log('2. Verify no duplicate budgets exist (unique budget period index)');
  console.log('3. Verify no zero/negative amounts in incomes/expenses (NOT VALID constraints)');
  console.log('4. Verify soft-delete columns do not already exist');
  console.log('4. Measure migration lock duration on staging with production-scale data');
  console.log('5. Verify backup/PITR before running migrations');
}

main();