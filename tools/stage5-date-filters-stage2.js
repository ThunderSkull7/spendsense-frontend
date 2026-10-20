/*
 * Stage 5 cross-database consistency fix – date-only range filters in the
 * Stage 2 and Stage 3 services.
 *
 * The ledger date columns are DATE columns, but SQLite stores them through
 * Eloquent's date cast as "Y-m-d H:i:s". A raw string comparison against a
 * bare "Y-m-d" upper bound therefore drops the last day of a range on SQLite
 * while PostgreSQL (a real DATE type) keeps it. The three call sites below
 * are changed to whereDate so every supported database reports the same
 * figures. The Stage 1-4 test suites guard the change.
 *
 * Run from the frontend directory:  node tools/stage5-date-filters-stage2.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'backend');

const edits = [
  {
    file: 'app/Services/BillCalendarService.php',
    label: 'the bill calendar month range',
    from: `        ->whereBetween('occurrence_date', [$start->toDateString(), $end->toDateString()]);`,
    to: `        ->whereDate('occurrence_date', '>=', $start->toDateString())
        ->whereDate('occurrence_date', '<=', $end->toDateString());`,
  },
  {
    file: 'app/Services/BillCalendarService.php',
    label: 'the bill calendar upcoming range',
    from: `        ->whereBetween('occurrence_date', [
            $today->toDateString(),
            $today->addDays($days)->toDateString(),
        ]);`,
    to: `        ->whereDate('occurrence_date', '>=', $today->toDateString())
        ->whereDate('occurrence_date', '<=', $today->addDays($days)->toDateString());`,
  },
  {
    file: 'app/Services/BudgetAlertService.php',
    label: 'the budget alert month spend',
    from: `            ->whereBetween('expense_date', [
                $month->startOfMonth()->toDateString(),
                $month->endOfMonth()->toDateString(),
            ])`,
    to: `            ->whereDate('expense_date', '>=', $month->startOfMonth()->toDateString())
            ->whereDate('expense_date', '<=', $month->endOfMonth()->toDateString())`,
  },
];

edits.forEach((edit) => {
  const file = path.join(ROOT, edit.file);
  let source = fs.readFileSync(file, 'utf8');
  if (!source.includes(edit.from)) {
    console.log(`SKIP  ${edit.file}: ${edit.label}`);
    return;
  }
  source = source.split(edit.from).join(edit.to);
  fs.writeFileSync(file, source, 'utf8');
  console.log(`OK    ${edit.file}: ${edit.label}`);
});
