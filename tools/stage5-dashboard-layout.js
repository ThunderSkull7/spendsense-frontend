/*
 * Stage 5 frontend integration – use the shared layout helpers in the
 * dashboard, so the widget order rules live in one tested place.
 *
 * Run from the frontend directory:  node tools/stage5-dashboard-layout.js
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'dashboard', 'dashboard.js');
let source = fs.readFileSync(target, 'utf8');

const edits = [
  [
    `        if (Array.isArray(widgets) && widgets.length) {
          const byKey = new Map(widgets.map((widget) => [widget.key, widget]));
          // Keep the server order, then append any widget the server did not
          // send so a newly added widget is never silently dropped.
          const ordered = widgets
            .filter((widget) => WIDGET_KEYS.includes(widget.key))
            .map((widget) => ({ key: widget.key, visible: widget.visible === true }));
          WIDGET_KEYS.filter((key) => !byKey.has(key)).forEach((key) => {
            ordered.push({ key, visible: !DEFAULT_HIDDEN.includes(key) });
          });
          layout = ordered;
        } else {
          layout = defaultLayout();
        }`,
    `        if (Array.isArray(widgets) && widgets.length) {
          // The shared helper keeps the server order, drops unknown keys and
          // appends any widget the server did not send, so a newly added
          // widget is never silently dropped.
          layout = S5.normalizeWidgetLayout(widgets, WIDGET_KEYS, DEFAULT_HIDDEN);
        } else {
          layout = defaultLayout();
        }`,
    'use the shared layout normaliser',
  ],
  [
    `      up.addEventListener('click', () => {
        const position = layout.findIndex((entry) => entry.key === widget.key);
        if (position <= 0) return;
        const [moved] = layout.splice(position, 1);
        layout.splice(position - 1, 0, moved);
        applyLayout();
        buildCustomizeList();
        // Keep the keyboard focus on the same control after the re-render.
        const next = customizeList.querySelector(\`#widget-toggle-\${CSS.escape(widget.key)}\`);
        if (next) next.focus();
      });`,
    `      up.addEventListener('click', () => {
        layout = S5.moveWidget(layout, widget.key, -1);
        applyLayout();
        buildCustomizeList();
        // Keep the keyboard focus on the same control after the re-render.
        const next = customizeList.querySelector(\`#widget-toggle-\${CSS.escape(widget.key)}\`);
        if (next) next.focus();
      });`,
    'use the shared move helper for the up button',
  ],
  [
    `      down.addEventListener('click', () => {
        const position = layout.findIndex((entry) => entry.key === widget.key);
        if (position < 0 || position >= layout.length - 1) return;
        const [moved] = layout.splice(position, 1);
        layout.splice(position + 1, 0, moved);
        applyLayout();
        buildCustomizeList();
        const next = customizeList.querySelector(\`#widget-toggle-\${CSS.escape(widget.key)}\`);
        if (next) next.focus();
      });`,
    `      down.addEventListener('click', () => {
        layout = S5.moveWidget(layout, widget.key, 1);
        applyLayout();
        buildCustomizeList();
        const next = customizeList.querySelector(\`#widget-toggle-\${CSS.escape(widget.key)}\`);
        if (next) next.focus();
      });`,
    'use the shared move helper for the down button',
  ],
  [
    `  const visibleKeys = () => layout.filter((widget) => widget.visible).map((widget) => widget.key);`,
    `  const visibleKeys = () => S5.visibleWidgetKeys(layout);`,
    'use the shared visible-key helper',
  ],
];

edits.forEach(([needle, replacement, label]) => {
  if (!source.includes(needle)) {
    console.log(`SKIP  ${label}`);
    return;
  }
  source = source.split(needle).join(replacement);
  console.log(`OK    ${label}`);
});

fs.writeFileSync(target, source, 'utf8');
console.log('dashboard.js layout helpers wired');
