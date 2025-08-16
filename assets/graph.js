(function () {
  // Public API
  const GraphView = {
    init(options = {}) {
      opts = options;
      injectStyles();
      ensureGraphOverlay();
      wireGraphUI();
    },
    open() { openGraph(); },
    close() { closeGraph(); },
    render(g) { renderGraph(g); }
  };

  // Keep local, injected dependencies
  let opts = {
    toRootHref: (p) => p,
    navigateTo: (href) => (location.href = href),
    SPA_ENABLED: false,
    normalizePath: (p) => String(p || '').replace(/^\/+/, '').replace(/\\+/g, '/'),
  };

  // Style (moved from site.js -> graph-specific only)
  function injectStyles() {
    if (document.querySelector('#graph-style')) return;
    const s = document.createElement('style');
    s.id = 'graph-style';
    s.textContent = `
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

  // Overlay
  function ensureGraphOverlay(){
    if(document.querySelector('#graph-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'graph-overlay';
    ov.innerHTML = `
      <div class="panel">
        <div class="graph-toolbar">
          <div class="title">Graph View</div>
          <div class="tools">
            <button id="graph-close" class="ghost" type="button">Close</button>
          </div>
        </div>
        <svg id="graph-svg" class="graph-canvas" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid meet" aria-label="Posts link graph"></svg>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e)=>{ if(e.target === ov) closeGraph(); });
    ov.querySelector('#graph-close')?.addEventListener('click', closeGraph);
  }

  function wireGraphUI(){
    ensureGraphOverlay();
    const btn = document.querySelector('#graph-btn');
    if(btn && !btn._wired){ btn._wired = true; btn.addEventListener('click', openGraph); }
  }

  // Lazy-load d3
  function ensureD3(){
    return new Promise((resolve, reject)=>{
      if(window.d3 && d3.forceSimulation){ return resolve(window.d3); }
      const existing = document.querySelector('script[data-d3]');
      if(existing){
        const check = () => (window.d3 && d3.forceSimulation) ? resolve(window.d3) : setTimeout(check, 25);
        return check();
      }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js';
      s.async = true; s.setAttribute('data-d3','true');
      s.onload = () => resolve(window.d3);
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  let SIM = null; // d3 simulation handle

  function openGraph(){
    ensureGraphOverlay();
    const ov = document.querySelector('#graph-overlay'); if(!ov) return;
    ensureD3().then(()=>{
      renderGraph(window.LINK_GRAPH || { nodes: window.POSTS||[], edges: [] });
      ov.style.display = 'block';
    }).catch(err=>{
      console.error('[graph] d3 load failed', err);
      alert('Failed to load graph dependencies.');
    });
  }
  function closeGraph(){
    const ov = document.querySelector('#graph-overlay'); if(ov) ov.style.display = 'none';
    if(SIM && typeof SIM.stop === 'function'){ SIM.stop(); }
    SIM = null;
  }

  function renderGraph(graph){
    const { normalizePath, toRootHref, navigateTo, SPA_ENABLED } = opts;
    const svg = d3.select('#graph-svg'); if(svg.empty()) return;
    const W = 1200, H = 800; // viewBox size
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();

    const world = svg.append('g').attr('class','world');

    // Build nodes (id = normalized path)
    const rawNodes = (graph.nodes||[]).map(p=>({
      id: normalizePath(p.path),
      title: p.title || (p.path.split('/').pop()||'').replace(/\.html$/,''),
      path: p.path
    }));
    const nodeMap = new Map(rawNodes.map(n=>[n.id, n]));

    // Undirected edges for drawing (only edges whose nodes exist)
    const edges = (graph.edges||[])
      .map(e=>({ source: normalizePath(e.source), target: normalizePath(e.target) }))
      .filter(e=> nodeMap.has(e.source) && nodeMap.has(e.target));

    // Compute indegree from SEARCH_INDEX directed links (content links only)
    const indegree = new Map(rawNodes.map(n=>[n.id, 0]));
    const idx = window.SEARCH_INDEX || [];
    idx.forEach(p=>{ (p._links||[]).forEach(to=>{ const t = normalizePath(to); if(indegree.has(t)) indegree.set(t, indegree.get(t)+1); }); });
    let minD = Infinity, maxD = -Infinity; indegree.forEach(v=>{ if(v<minD) minD=v; if(v>maxD) maxD=v; });
    const rMin = 8, rMax = 28;
    function rFor(id){ const v = indegree.get(id) || 0; if(!(maxD>minD)) return (rMin+rMax)/2; return rMin + (v - minD) * (rMax-rMin) / (maxD-minD); }
    rawNodes.forEach(n=>{ n.r = rFor(n.id); });

    // Layers
    const link = world.append('g').attr('class', 'link-layer')
      .attr('stroke','currentColor').attr('stroke-opacity',0.45)
      .selectAll('line').data(edges).join('line');

    world.append('g').attr('class', 'node-layer')
      .selectAll('circle').data(rawNodes).join('circle')
        .attr('r', d=>d.r)
        .attr('fill', '#2a76ff')
        .attr('opacity', 0.9)
        .attr('stroke', 'currentColor')
        .attr('stroke-opacity', 0.5)
        .style('cursor','pointer')
        .on('click', (ev,d)=>{ closeGraph(); const href = toRootHref(d.path); if(SPA_ENABLED) navigateTo(href); else location.href = href; })
        .append('title').text(d=>d.title);

    // d3-force simulation
    const sim = d3.forceSimulation(rawNodes)
      .force('link', d3.forceLink(edges).id(d=>d.id).distance(150).strength(0.05))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(W/2, H/2))
      .force('collide', d3.forceCollide().radius(d=>d.r + 6).iterations(2));
    SIM = sim;

    // Drag
    const drag = d3.drag()
      .on('start', (event,d)=>{ if(!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event,d)=>{ d.fx = event.x; d.fy = event.y; })
      .on('end',   (event,d)=>{ if(!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; });
    svg.selectAll('circle').call(drag);

    sim.on('tick', ()=>{
      link
        .attr('x1', d=> d.source.x)
        .attr('y1', d=> d.source.y)
        .attr('x2', d=> d.target.x)
        .attr('y2', d=> d.target.y);
      svg.selectAll('circle')
        .attr('cx', d=>d.x)
        .attr('cy', d=>d.y);
    });
  }

  // expose
  window.GraphView = GraphView;
})();
