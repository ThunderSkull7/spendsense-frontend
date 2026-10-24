#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),fail=[];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pages=['index.html','dashboard/dashboard.html','expense-management/expenses.html','expense-management/add-expense.html','income-management/income.html','budget-planning/budget.html','categories-management/categories.html','reports-analytics/reports.html','notifications/notifications.html','settings/settings.html','support/support.html','authentication/login.html','authentication/signup.html','authentication/forgot-password.html'];
for(const p of pages)if(!fs.existsSync(path.join(root,p)))fail.push('Missing page '+p);
for(const p of pages.filter(p=>!p.startsWith('authentication/')&&p!=='index.html')){if(!fs.existsSync(path.join(root,p)))continue;const h=read(p);for(const k of ['goals','bills','insights'])if(h.includes('data-nav="'+k+'"'))fail.push(p+' has unexpected '+k+' navigation');const n=(h.match(/data-nav="reports"/g)||[]).length;if(n!==1)fail.push(p+' should have one Reports item, found '+n);}
const h=read('categories-management/categories.html'),j=read('categories-management/categories.js');
if(!h.includes('class="category-form"'))fail.push('Category form missing');
if(!h.includes('data-category-choice="expense"')||!h.includes('data-category-choice="income"'))fail.push('Expense/Income selector missing');
if(!j.includes("api.post('/categories', payload)"))fail.push('Category create API missing');
if(!j.includes("api.put(`/categories/${editingCategoryId}`, payload)"))fail.push('Category update API missing');
if(!j.includes('category.is_default !== false'))fail.push('Category default/custom distinction missing');
if(!j.includes("Shared default categories cannot be edited"))fail.push('Category default edit protection missing');
if(!j.includes("Shared default categories cannot be deleted"))fail.push('Category default delete protection missing');
if(!h.includes('Shared defaults are managed by SpendSense'))fail.push('Category ownership guidance missing');
if(fail.length){console.error(fail.join('\n'));process.exitCode=1;}else console.log('Legacy site verification passed: 14 pages, one Reports item, no Goals/Bills/separate Insights, category CRUD present.');
