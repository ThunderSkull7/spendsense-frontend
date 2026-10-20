const fs = require('fs');

const filePath = 'D:\\SpendSense Project\\SpendSense\\frontend\\tests\\recurring-expenses.test.js';
let content = fs.readFileSync(filePath, 'utf8');

const oldText = '  for (const endpoint of [\n    "API.get(\'/api/notifications?",\n    "API.post(`/api/notifications/",\n    "API.post(\'/api/notifications/read-all",\n  ]) {\n    assert.ok(notifications.includes(endpoint), `notification script missing ${endpoint}`);\n  }';

const newText = '  for (const endpoint of [\n    "API.get(`\\/api\\/notifications?",\n    "API.post(`\\/api\\/notifications\\/",\n    "API.post(\'/api\\/notifications\\/read-all",\n  ]) {\n    assert.ok(notifications.includes(endpoint), `notification script missing ${endpoint}`);\n  }';

if (!content.includes(oldText)) {
  console.log('Old text not found!');
  process.exit(1);
}

const newContent = content.replace(oldText, newText);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Done');