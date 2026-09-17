const $ = (selector, root = document) => root.querySelector(selector);
const esc = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]
  );
const safe = value => {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "#";
  } catch {
    return "#";
  }
};
const paths = {
  lens: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M10.5 7v7M7 10.5h7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  branch:
    '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m0-4h5a7 7 0 0 0 7-4"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  link: '<path d="m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)"/>',
  file: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 10v4M10 12h4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  spark:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
const sections = [
  ["overview", "grid", "数据概览"],
  ["brands", "target", "品牌与竞品"],
  ["queries", "branch", "查询展开"],
  ["calls", "clock", "调用记录"],
  ["domains", "globe", "来源分布"],
  ["sources", "link", "来源与引用"],
  ["answer", "file", "最终回答"],
  ["method", "settings", "数据说明"],
];
let report,
  history = [],
  config = { configured: false, model: "gpt-6-astra" },
  filter = "",
  citedOnly = "all",
  controller;
const offline = !!window.__REPORT__;
const hosted = !!window.__HOSTED__ && !offline;
const rawById = new Map();
const date = value =>
  new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
async function api(path, options = {}) {
  if (hosted) return hostedApi(path, options);
  const res = await fetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}
async function lensDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("goglobal-ai-search-lens", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("reports", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function savedReports(value) {
  const db = await lensDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("reports", value ? "readwrite" : "readonly"),
        store = tx.objectStore("reports");
      const req = value ? store.put(value) : store.getAll();
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function hostedApi(path, options = {}) {
  if (path === "/api/reports") {
    try {
      return (await savedReports())
        .map(e => ({
          id: e.id,
          query: e.report.query,
          createdAt: e.report.createdAt,
          demo: e.report.demo,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }
  if (path.startsWith("/api/reports/")) {
    const id = path.split("/")[3],
      entry = (await savedReports()).find(e => e.id === id);
    if (!entry) throw new Error("找不到此浏览器中保存的报告");
    rawById.set(id, entry.raw);
    return entry.report;
  }
  const endpoint = "/tools/ai-search-lens/api/" + path.split("/").pop();
  const response = await fetch(endpoint, options),
    data = await response.json();
  if (!response.ok) {
    if (response.status === 401)
      throw new Error(
        "请先登录 Goglobal，再运行真实研究。可通过页面右上角的登录入口继续。"
      );
    if (response.status === 429)
      throw new Error("请求频率已达上限，请稍后重试。");
    throw new Error(data.error || "请求失败");
  }
  if (data.report && data.raw) {
    rawById.set(data.report.id, data.raw);
    if (path !== "/api/demo") {
      try {
        await savedReports({
          id: data.report.id,
          report: data.report,
          raw: data.raw,
        });
      } catch {
        toast("浏览器存储不可用，请立即导出报告留存。");
      }
    }
    return data.report;
  }
  return data;
}

function download(name, data, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function sourceLink(url, title) {
  return `<a href="${esc(safe(url))}" target="_blank" rel="noopener noreferrer">${esc(title)} ${icon("external")}</a>`;
}
function markdown(text, citations = []) {
  function inline(value) {
    let out = "",
      cursor = 0;
    const tokens =
      /\uE000(\d+)\uE001|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
    for (const m of value.matchAll(tokens)) {
      out += esc(value.slice(cursor, m.index));
      if (m[1] !== undefined) out += citations[Number(m[1])] || esc(m[0]);
      else if (m[2])
        out += `<a href="${esc(safe(m[3]))}" target="_blank" rel="noopener noreferrer">${esc(m[2])}</a>`;
      else if (m[4]) out += `<strong>${esc(m[4])}</strong>`;
      else out += `<code>${esc(m[5])}</code>`;
      cursor = m.index + m[0].length;
    }
    return out + esc(value.slice(cursor));
  }
  const lines = text.split("\n");
  let out = "",
    paragraph = [],
    items = [];
  const flush = () => {
    if (paragraph.length) {
      out += `<p>${inline(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`;
      paragraph = [];
    }
    if (items.length) {
      out += `<ul>${items.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`;
      items = [];
    }
  };
  const cells = line =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map(x => x.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      flush();
      const code = [];
      while (++i < lines.length && !lines[i].startsWith("```"))
        code.push(lines[i]);
      out += `<pre><code>${esc(code.join("\n"))}</code></pre>`;
      continue;
    }
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])
    ) {
      flush();
      const headers = cells(line);
      i++;
      const rows = [];
      while (i + 1 < lines.length && lines[i + 1].includes("|"))
        rows.push(cells(lines[++i]));
      out += `<div class="table-scroll"><table><thead><tr>${headers.map(x => `<th>${inline(x)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(x => `<td>${inline(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      flush();
      out += `<h3>${inline(line.replace(/^#{1,6}\s+/, ""))}</h3>`;
      continue;
    }
    if (/^\s*[-*]\s/.test(line)) {
      if (paragraph.length) flush();
      items.push(line.replace(/^\s*[-*]\s+/, ""));
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (items.length) flush();
    paragraph.push(line);
  }
  flush();
  return out;
}
function citedAnswer(answer) {
  const chars = Array.from(answer.text),
    annotations = [...answer.annotations].sort((a, b) => a.start - b.start),
    links = [];
  let cursor = 0,
    out = "";
  for (const a of annotations) {
    if (
      !Number.isInteger(a.start) ||
      !Number.isInteger(a.end) ||
      a.start < cursor ||
      a.end < a.start ||
      a.end > chars.length
    )
      continue;
    out += chars.slice(cursor, a.start).join("");
    out += `\uE000${links.length}\uE001`;
    links.push(
      `<a class="inline-citation" href="${esc(safe(a.url))}" target="_blank" rel="noopener noreferrer" title="${esc(a.title)}">${esc(chars.slice(a.start, a.end).join("") || a.title)}</a>`
    );
    cursor = a.end;
  }
  return markdown(out + chars.slice(cursor).join(""), links);
}

function render() {
  const s = report.summary;
  const target = report.brands.find(b => b.target);
  document.title = hosted
    ? "AI Search Visibility Checker — Single Query | Goglobal"
    : `${report.query} · AI Search Lens`;
  document.body.classList.toggle("goglobal-tool", hosted);
  $("#app").innerHTML = `
  ${hosted ? '<nav class="goglobal-nav"><a href="/" class="goglobal-brand"><span>G</span> Goglobal</a><div><a href="/tools">Tools</a><a href="/skills">Skills</a><a href="/skills/geo">GEO Skill</a><a href="/pricing">Pricing</a></div><a class="site-login" href="/auth?redirect=/tools/ai-search-lens">Log in</a></nav>' : ""}
  <aside class="sidebar">
    <a class="logo" href="#overview"><span class="logo-mark">${icon("lens")}</span><span>search lens<span class="logo-caption">AI RESEARCH WORKSPACE</span></span></a>
    ${offline ? '<div class="offline-label">离线研究报告</div>' : `<button class="new-task" data-action="new">${icon("plus")} 新建研究 <kbd>⌘ K</kbd></button>`}
    <div class="side-label">工作空间</div>
    <nav class="primary-nav" aria-label="报告导航">${sections.map(([id, i, label], n) => `<a href="#${id}" class="nav-link ${n === 0 ? "active" : ""}">${icon(i)}<span>${label}</span>${id === "sources" ? `<span class="nav-count">${s.sourceCount}</span>` : ""}</a>`).join("")}</nav>
    <div class="side-label history-label">最近研究 ${icon("clock")}</div>
    <div class="history"><button class="history-item ${report.demo ? "selected" : ""}" data-action="demo"><span class="history-dot"></span><span>AI 图像生成器<small>示例研究 · 合成数据</small></span></button>${history.map(h => `<button class="history-item ${h.id === report.id ? "selected" : ""}" data-report="${esc(h.id)}"><span class="history-dot"></span><span>${esc(h.query)}<small>${date(h.createdAt)}</small></span></button>`).join("")}</div>
    <div class="sidebar-bottom"><div class="workspace-note">${icon("globe")}<div>让每一次研究，都有迹可循。<small>Evidence over assumptions.</small></div></div><div class="profile"><span class="avatar">P</span><div>个人工作空间<small>${hosted ? "报告保存在此浏览器" : "开源 · 本地优先"}</small></div><span class="local-dot" title="本地工作空间"></span></div></div>
  </aside>
  <div class="main-shell">
    <header class="topbar"><div class="breadcrumbs"><button class="icon-button mobile-menu" data-action="menu" aria-label="展开侧栏">${icon("menu")}</button><span>研究空间</span><span class="slash">/</span><strong>AI 搜索洞察</strong></div><div class="topbar-actions">${hosted ? '<a class="text-button" href="/tools">全部工具</a><a class="text-button" href="/auth?redirect=/tools/ai-search-lens">登录</a>' : ""}<span class="private-label">${icon(offline ? "file" : "globe")}${offline ? "离线报告" : hosted ? "Goglobal · 研究工作台" : "本地工作空间"}</span>${!offline ? `<button class="icon-button" data-action="settings" aria-label="连接设置">${icon("settings")}</button>` : ""}</div></header>
    <main>
      ${hosted ? `<section class="site-tool-intro"><a href="/tools" class="tool-breadcrumb">Tools / AI Search Lens</a><span class="site-tool-badge">AI SEARCH · SINGLE QUERY</span><h1>AI Search Visibility Checker</h1><p>See how AI answers one real question.<br>Trace brand mentions, expanded searches, and every cited source.</p><form id="quick-query" class="quick-query"><label for="quick-query-input">What would your customer ask?</label><div><input id="quick-query-input" required maxlength="8000" placeholder="e.g. best image generator"><button class="button primary" type="submit">Analyze query ${icon("arrow")}</button></div></form><div class="tool-benefits"><span>${icon("check")}Real search evidence</span><span>${icon("check")}Brand & competitor mentions</span><span>${icon("check")}Export your report</span></div><a class="skill-crosslink" href="/skills/geo">Prefer an agent workflow? Install the open-source GEO skill ${icon("arrow")}</a></section>` : ""}
      <div class="report-eyebrow"><span>${icon("branch")} QUERY FAN-OUT REPORT</span><span class="pill ${report.demo ? "" : "success"}">${report.demo ? "演示数据" : report.status === "completed" ? "采集完成" : esc(report.status)}</span></div>
      <div class="title-row"><div><${hosted ? "h2" : "h1"} class="report-title">${esc(report.query)}</${hosted ? "h2" : "h1"}><p class="subtitle">从一个问题出发，看见 AI 如何搜索、引用与推荐。</p></div><div class="export-wrap"><button class="button export-button" data-action="export-menu">${icon("download")} 导出报告 ${icon("down")}</button><div id="export-menu" class="dropdown" hidden>${(offline ? ["json", "md"] : ["html", "json", "raw", "md"]).map(x => `<button data-export="${x}">${{ html: "HTML · 离线完整报告", json: "JSON · 结构化报告", raw: "JSON · 原始 API 响应", md: "Markdown · 研究摘要" }[x]}</button>`).join("")}</div></div></div>
      <div class="metadata"><span>${icon("spark")}${esc(report.model)}</span><i></i><span>${icon("clock")}${date(report.createdAt)}</span><i></i><span>${icon("check")}${report.demo ? "合成示例 · 非真实测量" : esc(report.status)}</span></div>
      <nav class="tabs" aria-label="章节快捷导航">${sections.map(([id, , label], i) => `<a class="${i === 0 ? "active" : ""}" href="#${id}">${label}</a>`).join("")}</nav>
      <section id="overview" class="report-section">
        <div class="section-heading"><h2>数据概览</h2><span class="eyebrow">THE BIG PICTURE</span></div>
        <div class="stats">${[
          [
            "branch",
            s.queryCount,
            "可见搜索词",
            `${s.uniqueQueries} 条唯一查询`,
          ],
          ["globe", s.searchCalls, "搜索调用", `${s.toolCalls} 次工具调用`],
          ["link", s.sourceCount, "来源 URL", `${s.domainCount} 个来源域名`],
          [
            "file",
            s.citedUrls,
            "最终引用 URL",
            `${s.citationCount} 次引用注释`,
          ],
        ]
          .map(
            ([i, n, t, sub]) =>
              `<div class="stat-card"><div class="stat-label">${t}${icon(i)}</div><div class="stat-number">${n}<span>${i === "branch" ? "queries" : i === "globe" ? "searches" : "URLs"}</span></div><div class="stat-sub">${sub}</div></div>`
          )
          .join("")}</div>
        <div class="insight">${icon("spark")}<p>一个问题展开为 <strong>${s.queryCount} 条可见搜索词</strong>，搜索来源中有 <strong>${s.sourceCount} 个 URL</strong>，最终回答引用 <strong>${s.citedUrls} 个 URL</strong>。<span>${report.demo ? "当前为合成演示，用于体验完整报告功能。" : "统计仅覆盖这一次响应公开返回的数据。"}</span></p></div>
      </section>
      <section id="brands" class="report-section"><div class="section-heading"><h2>品牌与竞品 <span class="count">${report.brands.length}</span></h2><span class="section-hint">回答中的提及与引用证据</span></div>
      ${target ? `<div class="brand-highlight"><span class="brand-icon">${icon("target")}</span><div><span class="small-label">你的品牌</span><h3>${esc(target.name)} <span class="pill ${target.mentions ? "success" : ""}">${target.mentions ? "已被提及" : "未被提及"}</span></h3></div><div class="brand-result"><strong>${target.mentions}</strong><span>回答提及</span></div><div class="brand-result"><strong>${target.citedUrls}</strong><span>品牌引用 URL</span></div><a href="#answer" class="text-button">查看回答 ${icon("arrow")}</a></div>` : ""}
      ${report.brands.length ? `<div class="brand-grid">${report.brands.map(b => `<details class="brand-card"><summary><span class="brand-initial">${esc(b.name.slice(0, 1))}</span><span><strong>${esc(b.name)}</strong><small>${b.target ? "目标品牌" : "跟踪竞品"}</small></span><span class="mention-count">${b.mentions}<small>次提及</small></span>${icon("down")}</summary><div class="brand-evidence">${b.evidence.length ? b.evidence.map(e => `<blockquote>${esc(e.excerpt)}</blockquote>`).join("") : "本次答案未匹配到该品牌名称或别名。"}<p>${b.citedUrls} 个品牌域名 URL 被引用。提及不等于推荐。</p></div></details>`).join("")}</div>` : '<div class="empty-state">本次未配置品牌跟踪。新建研究时填写品牌、别名和域名即可分析。</div>'}
      <details class="candidate-details"><summary>发现更多候选 · ${report.candidates.length} 个来源域名 ${icon("down")}</summary><p>从来源域名发现研究线索，可能包含媒体和社区；需人工确认是否为竞品。</p><div class="candidate-list">${report.candidates.map(c => `<a href="${esc(safe("https://" + c.domain))}" target="_blank" rel="noopener noreferrer">${esc(c.domain)}<span>${c.cited} 引用 URL</span></a>`).join("")}</div></details></section>
      <div class="research-grid"><section id="queries" class="report-section"><div class="section-heading"><h2>查询展开 <span class="count">${s.queryCount}</span></h2><span class="eyebrow">FAN-OUT</span></div><div class="panel query-panel"><div class="query-root"><span class="mini-icon">${icon("branch")}</span><div><span class="small-label">原始问题</span><strong>${esc(report.query)}</strong></div></div><div class="query-tree">${report.queries.map((q, i) => `<article class="query-node"><div class="query-node-meta"><span class="query-index">Q${String(i + 1).padStart(2, "0")}</span><span class="scope-tag">${q.restricted.length ? "域名限定 · " + esc(q.restricted.join(", ")) : q.hints.length ? "域名线索 · " + esc(q.hints.join(", ")) : "开放搜索"}</span><a href="#call-${q.callNumber}">调用 ${q.callNumber} ↗</a></div><p>${esc(q.text)}</p></article>`).join("") || '<div class="empty-state">API 未返回可见搜索词。</div>'}</div><div class="panel-foot">${s.restrictedQueries} 条 site: 限定 · ${s.hintQueries} 条 site. 线索</div></div></section>
      <section id="domains" class="report-section"><div class="section-heading"><h2>来源分布</h2><span class="eyebrow">DOMAINS</span></div><div class="panel domain-panel"><div class="chart-legend"><span><i></i>来源 URL</span><span><i></i>其中被引用</span></div>${
        report.domains
          .slice(0, 8)
          .map(
            d =>
              `<div class="domain-row"><div class="domain-caption"><span>${esc(d.domain)}</span><span><strong>${d.sources}</strong><small> / ${d.cited} 引用</small></span></div><div class="bar-track"><div class="bar" style="width:${(100 * d.sources) / Math.max(1, ...report.domains.map(x => x.sources))}%"><div class="bar-cited" style="width:${Math.min(100, (100 * d.cited) / Math.max(1, d.sources))}%"></div></div></div></div>`
          )
          .join("") || '<div class="empty-state">API 未返回来源域名。</div>'
      }<details class="all-domains"><summary>查看全部 ${report.domains.length} 个域名 ${icon("down")}</summary>${report.domains.map(d => `<div class="domain-caption"><span>${esc(d.domain)}</span><span>${d.sources} 来源 / ${d.cited} 引用</span></div>`).join("")}</details><div class="panel-foot">按唯一完整 URL 统计，不合并子域名</div></div></section></div>
      <section id="calls" class="report-section"><div class="section-heading"><h2>工具调用记录 <span class="count">${s.toolCalls}</span></h2><span class="section-hint">公开返回的执行轨迹</span></div><div class="panel calls-panel">${report.calls.map(c => `<details id="call-${c.number}" class="call-row"><summary><span class="call-number">${String(c.number).padStart(2, "0")}</span><span><strong>${esc(c.type)} <span class="status-dot ${c.status === "completed" ? "done" : ""}"></span></strong><small>${c.queries.length} 条可见搜索词 · ${c.sourceUrls.length} 个来源 URL</small></span><span class="call-status">${esc(c.status)}</span>${icon("down")}</summary><div class="call-detail"><code>${esc(c.id)}</code>${c.queries.map(q => `<p>${esc(q)}</p>`).join("")}${c.url ? sourceLink(c.url, c.url) : ""}${c.pattern ? `<p>查找：${esc(c.pattern)}</p>` : ""}<p class="muted">来源关联到调用，不推测单个查询与来源之间的对应关系。</p></div></details>`).join("") || '<div class="empty-state">API 未返回工具调用记录。</div>'}</div></section>
      <section id="sources" class="report-section"><div class="section-heading"><h2>来源与最终引用</h2><span class="section-hint">每条结论，都能回到来源</span></div><div class="panel sources-panel"><div class="table-toolbar"><label class="search-field">${icon("lens")}<input id="source-search" aria-label="搜索来源" placeholder="搜索域名、标题或 URL" value="${esc(filter)}"></label><select id="source-filter" aria-label="引用状态"><option value="all">全部来源</option><option value="cited">仅已引用</option><option value="uncited">未引用</option></select><span id="source-count"></span></div><div class="table-scroll"><table><thead><tr><th>页面 / URL</th><th>来源归属</th><th>最终引用</th></tr></thead><tbody id="source-body"></tbody></table></div></div></section>
      <section id="answer" class="report-section"><div class="section-heading"><h2>最终回答</h2><button class="text-button" data-action="copy">复制原文 ${icon("file")}</button></div><div class="panel answer-panel"><div class="answer-label"><span class="answer-avatar">${icon("spark")}</span><div>AI 回答快照<small>${report.demo ? "合成演示文本" : "保留本次响应原文"}</small></div><span class="pill">${s.citationCount} 次引用</span></div><div class="answer-prose">${report.answers.map(a => `<div>${citedAnswer(a)}</div>`).join("") || "<p>API 未返回答案文本。</p>"}</div><div class="answer-references"><h3>引用来源</h3>${report.sources
        .filter(s => s.citations)
        .map(
          (s, i) =>
            `<div><span>${String(i + 1).padStart(2, "0")}</span>${sourceLink(s.url, s.title)}<small>${s.citations} 次</small></div>`
        )
        .join(
          ""
        )}</div><details class="raw-answer"><summary>查看原始 Markdown ${icon("down")}</summary><pre>${esc(report.answers.map(a => a.text).join("\n\n"))}</pre></details></div></section>
      <section id="method" class="report-section"><div class="section-heading"><h2>数据说明与原始文件</h2><span class="eyebrow">METHODOLOGY</span></div><div class="panel method-panel"><div class="method-grid">${[
        ["响应 ID", report.responseId || "未返回"],
        ["采集时间", report.createdAt],
        ["模型 / 状态", report.model + " / " + report.status],
        [
          "推理强度 / 搜索模式",
          (report.reasoning || "未返回") +
            " / " +
            JSON.stringify(report.searchMode || "未返回"),
        ],
        ["报告生成时间", report.generatedAt],
        ["原始响应 SHA-256", report.rawSha256],
      ]
        .map(([k, v]) => `<div><span>${k}</span><code>${esc(v)}</code></div>`)
        .join(
          ""
        )}</div><div class="method-notes">${report.notes.map(n => `<p>${icon("check")}${esc(n)}</p>`).join("")}</div></div></section>
      <footer><span class="footer-brand">${icon("lens")} search lens</span><span>看见证据，让增长更有方向。</span><span>OPEN SOURCE · LOCAL FIRST</span></footer>
    </main>
  </div><dialog id="task-dialog"></dialog><dialog id="settings-dialog"></dialog>`;
  $("#source-filter").value = citedOnly;
  renderSources();
  bind();
}
function renderSources() {
  const rows = report.sources.filter(
    s =>
      `${s.title} ${s.domain} ${s.url}`
        .toLowerCase()
        .includes(filter.toLowerCase()) &&
      (citedOnly === "all" ||
        (citedOnly === "cited" ? s.citations > 0 : !s.citations))
  );
  $("#source-count").textContent = `${rows.length} / ${report.sources.length}`;
  $("#source-body").innerHTML =
    rows
      .map(
        s =>
          `<tr><td><div class="source-title">${sourceLink(s.url, s.title)}</div><div class="source-url">${esc(s.url)}</div></td><td><span class="source-calls">${s.callIds.map(id => "调用 " + report.calls.find(c => c.id === id)?.number).join("、") || "仅引用 · 无调用关联"}</span></td><td>${s.citations ? `<span class="citation-badge">${icon("check")}已引用 · ${s.citations} 次</span>` : '<span class="uncited">未引用</span>'}</td></tr>`
      )
      .join("") ||
    '<tr><td colspan="3" class="empty-state">没有匹配的来源，试试其他关键词。</td></tr>';
}
function bind() {
  if ($("#quick-query"))
    $("#quick-query").onsubmit = e => {
      e.preventDefault();
      const query = $("#quick-query-input").value;
      showTask();
      $('#research-form textarea[name="query"]').value = query;
    };
  $("#source-search").addEventListener("input", e => {
    filter = e.target.value;
    renderSources();
  });
  $("#source-filter").addEventListener("change", e => {
    citedOnly = e.target.value;
    renderSources();
  });
  document
    .querySelectorAll("[data-action]")
    .forEach(el =>
      el.addEventListener("click", () => action(el.dataset.action))
    );
  document
    .querySelectorAll("[data-report]")
    .forEach(el =>
      el.addEventListener("click", () => loadReport(el.dataset.report))
    );
  document
    .querySelectorAll("[data-export]")
    .forEach(el =>
      el.addEventListener("click", () => exportReport(el.dataset.export))
    );
  document.querySelectorAll('a[href^="#"]').forEach(el =>
    el.addEventListener("click", () => {
      document
        .querySelectorAll(".tabs a,.nav-link")
        .forEach(a => a.classList.toggle("active", a.hash === el.hash));
      document.body.classList.remove("sidebar-open");
      const target = document.getElementById(el.hash.slice(1));
      if (target?.tagName === "DETAILS") target.open = true;
    })
  );
}
async function action(name) {
  if (name === "new") return showTask();
  if (name === "settings") return showSettings();
  if (name === "menu") return document.body.classList.toggle("sidebar-open");
  if (name === "export-menu") {
    const menu = $("#export-menu");
    menu.hidden = !menu.hidden;
    return;
  }
  if (name === "copy") {
    try {
      await navigator.clipboard.writeText(
        report.answers.map(a => a.text).join("\n\n")
      );
      toast("已复制回答原文");
    } catch {
      toast("无法访问剪贴板，请在“原始 Markdown”中复制。");
    }
    return;
  }
  if (name === "demo") {
    if (offline) return toast("当前为离线报告");
    try {
      report = await api("/api/demo");
      filter = "";
      citedOnly = "all";
      render();
      window.scrollTo(0, 0);
    } catch (e) {
      toast(e.message);
    }
  }
}
async function loadReport(id) {
  try {
    report = await api("/api/reports/" + encodeURIComponent(id));
    filter = "";
    citedOnly = "all";
    render();
    window.scrollTo(0, 0);
  } catch (e) {
    toast(e.message);
  }
}
function showSettings() {
  const dialog = $("#settings-dialog");
  if (hosted) {
    dialog.innerHTML = `<div class="dialog-heading"><h2>研究设置</h2><button class="icon-button" aria-label="关闭设置">${icon("close")}</button></div><div class="connection-state">${config.configured ? "真实研究已启用" : "站点暂未启用真实采集"}</div><p>默认模型：<code>${esc(config.model)}</code>。真实研究需要登录，问题会发送给 ${esc(config.provider || "模型服务")}；目标品牌只用于分析。</p><p>报告与原始响应保存在当前浏览器中，不会同步到其他设备。请导出需要长期留存的报告。JSON 导入和演示无需 API Key。</p><a class="text-button" href="/auth?redirect=/tools/ai-search-lens">登录 Goglobal ${icon("arrow")}</a>`;
    $(".icon-button", dialog).onclick = () => dialog.close();
    dialog.showModal();
    return;
  }
  dialog.innerHTML = `<div class="dialog-heading"><h2>连接与数据</h2><button class="icon-button" aria-label="关闭设置">${icon("close")}</button></div><div class="connection-state"><span class="status-dot ${config.configured ? "done" : ""}"></span>${config.configured ? "API Key 已配置" : "尚未配置 API Key"}</div><p>在项目根目录的 <code>.env</code> 中设置 <code>OPENAI_API_KEY</code>，然后重启服务。密钥只在服务端使用。</p><p>当前默认模型：<code>${esc(config.model)}</code></p><p>报告保存在本地 <code>data/</code>。真实研究会把问题发送给 OpenAI，并产生 API 费用。目标品牌配置只在本地分析，不加入模型提问。</p><a class="text-button" href="https://developers.openai.com/api/docs/guides/tools-web-search" target="_blank" rel="noopener noreferrer">阅读 Web Search API 文档 ${icon("external")}</a>`;
  $(".icon-button", dialog).onclick = () => dialog.close();
  dialog.showModal();
}
function showTask() {
  if (offline) return;
  const dialog = $("#task-dialog");
  dialog.innerHTML = `<form id="research-form"><div class="dialog-heading"><div><span class="small-label">NEW RESEARCH</span><h2>你想了解哪个问题？</h2></div><button type="button" class="icon-button" id="close-task" aria-label="关闭研究窗口">${icon("close")}</button></div><p class="dialog-subtitle">输入用户真实会问的问题，追踪 AI 搜索中的品牌与来源。</p><label>研究问题<textarea name="query" required maxlength="8000" placeholder="例如：best image generator" rows="3"></textarea></label><div class="form-grid"><label>你的品牌<input name="brand" placeholder="例如：Freebeat"></label><label>品牌域名<input name="domain" placeholder="freebeat.ai（多个用逗号分隔）"></label></div><label>品牌别名<input name="aliases" placeholder="可选，多个别名用逗号分隔"></label><label>跟踪竞品 <span class="muted">每行一个：名称 | 域名 | 别名</span><textarea name="competitors" rows="2" placeholder="Neural Frames | neuralframes.com\nKaiber | kaiber.ai"></textarea></label><details class="advanced" ${hosted ? "hidden" : ""}><summary>高级设置 ${icon("down")}</summary><label>模型<input name="model" value="${esc(config.model)}" required></label></details><div id="form-error" class="form-error" role="alert"></div><div id="run-status" class="run-status" hidden><span class="spinner"></span><div>正在等待搜索响应…<small>通常需要几十秒；只展示 API 实际返回的轨迹。</small></div></div><div class="form-bottom"><label class="import-button">${icon("upload")} 导入响应 JSON<input id="import-file" type="file" accept=".json,application/json" hidden></label><button class="button primary" type="submit" id="run-button">开始研究 ${icon("arrow")}</button></div><div class="form-footnote">${hosted ? "真实研究需要登录；导入 JSON 与演示可直接使用。" : config.configured ? "真实采集将使用已配置的 API Key，并产生 API 费用。" : "尚未配置 API Key；可导入已有响应，或在设置中查看配置方法。"}</div></form>`;
  const form = $("#research-form");
  const close = () => {
    controller?.abort();
    dialog.close();
  };
  $("#close-task").onclick = close;
  dialog.oncancel = () => controller?.abort();
  function formConfig() {
    const f = new FormData(form),
      split = x =>
        String(x || "")
          .split(/[,，]/)
          .map(s => s.trim())
          .filter(Boolean),
      domains = x =>
        split(x).map(s =>
          s
            .replace(/^https?:\/\//, "")
            .split("/")[0]
            .toLowerCase()
        );
    const brands = [];
    if (f.get("brand").trim())
      brands.push({
        name: f.get("brand").trim(),
        domains: domains(f.get("domain")),
        aliases: split(f.get("aliases")),
        target: true,
      });
    for (const line of f
      .get("competitors")
      .split("\n")
      .filter(s => s.trim())) {
      const [name, domain, alias] = line.split("|");
      brands.push({
        name: name.trim(),
        domains: domains(domain),
        aliases: split(alias),
      });
    }
    return {
      query: f.get("query").trim(),
      model: f.get("model").trim(),
      brands,
    };
  }
  async function submit(raw) {
    if (!form.reportValidity()) return;
    const payload = formConfig();
    if (raw) payload.raw = raw;
    $("#form-error").textContent = "";
    $("#run-status").hidden = false;
    $("#run-button").disabled = true;
    $("#import-file").disabled = true;
    controller = new AbortController();
    try {
      const result = await api(raw ? "/api/import" : "/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      report = result;
      history = await api("/api/reports");
      filter = "";
      citedOnly = "all";
      dialog.close();
      render();
      window.scrollTo(0, 0);
      toast(hosted ? "研究已保存到此浏览器" : "研究已保存到本地");
    } catch (e) {
      if (e.name !== "AbortError") $("#form-error").textContent = e.message;
    } finally {
      controller = null;
      if ($("#run-status")) {
        $("#run-status").hidden = true;
        $("#run-button").disabled = false;
        $("#import-file").disabled = false;
      }
    }
  }
  form.onsubmit = e => {
    e.preventDefault();
    submit();
  };
  $("#import-file").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("文件超过 10 MB");
      await submit(JSON.parse(await file.text()));
    } catch (err) {
      $("#form-error").textContent = err.message;
    }
    e.target.value = "";
  };
  dialog.showModal();
}
async function exportReport(format) {
  $("#export-menu").hidden = true;
  if (offline) {
    if (format === "json")
      return download(
        `search-lens-${report.id}.json`,
        JSON.stringify(report, null, 2)
      );
    return download(
      `search-lens-${report.id}.md`,
      `# ${report.query}\n\n${report.demo ? "> Synthetic demo\n\n" : ""}${report.answers.map(a => a.text).join("\n\n")}\n\n## Sources\n${report.sources.map(s => `- ${s.title}: ${s.url}`).join("\n")}\n\n## Methodology\n${report.notes.join("\n")}`,
      "text/markdown"
    );
  }
  if (hosted) {
    try {
      if (format === "raw")
        return download(
          `search-lens-${report.id}.raw.json`,
          JSON.stringify(rawById.get(report.id), null, 2)
        );
      if (format === "json")
        return download(
          `search-lens-${report.id}.json`,
          JSON.stringify(report, null, 2)
        );
      if (format === "md")
        return download(
          `search-lens-${report.id}.md`,
          `# ${report.query}\n\n${report.demo ? "> Synthetic demo\n\n" : ""}${report.answers.map(a => a.text).join("\n\n")}\n\n## Sources\n${report.sources.map(s => `- ${s.title}: ${s.url}`).join("\n")}\n\n## Methodology\n${report.notes.join("\n")}`,
          "text/markdown"
        );
      const template = await api("/api/template");
      const data = JSON.stringify(report)
        .replace(/</g, "\\u003c")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
      const html = template.html.replace(
        '<script type="module">',
        `<script>window.__REPORT__=${data};<` + '/script><script type="module">'
      );
      return download(`search-lens-${report.id}.html`, html, "text/html");
    } catch (e) {
      toast(e.message);
      return;
    }
  }
  const a = document.createElement("a");
  a.href = report.demo
    ? "/api/demo/" + format
    : `/api/reports/${report.id}/${format}`;
  a.download = "";
  a.click();
}
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    showTask();
  }
});
document.addEventListener("click", e => {
  if (!e.target.closest(".export-wrap") && $("#export-menu"))
    $("#export-menu").hidden = true;
});
async function init() {
  try {
    if (offline) report = window.__REPORT__;
    else {
      const results = await Promise.all([
        api("/api/config"),
        api("/api/reports"),
        api("/api/demo"),
      ]);
      [config, history, report] = results;
    }
    render();
  } catch (e) {
    $("#app").innerHTML =
      `<div class="boot">无法打开工作台<span>${esc(e.message)}</span><button class="button" onclick="location.reload()">重新加载</button></div>`;
  }
}
init();
