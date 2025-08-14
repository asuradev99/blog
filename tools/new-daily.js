#!/usr/bin/env node

//Usage: 

//node tools/new-daily.js          # creates posts/Daily/<today>.html
//node tools/new-daily.js 2025-08-13


const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const DAILY_DIR = path.join(ROOT, 'posts', 'Daily');

function today(){
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

const date = (process.argv[2] || today()); // allow override
const fname = `${date}.html`;
const file  = path.join(DAILY_DIR, fname);
fs.mkdirSync(DAILY_DIR, { recursive: true });

const relToAssets = path.join('..','..','assets'); // posts/Daily/file.html → ../../assets
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${date}</title>
  <meta name="title" content="${date}" />
  <meta name="date" content="${date}" />
  <meta name="tags" content="daily" />
  <link rel="stylesheet" href="${path.join(relToAssets,'styles.css').replace(/\\/g,'/')}" />
  <script defer src="${path.join(relToAssets,'site.js').replace(/\\/g,'/')}" ></script>
</head>
<body>
  <article id="post-article" class="article">
    <h1>${date}</h1>
    <div id="post-meta"></div>
    <p>Daily notes for ${date}.</p>
  </article>
</body>
</html>`;

fs.writeFileSync(file, html, 'utf8');
console.log('Created daily post', path.relative(ROOT, file));

// Update manifest
const gen = spawnSync(process.execPath, [path.join('tools','generate-manifest.js')], { stdio: 'inherit' });
if(gen.status !== 0) process.exit(gen.status);