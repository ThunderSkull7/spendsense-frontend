/*
 * Stage 5 frontend integration – repair script.
 *
 * The previous dedupe pass used a mismatched tuple order and wrote its
 * diagnostic labels into expenses.js in place of the removed blocks. This
 * removes exactly those inserted labels, restoring the file to the state
 * before that pass.
 *
 * Run from the frontend directory:  node tools/stage5-expense-repair.js
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'expense-management', 'expenses.js');
let source = fs.readFileSync(target, 'utf8');

const inserted = [
  'old updateSummary',
  'old setLoadMore',
  'old showState',
  'old showTable',
  'old showEmpty',
  'old renderRows',
  'old applyFilter',
];

inserted.forEach((label) => {
  if (!source.includes(label)) {
    console.log(`SKIP  ${label} (not present)`);
    return;
  }
  source = source.split(label).join('');
  console.log(`OK    removed inserted label: ${label}`);
});

fs.writeFileSync(target, source, 'utf8');
console.log('expenses.js repaired');
