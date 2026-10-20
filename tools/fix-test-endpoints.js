const fs = require('fs');

const savingsTestPath = 'D:\\SpendSense Project\\SpendSense\\frontend\\tests\\savings-goals.test.js';
let content = fs.readFileSync(savingsTestPath, 'utf8');

const oldText = `  for (const endpoint of [
    "API.get('/api/notifications?",
    "API.post('/api/notifications/",
    "API.post('/api/notifications/read-all",
  ]) {
    assert.ok(script.includes(endpoint), \`notification script missing \${endpoint}\`);
  }`;

const newText = `  for (const endpoint of [
    "API.get(\`/api/notifications?",
    "API.post(\`/api/notifications/",
    "API.post('/api/notifications/read-all",
  ]) {
    assert.ok(script.includes(endpoint), \`notification script missing \${endpoint}\`);
  }`;

if (!content.includes(oldText)) {
  console.log('Old text not found in savings-goals.test.js!');
  process.exit(1);
}

const newContent = content.replace(oldText, newText);
fs.writeFileSync(savingsTestPath, newContent, 'utf8');
console.log('Fixed savings-goals.test.js');