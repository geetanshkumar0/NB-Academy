#!/usr/bin/env node
'use strict';
// Builds dist/preview.html: the app shell with every script inlined, for hosting as a single page
// (browser-only preview edition that keeps data in localStorage).
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'public', 'app.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = fs.readFileSync(path.join(root, 'public', src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script>/* ${src} */\n${code}\n</script>`;
});
fs.mkdirSync(path.join(root, 'dist'), {recursive:true});
fs.writeFileSync(path.join(root, 'dist', 'preview.html'), html);
console.log(`dist/preview.html written (${(html.length / 1024).toFixed(0)} KB)`);
