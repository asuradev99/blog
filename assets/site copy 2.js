(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const normalizePath = p => String(p||'').replace(/^\/+/, '').replace(/\\+/g,'/');
  const byDateDesc = (a, b) => new Date(b.date||0) - new Date(a.date||0);
  const qs = () => new URLSearchParams(location.search);

  // ---------- SPA settings ----------
  const SPA_ENABLED = location.protocol === 'http:' || location.protocol === 'https:';
  const PAGE_CACHE = new Map(); // path+search -> html text

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

  // ---------- Runtime layout/style injection ----------
  function applyRuntimeStyles(){
    if($('#runtime-style')) return;
    const s = document.createElement('style');
    s.id = 'runtime-style';
    s.textContent = `
      html, body { height: 100%; overflow: hidden; }
      body { font-size: 17px; }
      .topbar { position: fixed; left: 0; right: 0; top: 0; z-index: 10; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 8px 12px; }
      .topbar .brand { text-decoration: none; font-weight: 700; }
      .topbar .actions { display: inline-flex; gap: 8px; align-items: center; }
      .layout { height: calc(100vh - var(--topbar-h, 54px)); display: grid; gap: 0; grid-template-columns: var(--left-w,260px) 1fr var(--right-w,220px); }
      #content { overflow-y: auto; -webkit-overflow-scrolling: touch; scrollbar-gutter: stable both-edges; }
      .sidebar { overflow: hidden; }
      body > .layout { margin-top: var(--topbar-h, 54px); }

      /* Transparent scrollbar (track transparent, thumb only on hover) */
      #content::-webkit-scrollbar { width: 10px; background: transparent; }
      #content::-webkit-scrollbar-track { background: transparent; }
      #content::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0); border-radius: 8px; border: 3px solid transparent; background-clip: content-box; }
      #content:hover::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.18); }
      /* Firefox */
      #content { scrollbar-width: thin; scrollbar-color: transparent transparent; }
      #content:hover { scrollbar-color: rgba(255,255,255,0.18) transparent; }

      /* Content-only footer styling */
      .content-footer.footer { text-align: center; padding: 18px 0; opacity: .8; }

      /* Graph overlay */
      #graph-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 9999; display: none; }
      #graph-overlay .panel { position: absolute; left: 50%; top: 8%; transform: translateX(-50%); width: min(1100px, 92vw); height: min(740px, 84vh); background: var(--panel, #121825); border: 1px solid var(--border, #1f2635); border-radius: 12px; box-shadow: 0 10px 24px rgba(0,0,0,.45); display: flex; flex-direction: column; }
      .graph-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--border, #1f2635); }
      .graph-toolbar .title { font-weight: 600; opacity: .9; }
      .graph-canvas { flex: 1; }
      .ghost { background: transparent; color: var(--muted, #9aa4b2); border: 1px solid var(--border, #1f2635); padding: 6px 10px; border-radius: 8px; cursor: pointer; }
      .ghost:hover { color: var(--text,#e5e7eb); border-color: var(--accent-2,#7dd3fc); }
    `;
    document.head.appendChild(s);
  }
  function measureChrome(){
    const top = $('.topbar');
    const topH = top ? Math.ceil(top.getBoundingClientRect().height) : 54;
    document.documentElement.style.setProperty('--topbar-h', topH + 'px');
  }

  // Ensure a footer exists inside #content, remove any global footer
  function ensureContentFooter(){
    $$('.footer').forEach(f => { if(!f.closest('#content')) f.remove(); });
    const content = $('#content'); if(!content) return;
    let cf = content.querySelector('.content-footer.footer');
    if(!cf){
      cf = document.createElement('div');
      cf.className = 'content-footer footer muted';
      cf.innerHTML = `© <span class="year"></span> • Built with HTML/CSS/JS + MathJax`;
      content.appendChild(cf);
    }
    const yEl = cf.querySelector('.year'); if(yEl) yEl.textContent = new Date().getFullYear();
  }

  // ---------- Minimal shell injector (for bare post pages) ----------
  function ensureShell(){
    if ($('.layout')) {
      $$('.topnav').forEach(el=>el.remove()); // ensure old topnav removed
      if(!$('.topbar .actions')){ const actions=document.createElement('div'); actions.className='actions'; actions.innerHTML=`<button id="graph-btn" class="ghost" type="button">Graph</button>`; $('.topbar')?.appendChild(actions); }
      return;
    }
    const header = document.createElement('header');
    header.className = 'topbar';
    header.innerHTML = `
      <a class="brand" href="${toRootHref('index.html')}">My Minimal Blog</a>
      <form id="search-form" class="searchbar center" role="search" autocomplete="off">
        <input id="search-input" type="search" placeholder="Search… (use tag:foo tag:bar)" aria-label="Search posts" />
        <button id="search-clear" type="button" class="ghost tiny" aria-label="Clear search">×</button>
      </form>
      <div class="actions">
        <button id="graph-btn" class="ghost" type="button">Graph</button>
      </div>`;

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

    document.body.innerHTML = '';
    document.body.appendChild(header);
    document.body.appendChild(layout);

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
    ensureContentFooter();
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

  // ---------- Intro visibility helpers ----------
  function setIntroVisible(visible){ $$('#intro, #intro-section, .intro, .intro-block').forEach(el => { if(el) el.style.display = visible ? '' : 'none'; }); }
  function updateIntroVisibility(){ const p = qs(); const hasTag = !!p.get('tag'); const q = (p.get('q')||'').trim(); const showIntro = !(hasTag || q); setIntroVisible(showIntro); }

  // ---------- Sidebar (flat list — no directories) ----------
  function buildLeftTree(posts){
    const mount = $('#tree'); if(!mount) return;
    mount.innerHTML='';
    const ul = document.createElement('ul');
    ul.className = 'tree flat';
    const activeRel = currentRelPath();
    const files = (posts||[]).slice().sort((a,b)=> (a.title||'').localeCompare(b.title||''));
    files.forEach(p=>{
      const li = document.createElement('li'); li.className = 'file';
      const a = document.createElement('a'); a.href = toRootHref(p.path); a.textContent = p.title || (p.path.split('/').pop()||'').replace(/\.html$/,'');
      const isActive = normalizePath(p.path) === activeRel; if(isActive) a.classList.add('active');
      const wrap = document.createElement('div'); wrap.className = 'node' + (isActive ? ' active' : '');
      wrap.appendChild(a); li.appendChild(wrap); ul.appendChild(li);
    });
    mount.appendChild(ul);
  }

  // ---------- Tags (right sidebar) ----------
  function buildRightTags(posts){ const map = new Map(); (posts||[]).forEach(p => (p.tags||[]).forEach(t => map.set(t, (map.get(t)||0)+1))); const list = $('#tag-list'); if(!list) return; list.innerHTML=''; [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([tag,count])=>{ const li = document.createElement('li'); const a = document.createElement('a'); a.href = toRootHref(`index.html?tag=${encodeURIComponent(tag)}`); a.textContent = tag; a.addEventListener('click',(ev)=>{ if(ev.shiftKey||ev.ctrlKey||ev.metaKey){ ev.preventDefault(); const inp=$('#search-input'); if(inp){ inp.value=(inp.value+` tag:${tag}`).trim(); runSearchFromUI(); } } }); const c = document.createElement('span'); c.className='count'; c.textContent=count; li.appendChild(a); li.appendChild(c); list.appendChild(li); }); }
  function chip(tag){ const a=document.createElement('a'); a.className='tag-chip'; a.href=toRootHref(`index.html?tag=${encodeURIComponent(tag)}`); a.textContent=`#${tag}`; a.addEventListener('click',(ev)=>{ if(ev.shiftKey||ev.ctrlKey||ev.metaKey){ ev.preventDefault(); const inp=$('#search-input'); if(inp){ inp.value=(inp.value+` tag:${tag}`).trim(); runSearchFromUI(); } } }); return a; }

  // ---------- Index page ----------
  function renderList(posts){ const list=$('#recent-list'); if(!list) return; list.innerHTML=''; posts.forEach(p=>{ const li=document.createElement('li'); li.className='post-item'; const link=document.createElement('a'); link.href=toRootHref(p.path); link.textContent=p.title; const meta=document.createElement('div'); meta.className='meta'; const date=document.createElement('span'); date.textContent=p.date?new Date(p.date).toLocaleDateString():''; meta.appendChild(date); (p.tags||[]).forEach(t=>meta.appendChild(chip(t))); li.appendChild(link); li.appendChild(meta); list.appendChild(li); }); }
  function buildIndex(posts){ const tag=qs().get('tag'); const sorted=(posts||[]).slice().sort(byDateDesc); const shown=tag?sorted.filter(p=>(p.tags||[]).includes(tag)):sorted; if($('#main-title')) $('#main-title').textContent=tag?`Posts tagged “${tag}”`:'Recent Posts'; if($('#tag-context')) $('#tag-context').innerHTML=tag?`<a class="tag-chip" href="${toRootHref('index.html')}">Clear tag</a>`:''; renderList(shown); updateIntroVisibility(); ensureContentFooter(); }

  // ---------- Daily prev/next (defined by tag "daily") ----------
  const hasDailyTag = (p) => (p && (p.tags||[]).some(t => String(t).toLowerCase()==='daily'));
  function addDailyNav(posts, entry){
    if(!entry || !hasDailyTag(entry)) return;
    const daily = (posts||[])
      .filter(hasDailyTag)
      .slice()
      .sort((a,b)=> String(a.date||'').localeCompare(String(b.date||''))); // ascending by date string

    const idx = daily.findIndex(x => x.path === entry.path);
    if(idx === -1) return;
    const prev = daily[idx-1];
    const next = daily[idx+1];

    const article = $('#post-article');
    const h1 = article?.querySelector('h1');

    const nav = document.createElement('div');
    nav.className = 'daily-nav';
    nav.style.display = 'flex';
    nav.style.justifyContent = 'flex-start';
    nav.style.gap = '10px';
    const parts = [];
    if(prev) parts.push(`<a class="prev" href="${toRootHref(prev.path)}">← ${prev.title || prev.date || ''}</a>`);
    if(next) parts.push(`<a class="next" href="${toRootHref(next.path)}">${next.title || next.date || ''} →</a>`);
    nav.innerHTML = parts.join(' <span class="sep">•</span> ');

    if(h1) h1.insertAdjacentElement('afterend', nav); else article?.insertAdjacentElement('afterbegin', nav);
  }

  // ---------- Post page augment ----------
  function enhancePostPage(posts){
    const article=$('#post-article'); if(!article) return;
    let metaWrap=$('#post-meta', article); if(!metaWrap){ metaWrap=document.createElement('div'); metaWrap.id='post-meta'; const h1=article.querySelector('h1'); (h1||article).insertAdjacentElement('afterend', metaWrap); }

    const rel=currentRelPath();
    const entry=(posts||[]).find(p=>normalizePath(p.path)===rel);

    const tagsFromMeta=()=>{ const m=document.querySelector('meta[name="tags"], meta[name="keywords"]'); return m?m.getAttribute('content').split(',').map(s=>s.trim()).filter(Boolean):[]; };
    const dateFromMeta=()=>document.querySelector('meta[name="date"], time[datetime]')?.getAttribute('content')||'';

    // Remove any existing legacy backlink and don't add a new one
    $$('.backlink', article).forEach(el => el.remove());

    metaWrap.innerHTML='';
    const isDaily = hasDailyTag(entry);
    const dateText=entry?.date||dateFromMeta();
    if(dateText && !isDaily){ const d=document.createElement('span'); d.className='muted'; d.textContent=new Date(dateText).toLocaleDateString(); metaWrap.appendChild(d); }
    const tags=entry?.tags||tagsFromMeta(); tags.forEach(t=>metaWrap.appendChild(chip(t)));

    addDailyNav(posts, entry);
    ensureContentFooter();
  }

  // ---------- MathJax ----------
  function ensureMathJax(){ if(window.MathJax){ if(window.MathJax.typesetPromise) window.MathJax.typesetPromise(); return; } if(document.querySelector('script[data-mathjax]')) return; window.MathJax={ tex:{ inlineMath:[["$","$"],["\\(","\\)"]], displayMath:[["$$","$$"],["\\[","\\]"]] }, options:{ skipHtmlTags:['script','noscript','style','textarea','pre','code'] } }; const s=document.createElement('script'); s.async=true; s.src='https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'; s.setAttribute('data-mathjax','true'); document.head.appendChild(s); }

  // ---------- Search (titles + full content, multi‑tag) + LINK GRAPH ----------
  function relFromUrl(urlObj){
    const base = getSiteBase();
    let path = urlObj.pathname;
    if(path.startsWith(base)) path = path.slice(base.length);
    return normalizePath(path);
  }

  async function buildSearchIndex(posts){
    if (location.protocol === 'file:') {
      // Minimal index when running off file://
      window.SEARCH_INDEX = (posts || []).map(p => ({ ...p, _text: (p.title || '').toLowerCase(), _links: [] }));
      window.LINK_GRAPH = { nodes: posts.slice(), edges: [] };
      return;
    }

    const status=$('#search-status');
    const show=m=>{ if(status){ status.style.display='block'; status.textContent=m; } };
    const hide=()=>{ if(status){ status.style.display='none'; status.textContent=''; } };

    const signature=JSON.stringify({ n:posts.length, last: posts[0]?.date || '' });
    const cached=localStorage.getItem('SEARCH_INDEX_V2');
    const cachedSig=localStorage.getItem('SEARCH_INDEX_SIG_V2');
    if(cached && cachedSig===signature){ try{ const blob=JSON.parse(cached); window.SEARCH_INDEX=blob.index; window.LINK_GRAPH=blob.graph; return; }catch(e){} }

    show('Building search index…');
    const parser=new DOMParser();
    const pathsSet = new Set((posts||[]).map(p=>normalizePath(p.path)));

    const index=await Promise.all((posts||[]).map(async p=>{
      try{
        const res=await fetch(toRootHref(p.path), { cache:'no-store' });
        const html=await res.text();
        const doc=parser.parseFromString(html,'text/html');
        const target=doc.querySelector('#post-article')||doc.querySelector('article')||doc.body;
        const content=(target?.textContent||'').replace(/\s+/g,' ').trim();
        // collect links
        const aTags = Array.from(doc.querySelectorAll('a[href]'));
        const baseUrl = new URL(toRootHref(p.path), location.href);
        const links = [];
        aTags.forEach(a=>{
          try{
            const href=a.getAttribute('href'); if(!href) return;
            const abs = new URL(href, baseUrl);
            const rel = relFromUrl(abs);
            if(/^posts\/.+\.html$/i.test(rel) && pathsSet.has(rel)){
              if(!links.includes(rel)) links.push(rel);
            }
          }catch(_){/* ignore */}
        });
        return { ...p, _text: (p.title+' '+content).toLowerCase(), _links: links };
      }catch(e){ return { ...p, _text: (p.title||'').toLowerCase(), _links: [] }; }
    }));

    // Build undirected edge list (unique) and include Daily adjacency
    const key = (a,b) => {
      const aa = normalizePath(a), bb = normalizePath(b);
      return aa < bb ? aa+'|'+bb : bb+'|'+aa;
    };
    const seen = new Set();
    const edges = [];
    index.forEach(p=>{
      (p._links||[]).forEach(to => {
        const k = key(p.path, to);
        if(!seen.has(k)){ seen.add(k); edges.push({ source: p.path, target: to }); }
      });
    });
    const daily = index.filter(hasDailyTag).slice().sort((a,b)=> String(a.date||'').localeCompare(String(b.date||'')));
    for(let i=0;i<daily.length-1;i++){
      const a = daily[i].path, b = daily[i+1].path; const k = key(a,b);
      if(!seen.has(k)){ seen.add(k); edges.push({ source: a, target: b }); }
    }

    window.SEARCH_INDEX = index;
    window.LINK_GRAPH = { nodes: posts.slice(), edges };
    try{ localStorage.setItem('SEARCH_INDEX_V2', JSON.stringify({ index, graph: window.LINK_GRAPH })); localStorage.setItem('SEARCH_INDEX_SIG_V2', signature); }catch(e){}
    hide();
  }

  function parseQuery(q){ const terms=[]; const tags=[]; (q||'').split(/\s+/).filter(Boolean).forEach(tok=>{ if(/^tag:/i.test(tok)) tags.push(tok.slice(4).toLowerCase()); else if(/^#/.test(tok)) tags.push(tok.slice(1).toLowerCase()); else terms.push(tok.toLowerCase()); }); return { terms, tags }; }
  function searchPosts(q){ const {terms,tags}=parseQuery(q); const src=window.SEARCH_INDEX||window.POSTS||[]; const andMatch=(text, need)=>need.every(t=>text.includes(t)); return src.filter(p=>{ const text=(p._text||(p.title||'').toLowerCase()); const hasTerms=terms.length?andMatch(text,terms):true; const ptags=(p.tags||[]).map(s=>s.toLowerCase()); const hasTags=tags.length?tags.every(t=>ptags.includes(t)):true; return hasTerms && hasTags; }).sort(byDateDesc); }
  function runSearchFromUI(){ const input=$('#search-input'); if(!input) return; const q=input.value.trim(); const list=$('#recent-list'); if(!list){ const dest=q?`index.html?q=${encodeURIComponent(q)}`:'index.html'; if(SPA_ENABLED){ navigateTo(toRootHref(dest)); } else { location.href=toRootHref(dest); } return; } if(!q){ if($('#main-title')) $('#main-title').textContent='Recent Posts'; if($('#tag-context')) $('#tag-context').innerHTML=''; renderList((window.POSTS||[]).slice().sort(byDateDesc)); history.replaceState(null,'',toRootHref('index.html')); updateIntroVisibility(); ensureContentFooter(); return; } const results=searchPosts(q); if($('#main-title')) $('#main-title').textContent='Search results'; if($('#tag-context')) $('#tag-context').textContent=`${results.length} result${results.length!==1?'s':''} for “${q}”`; renderList(results); const url=new URL(location.href); url.search=`?q=${encodeURIComponent(q)}`; history.replaceState(null,'',url); updateIntroVisibility(); ensureContentFooter(); }
  function wireSearchUI(){ const form=$('#search-form'); const input=$('#search-input'); const clearBtn=$('#search-clear'); if(form && input){ form.addEventListener('submit',e=>{ e.preventDefault(); runSearchFromUI(); }); input.addEventListener('keydown',e=>{ if(e.key==='Escape'){ input.value=''; runSearchFromUI(); }}); clearBtn?.addEventListener('click',()=>{ input.value=''; runSearchFromUI(); }); window.addEventListener('keydown',e=>{ if(e.key==='/' && document.activeElement !== input){ e.preventDefault(); input.focus(); } }); const q=qs().get('q'); if(q){ input.value=q; } } }

  // ---------- Footer year + layout measuring ----------
  function wireChrome(){ applyRuntimeStyles(); measureChrome(); window.addEventListener('resize', measureChrome); wireGraphUI(); }

  // ---------- SPA navigation ----------
  function shouldIntercept(a, e){
    if(!SPA_ENABLED) return false;
    if(!a) return false;
    if(a.target && a.target !== '_self') return false;
    if(a.hasAttribute('download') || a.hasAttribute('data-no-spa')) return false;
    if(e && (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return false;
    const url = new URL(a.href, location.href);
    if(url.origin !== location.origin) return false;
    const base = getSiteBase();
    const rel = (url.pathname.startsWith(base) ? url.pathname.slice(base.length) : normalizePath(url.pathname));
    if (/^posts\/.+\.html$/i.test(rel)) return true;
    if (/index\.html$/i.test(rel) || rel === '' ) return true;
    return false;
  }

  async function navigateTo(href, opts={}){
    if(!SPA_ENABLED){ location.href = href; return; }
    const url = new URL(href, location.href);
    const cacheKey = url.pathname + url.search;
    let html;
    try{
      if(PAGE_CACHE.has(cacheKey)){
        html = PAGE_CACHE.get(cacheKey);
      } else {
        const res = await fetch(url.href, { cache: 'no-store' });
        if(!res.ok) throw new Error('Fetch failed');
        html = await res.text();
        PAGE_CACHE.set(cacheKey, html);
      }
    }catch(err){ location.href = url.href; return; }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const fetchedArticle = doc.querySelector('#post-article');
    const fetchedMain = doc.querySelector('#content');
    const content = $('#content');
    if(fetchedArticle){ content.innerHTML = ''; content.appendChild(fetchedArticle.cloneNode(true)); }
    else if(fetchedMain){ content.innerHTML = fetchedMain.innerHTML; }
    else { content.innerHTML = doc.body.innerHTML; }

    const newTitle = doc.querySelector('meta[name="title"]')?.getAttribute('content') || doc.title;
    if(newTitle) document.title = newTitle;

    if(opts.replace) history.replaceState({}, '', url.href); else history.pushState({}, '', url.href);

    wireSearchUI();
    const posts = window.POSTS || [];
    buildLeftTree(posts);
    buildRightTags(posts);

    if($('#post-article')){ enhancePostPage(posts); }
    else if($('#recent-list')){
      const q = qs().get('q');
      if(q){ const input=$('#search-input'); if(input) input.value=q; runSearchFromUI(); }
      else { buildIndex(posts); }
    }

    updateIntroVisibility();
    ensureMathJax();
    try{ window.MathJax?.typesetPromise?.(); }catch(_){}
    const scroller = $('#content');
    scroller && (scroller.scrollTop = 0);
    ensureContentFooter();
  }

  document.addEventListener('click', (e)=>{
    const a = e.target.closest('a');
    if(shouldIntercept(a, e)){
      e.preventDefault();
      navigateTo(a.href);
    }
  });
  document.addEventListener('mouseover', (e)=>{
    const a = e.target.closest('a');
    if(!shouldIntercept(a)) return;
    const url = new URL(a.href, location.href);
    const key = url.pathname + url.search;
    if(!PAGE_CACHE.has(key)){
      fetch(url.href, { cache: 'no-store' }).then(r=> r.ok ? r.text() : Promise.reject()).then(t=> PAGE_CACHE.set(key, t)).catch(()=>{});
    }
  });
  window.addEventListener('popstate', ()=>{ navigateTo(location.href, { replace: true }); });

  // ---------- Graph View ----------
  function ensureGraphOverlay(){
    if($('#graph-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'graph-overlay';
    ov.innerHTML = `
      <div class="panel">
        <div class="graph-toolbar">
          <div class="title">Graph View</div>
          <div class="tools">
            <button id=\"graph-close\" class=\"ghost\" type=\"button\">Close</button>
          </div>
        </div>
        <svg id="graph-svg" class="graph-canvas" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid meet" aria-label="Posts link graph"></svg>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e)=>{ if(e.target === ov) closeGraph(); });
    $('#graph-close', ov)?.addEventListener('click', closeGraph);
  }

  function wireGraphUI(){
    ensureGraphOverlay();
    const btn = $('#graph-btn');
    if(btn && !btn._wired){ btn._wired = true; btn.addEventListener('click', openGraph); }
  }

  let SIM = null; // current simulation handle

  function openGraph(){
    ensureGraphOverlay();
    const ov = $('#graph-overlay'); if(!ov) return;
    renderGraph(window.LINK_GRAPH || { nodes: window.POSTS||[], edges: [] });
    ov.style.display = 'block';
  }
  function closeGraph(){
    const ov = $('#graph-overlay'); if(ov) ov.style.display = 'none';
    if(SIM && SIM.raf){ cancelAnimationFrame(SIM.raf); }
    SIM = null;
  }

  function renderGraph(graph){
    const svg = $('#graph-svg'); if(!svg) return;
    const W = 1200, H = 800; // viewBox size
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    while(svg.firstChild) svg.removeChild(svg.firstChild);

    const nodes = (graph.nodes||[]).map(p=>({ id: p.path, title: p.title || p.path.split('/').pop().replace(/\.html$/,''), path: p.path }));
    const nodeMap = new Map(nodes.map(n=>[normalizePath(n.id), n]));
    const edges = (graph.edges||[]).filter(e=> nodeMap.has(normalizePath(e.source)) && nodeMap.has(normalizePath(e.target)))
      .map(e=>({ source: normalizePath(e.source), target: normalizePath(e.target) }));

    // Initial positions around center with jitter
    const cx = W/2, cy = H/2; const spread = Math.min(W,H)/4;
    nodes.forEach((n,i)=>{
      n.x = cx + (Math.random()-0.5)*spread;
      n.y = cy + (Math.random()-0.5)*spread;
      const len = Math.max(6, Math.min(32, n.title.length));
      n.rx = 18 + len * 3.2; n.ry = 16;
      n.vx = 0; n.vy = 0; n.fixed = false;
    });

    // Build adjacency for quick spring application
    const adj = new Map(nodes.map(n=>[normalizePath(n.id), []]));
    edges.forEach(e=>{ adj.get(e.source).push(e.target); adj.get(e.target).push(e.source); });

    // SVG groups
    const gl = document.createElementNS('http://www.w3.org/2000/svg','g');
    gl.setAttribute('stroke','currentColor'); gl.setAttribute('opacity','0.45'); gl.setAttribute('fill','none');
    svg.appendChild(gl);

    const ng = document.createElementNS('http://www.w3.org/2000/svg','g');
    svg.appendChild(ng);

    // Draw lines (edges)
    const lineByKey = new Map();
    edges.forEach(e=>{
      const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      gl.appendChild(line);
      lineByKey.set(e.source+'|'+e.target, line);
    });

    // Draw nodes (ellipse + label inside a <g>)
    nodes.forEach(nd=>{
      const g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.setAttribute('transform', `translate(${nd.x},${nd.y})`);
      g.style.cursor = 'pointer';
      const ell = document.createElementNS('http://www.w3.org/2000/svg','ellipse');
      ell.setAttribute('rx', nd.rx);
      ell.setAttribute('ry', nd.ry);
      ell.setAttribute('fill','transparent');
      ell.setAttribute('stroke','currentColor');
      ell.setAttribute('opacity','0.9');
      const text = document.createElementNS('http://www.w3.org/2000/svg','text');
      text.setAttribute('text-anchor','middle');
      text.setAttribute('dominant-baseline','middle');
      text.setAttribute('font-size','12');
      text.textContent = nd.title;
      g.appendChild(ell); g.appendChild(text);
      g.addEventListener('click', ()=>{
        closeGraph();
        const href = toRootHref(nd.path);
        if(SPA_ENABLED) navigateTo(href); else location.href = href;
      });
      enableDrag(svg, g, nd);
      nd._g = g;
      ng.appendChild(g);
    });

    // --------- Force simulation (dependency-free) ---------
    const params = {
      repulsion: 1600,   // higher → more spread
      springK: 0.02,     // spring stiffness
      springLen: 150,    // natural length
      damping: 0.85,     // velocity decay
      centerK: 0.015,    // pull to center
      dt: 0.016,
      margin: 40
    };

    function step(){
      // Reset forces
      nodes.forEach(n => { n.fx = 0; n.fy = 0; });

      // Repulsive forces (O(n^2) — fine for modest graphs)
      for(let i=0;i<nodes.length;i++){
        for(let j=i+1;j<nodes.length;j++){
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx*dx + dy*dy; if(d2 < 25) d2 = 25; // avoid singularity
          const f = params.repulsion / d2; // Coulomb-like
          const invd = 1/Math.sqrt(d2);
          const fx = f * dx * invd, fy = f * dy * invd;
          a.fx += fx; a.fy += fy; b.fx -= fx; b.fy -= fy;
        }
      }

      // Spring forces along edges
      edges.forEach(e=>{
        const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx,dy));
        const disp = dist - params.springLen;
        const F = params.springK * disp;
        const fx = F * dx / dist, fy = F * dy / dist;
        a.fx += fx; a.fy += fy; b.fx -= fx; b.fy -= fy;
      });

      // Gravity toward center
      nodes.forEach(n=>{
        n.fx += (cx - n.x) * params.centerK;
        n.fy += (cy - n.y) * params.centerK;
      });

      // Integrate
      nodes.forEach(n=>{
        if(n.fixed) return; // dragged
        n.vx = (n.vx + n.fx * params.dt) * params.damping;
        n.vy = (n.vy + n.fy * params.dt) * params.damping;
        n.x += n.vx; n.y += n.vy;
        // keep within bounds
        if(n.x < params.margin) { n.x = params.margin; n.vx *= -0.3; }
        if(n.x > W-params.margin) { n.x = W-params.margin; n.vx *= -0.3; }
        if(n.y < params.margin) { n.y = params.margin; n.vy *= -0.3; }
        if(n.y > H-params.margin) { n.y = H-params.margin; n.vy *= -0.3; }
      });

      // Apply to DOM
      nodes.forEach(n=>{ n._g.setAttribute('transform', `translate(${n.x},${n.y})`); });
      edges.forEach(e=>{
        const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
        const line = lineByKey.get(e.source+'|'+e.target) || lineByKey.get(e.target+'|'+e.source);
        if(line){ line.setAttribute('x1', a.x); line.setAttribute('y1', a.y); line.setAttribute('x2', b.x); line.setAttribute('y2', b.y); }
      });
    }

    function animate(){ step(); SIM && (SIM.raf = requestAnimationFrame(animate)); }

    SIM = { raf: null };
    animate();

    // Helpers: basic drag on nodes
    function svgPoint(evt){
      const rect = svg.getBoundingClientRect();
      const x = (evt.clientX - rect.left) / rect.width * W;
      const y = (evt.clientY - rect.top) / rect.height * H;
      return { x, y };
    }
    function enableDrag(svg, g, node){
      let dragging = false;
      g.addEventListener('pointerdown', (e)=>{
        dragging = true; node.fixed = true; g.setPointerCapture(e.pointerId);
      });
      g.addEventListener('pointermove', (e)=>{
        if(!dragging) return; const p = svgPoint(e); node.x = p.x; node.y = p.y; node.vx = 0; node.vy = 0;
      });
      g.addEventListener('pointerup', ()=>{ dragging = false; node.fixed = false; });
      g.addEventListener('pointercancel', ()=>{ dragging = false; node.fixed = false; });
    }
  }

  // ---------- Init ----------
  async function init(){
    applyRuntimeStyles();
    ensureShell();
    $$('.topnav').forEach(el=>el.remove()); // keep topnav removed

    const posts = await loadManifest();
    window.POSTS = posts;
    await buildSearchIndex(posts);
    buildLeftTree(posts);
    buildRightTags(posts);

    const q = qs().get('q');
    const hasIndex = !!$('#recent-list');
    if(hasIndex){ if(q){ if($('#main-title')) $('#main-title').textContent = 'Search results'; runSearchFromUI(); } else { buildIndex(posts); } updateIntroVisibility(); }
    else if(q) { if(SPA_ENABLED) { navigateTo(toRootHref(`index.html?q=${encodeURIComponent(q)}`), { replace:true }); return; } else { location.href = toRootHref(`index.html?q=${encodeURIComponent(q)}`); return; } }

    enhancePostPage(posts);
    wireSearchUI();
    wireChrome();
    ensureMathJax();
    measureChrome();
    ensureContentFooter();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
