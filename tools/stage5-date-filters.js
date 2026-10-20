/*
 * Stage 5 frontend/backend consistency fix – date-only range filters.
 *
 * The ledger date columns are DATE columns, but SQLite stores them through
 * Eloquent's date cast as "Y-m-d H:i:s". A raw string comparison against a
 * bare "Y-m-d" upper bound therefore drops the last day of a period on
 * SQLite while PostgreSQL (a real DATE type) keeps it.
 *
 * Every date-only range in the Stage 5 services is changed to whereDate, so
 * the report, the analytics endpoints and the transaction search all count
 * exactly the same transactions on every supported database.
 *
 * Run from the backend directory:  php ../frontend/tools/... (run with node)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'backend');

const FILES = [
  'app/Services/ReportService.php',
  'app/Services/SpendingTrendService.php',
  'app/Services/IncomeAnalysisService.php',
  'app/Services/BudgetPerformanceService.php',
  'app/Services/DataQualityService.php',
  'app/Services/CommitmentService.php',
];

// The columns that hold a date-only value.
const DATE_COLUMNS = ['expense_date', 'income_date', 'occurrence_date', 'e.expense_date', 'i.income_date'];

let totalFixes = 0;

FILES.forEach((relative) => {
  const file = path.join(ROOT, relative);
  let source = fs.readFileSync(file, 'utf8');
  let fixes = 0;

  DATE_COLUMNS.forEach((column) => {
    const pattern = new RegExp(
      `->whereBetween\\('${column.replace('.', '\\.')}', \\[([^\\]]+)\\]\\)`,
      'g'
    );
    source = source.replace(pattern, (match, args) => {
      // Split the two arguments on the top-level comma.
      const parts = [];
      let depth = 0;
      let current = '';
      for (const character of args) {
        if (character === '(' || character === '[') depth += 1;
        if (character === ')' || character === ']') depth -= 1;
        if (character === ',' && depth === 0) {
          parts.push(current.trim());
          current = '';
          continue;
        }
        current += character;
      }
      if (current.trim() !== '') parts.push(current.trim());
      if (parts.length !== 2) return match;

      fixes += 1;
      return `->whereDate('${column}', '>=', ${parts[0]})->whereDate('${column}', '<=', ${parts[1]})`;
    });
  });

  // The same pattern for a column held in a variable.
  source = source.replace(
    /->whereBetween\((\$dateColumn), \[([^\]]+)\]\)/g,
    (match, column, args) => {
      const parts = args.split(',').map((part) => part.trim());
      if (parts.length !== 2) return match;
      fixes += 1;
      return `->whereDate(${column}, '>=', ${parts[0]})->whereDate(${column}, '<=', ${parts[1]})`;
    }
  );

  if (fixes > 0) {
    fs.writeFileSync(file, source, 'utf8');
    totalFixes += fixes;
    console.log(`OK    ${relative} (${fixes} filter${fixes === 1 ? '' : 's'})`);
  } else {
    console.log(`SAME  ${relative}`);
  }
});

console.log(`\n${totalFixes} date filter(s) changed`);
