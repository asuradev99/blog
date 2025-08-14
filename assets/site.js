(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const normalizePath = p => String(p||'').replace(/^\/+/, '').replace(/\\+/g,'/');
  const byDateDesc = (a, b) => new Date(b.date||0) - new Date(a.date||0);
  const qs = () => new URLSearchParams(location.search);

  // ---------- Root‑safe linking ----------
  function getSiteBase(){
    const p = location.pathname;
    const idx = p.indexOf('/posts/');
    if (idx !== -1) return p.slice(0, idx + 1); // keep trailing slash
    const last = p.lastIndexOf('/');
    return p.slice(0, last + 1);
  }
  function toRootHref(rel){ rel = String(rel || '').replace(/^\/+/, ''); return getSiteBase() + rel; }
  function currentRelPath(){ const base = getSiteBase(); let rel = location.pathname; if (rel.startsWith(base)) rel = rel.slice(base.length); return normalizePath(rel); }

  // ---------- Minimal shell injector (for bare post pages) ----------
  function ensureShell(){
    if ($('.layout')) return; // already has chrome
    const header = document.createElement('header');
    header.className = 'topbar';
    header.innerHTML = `
      <a class="brand" href="${toRootHref('index.html')}">My Minimal Blog</a>
      <form id="search-form" class="searchbar center" role="search" autocomplete="off">
        <input id="search-input" type="search" placeholder="Search… (use tag:foo tag:bar)" aria-label="Search posts" />
        <button id="search-clear" type="button" class="ghost tiny" aria-label="Clear search">×</button>
      </form>
      <nav class="topnav">
        <a href="${toRootHref('index.html')}">Home</a>
        <button id="toggle-left" class="ghost" aria-label="Toggle left sidebar" aria-expanded="true">☰ Left</button>
        <button id="toggle-right" class="ghost" aria-label="Toggle right sidebar" aria-expanded="true">☰ Right</button>
      </nav>`;

    const bodyNodes = Array.from(document.body.childNodes);

    const layout = document.createElement('div');
    layout.id = 'app';
    layout.className = 'layout';
    layout.innerHTML = `
      <aside id="sidebar-left" class="sidebar left">
        <div class="sidebar-title">Posts</div>
        <div id="tree"></div>
      </aside>
      <main id="content" class="content"></main>
      <aside id="sidebar-right" class="sidebar right">
        <div class="sidebar-title">Tags</div>
        <ul id="tag-list" class="tag-list"></ul>
      </aside>`;

    const footer = document.createElement('footer');
    footer.className = 'footer muted';
    footer.innerHTML = `© <span id="year"></span> • Built with HTML/CSS/JS + MathJax`;

    document.body.innerHTML = '';
    document.body.appendChild(header);
    document.body.appendChild(layout);
    document.body.appendChild(footer);

    const main = $('#content');
    let article = $('#post-article');
    if(!article){
      article = document.createElement('article');
      article.id = 'post-article';
      article.className = 'article';
      const frag = document.createDocumentFragment();
      bodyNodes.forEach(n => frag.appendChild(n));
      article.appendChild(frag);
    }
    if(!article.querySelector('h1')){
      const h1 = document.createElement('h1');
      const metaTitle = document.querySelector('meta[name="title"]')?.getAttribute('content');
      h1.textContent = metaTitle || document.title || 'Untitled';
      article.insertBefore(h1, article.firstChild);
    }
    if(!$('#post-meta', article)){
      const metaDiv = document.createElement('div');
      metaDiv.id = 'post-meta';
      const after = article.querySelector('h1');
      (after||article).insertAdjacentElement('afterend', metaDiv);
    }
    main.appendChild(article);
  }

  // ---------- Manifest loader (JSON-only; no posts.js fallback) ----------
  async function loadManifest(){
    const url = toRootHref('posts/index.json');
    try {
      const bust = (url.includes('?') ? '&' : '?') + 'v=' + Date.now();
      const res = await fetch(url + bust, { cache: 'no-store' });
      if(!res.ok) throw new Error('Failed to load posts/index.json');
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.posts || []);
      return Array.isArray(arr) ? arr : [];
    } catch (err) {
      console.error('[site] Manifest load error:', err);
      const status = document.querySelector('#search-status');
      if(status){ status.style.display='block'; status.textContent = 'Could not load posts/index.json'; }
      return [];
    }
  }

  // ---------- Tags/Tree helpers ----------
  function buildTree(posts){
    const root = { name: '', type: 'folder', children: new Map() };
    (posts||[]).forEach(p => {
      let parts = normalizePath(p.path).split('/');
      // Hide the top-level 'posts' folder from the tree
      if(parts[0] && parts[0].toLowerCase() === 'posts') parts = parts.slice(1);
      let node = root;
      for(let i=0;i<parts.length;i++){
        const part = parts[i];
        const isFile = i === parts.length - 1;
        if(isFile){
          if(!node.children.has('__files__')) node.children.set('__files__', []);
          node.children.get('__files__').push({ name: p.title || part, type:'file', path: p.path, meta: p });
        } else {
          if(!node.children.has(part)) node.children.set(part, { name: part, type:'folder', children: new Map() });
          node = node.children.get(part);
        }
      }
    });
    return root;
  }
  function renderTree(container, tree){
    const ul = document.createElement('ul');
    ul.className = 'tree';
    const folders = [...tree.children.entries()].filter(([k]) => k !== '__files__').sort((a,b)=>a[0].localeCompare(b[0]));
    folders.forEach(([name, folderNode]) => {
      const li = document.createElement('li'); li.className = 'open';
      const head = document.createElement('div'); head.className = 'folder node';
      head.innerHTML = `<span class="caret">▾</span><span>${name}</span>`;
      head.addEventListener('click', () => li.classList.toggle('open'));
      const childrenWrap = document.createElement('div'); childrenWrap.className = 'children';
      renderTree(childrenWrap, folderNode);
      li.appendChild(head); li.appendChild(childrenWrap); ul.appendChild(li);
    });
    const files = (tree.children.get('__files__')||[]).sort((a,b)=>a.name.localeCompare(b.name));
    const activeRel = currentRelPath();
    files.forEach(fileNode => {
      const li = document.createElement('li'); li.className = 'file';
      const a = document.createElement('a'); a.href = toRootHref(fileNode.path); a.textContent = fileNode.name;
      const isActive = normalizePath(fileNode.path) === activeRel; if(isActive) a.classList.add('active');
      const wrap = document.createElement('div'); wrap.className = 'node' + (isActive ? ' active' : ''); wrap.appendChild(a);
      li.appendChild(wrap); ul.appendChild(li);
    });
    container.appendChild(ul);
  }
  function buildLeftTree(posts){ const mount = $('#tree'); if(!mount) return; mount.innerHTML=''; renderTree(mount, buildTree(posts)); const active = $(`.node.active`); if(active){ let p = active.parentElement; while(p && p !== mount){ if(p.classList.contains('children')) p.parentElement.classList.add('open'); p = p.parentElement; } } }
  function buildRightTags(posts){ const map = new Map(); (posts||[]).forEach(p => (p.tags||[]).forEach(t => map.set(t, (map.get(t)||0)+1))); const list = $('#tag-list'); if(!list) return; list.innerHTML=''; [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([tag,count])=>{ const li = document.createElement('li'); const a = document.createElement('a'); a.href = toRootHref(`index.html?tag=${encodeURIComponent(tag)}`); a.textContent = tag; a.addEventListener('click',(ev)=>{ if(ev.shiftKey||ev.ctrlKey||ev.metaKey){ ev.preventDefault(); const inp=$('#search-input'); if(inp){ inp.value=(inp.value+` tag:${tag}`).trim(); runSearchFromUI(); } } }); const c = document.createElement('span'); c.className='count'; c.textContent=count; li.appendChild(a); li.appendChild(c); list.appendChild(li); }); }
  function chip(tag){ const a=document.createElement('a'); a.className='tag-chip'; a.href=toRootHref(`index.html?tag=${encodeURIComponent(tag)}`); a.textContent=`#${tag}`; a.addEventListener('click',(ev)=>{ if(ev.shiftKey||ev.ctrlKey||ev.metaKey){ ev.preventDefault(); const inp=$('#search-input'); if(inp){ inp.value=(inp.value+` tag:${tag}`).trim(); runSearchFromUI(); } } }); return a; }

  // ---------- Index page ----------
  function renderList(posts){ const list=$('#recent-list'); if(!list) return; list.innerHTML=''; posts.forEach(p=>{ const li=document.createElement('li'); li.className='post-item'; const link=document.createElement('a'); link.href=toRootHref(p.path); link.textContent=p.title; const meta=document.createElement('div'); meta.className='meta'; const date=document.createElement('span'); date.textContent=p.date?new Date(p.date).toLocaleDateString():''; meta.appendChild(date); (p.tags||[]).forEach(t=>meta.appendChild(chip(t))); li.appendChild(link); li.appendChild(meta); list.appendChild(li); }); }
  function buildIndex(posts){ const tag=qs().get('tag'); const sorted=(posts||[]).slice().sort(byDateDesc); const shown=tag?sorted.filter(p=>(p.tags||[]).includes(tag)):sorted; if($('#main-title')) $('#main-title').textContent=tag?`Posts tagged “${tag}”`:'Recent Posts'; if($('#tag-context')) $('#tag-context').innerHTML=tag?`<a class="tag-chip" href="${toRootHref('index.html')}">Clear tag</a>`:''; renderList(shown); }

  // ---------- Daily prev/next ----------
  function parseDateOrFallback(p){
    if(p.date) return p.date;
    const m = p.path && p.path.match(/\/Daily\/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }
  function addDailyNav(posts, entry){
    if(!entry || !/^posts\/Daily\//.test(entry.path)) return; // not a Daily post
    const daily = (posts||[]).filter(x => /^posts\/Daily\//.test(x.path))
      .map(x => ({ ...x, _d: parseDateOrFallback(x) }))
      .filter(x => x._d)
      .sort((a,b) => a._d.localeCompare(b._d)); // ascending

    const idx = daily.findIndex(x => x.path === entry.path);
    if(idx === -1) return;
    const prev = daily[idx-1];
    const next = daily[idx+1];

    const article = $('#post-article');
    const h1 = article?.querySelector('h1');

    // Ensure title is the ISO date for Daily posts
    if(h1 && entry.date) h1.textContent = entry.date;

    // Group prev/next close together
    const nav = document.createElement('div');
    nav.className = 'daily-nav';
    nav.style.display = 'flex';
    nav.style.justifyContent = 'flex-start';
    nav.style.gap = '10px';
    const parts = [];
    if(prev) parts.push(`<a class="prev" href="${toRootHref(prev.path)}">← ${prev.date || prev._d}</a>`);
    if(next) parts.push(`<a class="next" href="${toRootHref(next.path)}">${next.date || next._d} →</a>`);
    nav.innerHTML = parts.join(' <span class="sep">•</span> ');

    // Place directly under the title (before meta)
    if(h1) h1.insertAdjacentElement('afterend', nav);
    else article?.insertAdjacentElement('afterbegin', nav);
  }

  // ---------- Post page augment ----------
  function enhancePostPage(posts){
    const article=$('#post-article'); if(!article) return;
    let metaWrap=$('#post-meta', article); if(!metaWrap){ metaWrap=document.createElement('div'); metaWrap.id='post-meta'; const h1=article.querySelector('h1'); (h1||article).insertAdjacentElement('afterend', metaWrap); }

    const rel=currentRelPath();
    const entry=(posts||[]).find(p=>normalizePath(p.path)===rel);

    const tagsFromMeta=()=>{ const m=document.querySelector('meta[name="tags"], meta[name="keywords"]'); return m?m.getAttribute('content').split(',').map(s=>s.trim()).filter(Boolean):[]; };
    const dateFromMeta=()=>document.querySelector('meta[name="date"], time[datetime]')?.getAttribute('content')||'';

    // Remove any existing legacy backlink
    $$('.backlink', article).forEach(el => el.remove());

    metaWrap.innerHTML='';
    const isDaily = entry && /^posts\/Daily\//.test(entry.path);
    const dateText=entry?.date||dateFromMeta();
    if(dateText && !isDaily){ // omit date subheading on Daily posts
      const d=document.createElement('span'); d.className='muted'; d.textContent=new Date(dateText).toLocaleDateString(); metaWrap.appendChild(d);
    }
    const tags=entry?.tags||tagsFromMeta(); tags.forEach(t=>metaWrap.appendChild(chip(t)));

    // No "Back to Home" link (removed by request)

    // Add Daily prev/next when applicable
    addDailyNav(posts, entry);
  }

  // ---------- MathJax ----------
  function ensureMathJax(){ if(window.MathJax){ if(window.MathJax.typesetPromise) window.MathJax.typesetPromise(); return; } if(document.querySelector('script[data-mathjax]')) return; window.MathJax={ tex:{ inlineMath:[["$","$"],["\\(","\\)"]], displayMath:[["$$","$$"],["\\[","\\]"]] }, options:{ skipHtmlTags:['script','noscript','style','textarea','pre','code'] } }; const s=document.createElement('script'); s.async=true; s.src='https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'; s.setAttribute('data-mathjax','true'); document.head.appendChild(s); }

  // ---------- Search (titles + full content, multi‑tag) ----------
  async function buildSearchIndex(posts){
    // On file:// avoid fetch() to each post (blocked in some browsers)
    if (location.protocol === 'file:') {
      window.SEARCH_INDEX = (posts || []).map(p => ({ ...p, _text: (p.title || '').toLowerCase() }));
      return;
    }

    const status=$('#search-status');
    const show=m=>{ if(status){ status.style.display='block'; status.textContent=m; } };
    const hide=()=>{ if(status){ status.style.display='none'; status.textContent=''; } };
    const signature=JSON.stringify({ n:posts.length, last: posts[0]?.date || '' });
    const cached=localStorage.getItem('SEARCH_INDEX_V1');
    const cachedSig=localStorage.getItem('SEARCH_INDEX_SIG_V1');
    if(cached && cachedSig===signature){ try{ window.SEARCH_INDEX=JSON.parse(cached); return; }catch(e){} }
    show('Building search index…');
    const parser=new DOMParser();
    const index=await Promise.all((posts||[]).map(async p=>{ try{ const res=await fetch(toRootHref(p.path), { cache:'no-store' }); const html=await res.text(); const doc=parser.parseFromString(html,'text/html'); const target=doc.querySelector('#post-article')||doc.querySelector('article')||doc.body; const content=(target?.textContent||'').replace(/\s+/g,' ').trim(); return { ...p, _text: (p.title+' '+content).toLowerCase() }; }catch(e){ return { ...p, _text: (p.title||'').toLowerCase() }; } }));
    window.SEARCH_INDEX=index; try{ localStorage.setItem('SEARCH_INDEX_V1', JSON.stringify(index)); localStorage.setItem('SEARCH_INDEX_SIG_V1', signature); }catch(e){} hide(); }
  function parseQuery(q){ const terms=[]; const tags=[]; (q||'').split(/\s+/).filter(Boolean).forEach(tok=>{ if(/^tag:/i.test(tok)) tags.push(tok.slice(4).toLowerCase()); else if(/^#/.test(tok)) tags.push(tok.slice(1).toLowerCase()); else terms.push(tok.toLowerCase()); }); return { terms, tags }; }
  function searchPosts(q){ const {terms,tags}=parseQuery(q); const src=window.SEARCH_INDEX||window.POSTS||[]; const andMatch=(text, need)=>need.every(t=>text.includes(t)); return src.filter(p=>{ const text=(p._text||(p.title||'').toLowerCase()); const hasTerms=terms.length?andMatch(text,terms):true; const ptags=(p.tags||[]).map(s=>s.toLowerCase()); const hasTags=tags.length?tags.every(t=>ptags.includes(t)):true; return hasTerms && hasTags; }).sort(byDateDesc); }
  function runSearchFromUI(){ const input=$('#search-input'); if(!input) return; const q=input.value.trim(); const list=$('#recent-list'); if(!list){ const dest=q?`index.html?q=${encodeURIComponent(q)}`:'index.html'; location.href=toRootHref(dest); return; } if(!q){ if($('#main-title')) $('#main-title').textContent='Recent Posts'; if($('#tag-context')) $('#tag-context').innerHTML=''; renderList((window.POSTS||[]).slice().sort(byDateDesc)); history.replaceState(null,'',toRootHref('index.html')); return; } const results=searchPosts(q); if($('#main-title')) $('#main-title').textContent='Search results'; if($('#tag-context')) $('#tag-context').textContent=`${results.length} result${results.length!==1?'s':''} for “${q}”`; renderList(results); const url=new URL(location.href); url.search=`?q=${encodeURIComponent(q)}`; history.replaceState(null,'',url); }
  function wireSearchUI(){ const form=$('#search-form'); const input=$('#search-input'); const clearBtn=$('#search-clear'); if(form && input){ form.addEventListener('submit',e=>{ e.preventDefault(); runSearchFromUI(); }); input.addEventListener('keydown',e=>{ if(e.key==='Escape'){ input.value=''; runSearchFromUI(); }}); clearBtn?.addEventListener('click',()=>{ input.value=''; runSearchFromUI(); }); window.addEventListener('keydown',e=>{ if(e.key==='/' && document.activeElement !== input){ e.preventDefault(); input.focus(); } }); const q=qs().get('q'); if(q){ input.value=q; } } }

  // ---------- Collapsible sidebars + footer year ----------
  function wireChrome(){ const yEl=$('#year'); if(yEl) yEl.textContent=new Date().getFullYear(); const layout=$('.layout'); const setToggleState=(btn, active)=>btn && btn.setAttribute('aria-expanded', String(active)); const toggleLeftBtn=$('#toggle-left'); const toggleRightBtn=$('#toggle-right'); const isLeftHidden=()=>layout?.classList.contains('hide-left'); const isRightHidden=()=>layout?.classList.contains('hide-right'); toggleLeftBtn?.addEventListener('click',()=>{ layout?.classList.toggle('hide-left'); setToggleState(toggleLeftBtn,!isLeftHidden()); $('#sidebar-left')?.classList.toggle('open'); }); toggleRightBtn?.addEventListener('click',()=>{ layout?.classList.toggle('hide-right'); setToggleState(toggleRightBtn,!isRightHidden()); }); }

  // ---------- Init ----------
  async function init(){
    ensureShell();
    const posts = await loadManifest();
    window.POSTS = posts;
    await buildSearchIndex(posts);
    buildLeftTree(posts);
    buildRightTags(posts);

    const q = qs().get('q');
    const hasIndex = !!$('#recent-list');
    if(hasIndex){ if(q){ if($('#main-title')) $('#main-title').textContent = 'Search results'; runSearchFromUI(); } else { buildIndex(posts); } }
    else if(q) { location.href = toRootHref(`index.html?q=${encodeURIComponent(q)}`); return; }

    enhancePostPage(posts);
    wireSearchUI();
    wireChrome();
    ensureMathJax();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
