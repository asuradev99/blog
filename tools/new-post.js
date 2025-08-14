#!/usr/bin/env node

//Usage:
// node tools/new-post.js "Notes" "My Title" "tag1, tag2"  # date defaults to today
// # or specify date
// node tools/new-post.js "Notes" "My Title" "tag1, tag2" 2025-08-13

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const POSTS = path.join(ROOT, 'posts');

function slugify(s){
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
function today(){
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

const dirArg   = process.argv[2] || 'Notes';
const titleArg = process.argv[3] || 'New Post';
const tagsArg  = process.argv[4] || '';
const dateArg  = process.argv[5] || today();

const relDir = path.join('posts', dirArg);
const outDir = path.join(ROOT, relDir);
const slug   = slugify(titleArg) || `post-${Date.now()}`;
const file   = path.join(outDir, `${slug}.html`);
const relToAssets = path.join('..','..','assets'); // posts/<dir>/file.html → ../../assets

fs.mkdirSync(outDir, { recursive: true });

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${titleArg}</title>
  <meta name="title" content="${titleArg}" />
  <meta name="date" content="${dateArg}" />
  <meta name="tags" content="${tagsArg}" />
  <link rel="stylesheet" href="${path.join(relToAssets,'styles.css').replace(/\\/g,'/')}" />
  <script defer src="${path.join(relToAssets,'site.js').replace(/\\/g,'/')}" ></script>
</head>
<body>
  <article id="post-article" class="article">
    <h1>${titleArg}</h1>
    <div id="post-meta"></div>
    <p>Write your content here.</p>
  </article>
</body>
</html>`;

fs.writeFileSync(file, html, 'utf8');
console.log('Created', path.relative(ROOT, file));

// Update manifest
const gen = spawnSync(process.execPath, [path.join('tools','generate-manifest.js')], { stdio: 'inherit' });
if(gen.status !== 0) process.exit(gen.status);