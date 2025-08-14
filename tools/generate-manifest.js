#!/usr/bin/env node
// Usage: node tools/generate-manifest.js
// Scans ./posts recursively for .html files, extracts <meta> title/date/tags, and writes posts/index.json

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, 'posts');
const OUT_FILE = path.join(POSTS_DIR, 'index.json');

function walk(dir){
  const out = [];
  for(const entry of fs.readdirSync(dir, { withFileTypes: true })){
    const full = path.join(dir, entry.name);
    if(entry.isDirectory()) out.push(...walk(full));
    else if(entry.isFile() && entry.name.toLowerCase().endsWith('.html')) out.push(full);
  }
  return out;
}

function extract(html){
  // Helper: return the first defined capture group, trimmed
  const get = (re) => {
    const m = html.match(re);
    if(!m) return '';
    for(let i = 1; i < m.length; i++){
      if(typeof m[i] === 'string' && m[i] !== undefined) return m[i].trim();
    }
    return '';
  };

  const title = get(/<meta[^>]*name=["']title["'][^>]*content=["']([^"']+)["'][^>]*>|<title>([^<]+)<\/title>/i);
  const date  = get(/<meta[^>]*name=["']date["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const tagsRaw = get(/<meta[^>]*name=["'](?:tags|keywords)["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const tags = tagsRaw ? tagsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  return { title, date, tags };
}

function toWebPath(abs){
  return abs.replace(ROOT + path.sep, '').split(path.sep).join('/');
}

function main(){
  if(!fs.existsSync(POSTS_DIR)){
    console.error('No posts/ directory found.');
    process.exit(1);
  }

  const files = walk(POSTS_DIR);
  const posts = files.map(f => {
    let html = '';
    try { html = fs.readFileSync(f, 'utf8'); }
    catch(err){ console.warn('Could not read', f, err.message); }

    const meta = extract(html);
    return {
      title: meta.title || path.basename(f, '.html'),
      path: toWebPath(f),
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      date: meta.date || ''
    };
  }).sort((a,b)=> new Date(b.date||0) - new Date(a.date||0));

  const out = { generated: new Date().toISOString(), posts };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT_FILE} with ${posts.length} posts.`);
}

main();
