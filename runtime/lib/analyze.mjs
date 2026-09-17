import { createHash } from "node:crypto";

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
const arr = value => (Array.isArray(value) ? value : []);
const host = value => {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};
export function queryScope(query) {
  const restricted = [...query.matchAll(/(?:^|\s)site:\s*([\w.-]+)/gi)].map(
    m => m[1]
  );
  const hints = [...query.matchAll(/(?:^|\s)site\.([\w.-]+)/gi)].map(m => m[1]);
  return { restricted, hints };
}
function occurrences(text, value) {
  if (!value) return [];
  const result = [];
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = /[a-z0-9]/i.test(value)
    ? `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`
    : escaped;
  for (const match of text.matchAll(new RegExp(boundary, "giu"))) {
    result.push({
      index: match.index,
      excerpt: text.slice(
        Math.max(0, match.index - 70),
        match.index + match[0].length + 130
      ),
    });
  }
  return result;
}
export function analyzeResponse(raw, config = {}) {
  if (!raw || !Array.isArray(raw.output))
    throw new Error("不是有效的 Responses API JSON：缺少 output 数组。");
  const calls = [],
    queries = [],
    answers = [],
    citations = [],
    sourceMap = new Map();
  function addSource(item, callId = null, cited = false) {
    if (!item || !safeUrl(item.url)) return null;
    // Identity is the exact provider URL: preserve tracking parameters and fragments.
    const url = item.url;
    if (!sourceMap.has(url))
      sourceMap.set(url, {
        url,
        domain: host(url),
        title: item.title || url,
        callIds: [],
        citations: 0,
        inSearch: false,
      });
    const source = sourceMap.get(url);
    if (item.title) source.title = item.title;
    if (callId && !source.callIds.includes(callId)) source.callIds.push(callId);
    if (callId) source.inSearch = true;
    if (cited) source.citations++;
    return source;
  }
  for (const [outputIndex, item] of raw.output.entries()) {
    if (item.type === "web_search_call") {
      const action = item.action || {};
      const callId = item.id || `call_${outputIndex + 1}`;
      const strings = arr(action.queries).filter(q => typeof q === "string");
      if (typeof action.query === "string" && !strings.includes(action.query))
        strings.push(action.query);
      const call = {
        id: callId,
        number: calls.length + 1,
        type: action.type || "unknown",
        status: item.status || "unknown",
        queries: strings,
        sourceUrls: [],
        url: safeUrl(action.url),
        pattern: action.pattern || null,
      };
      for (const text of strings)
        queries.push({
          text,
          callId,
          callNumber: call.number,
          ...queryScope(text),
        });
      for (const source of arr(action.sources)) {
        const added = addSource(source, callId);
        if (added && !call.sourceUrls.includes(added.url))
          call.sourceUrls.push(added.url);
      }
      calls.push(call);
    }
    if (item.type === "message" && item.role === "assistant") {
      for (const content of arr(item.content)) {
        if (content.type !== "output_text" || typeof content.text !== "string")
          continue;
        const annotations = arr(content.annotations)
          .filter(a => a.type === "url_citation" && safeUrl(a.url))
          .map(a => ({
            url: a.url,
            title: a.title || a.url,
            start: a.start_index,
            end: a.end_index,
          }));
        answers.push({ text: content.text, annotations });
        for (const citation of annotations) {
          citations.push(citation);
          addSource(citation, null, true);
        }
      }
    }
  }
  const sources = [...sourceMap.values()].sort(
    (a, b) => b.citations - a.citations || a.domain.localeCompare(b.domain)
  );
  const domainMap = new Map();
  for (const source of sources) {
    if (!domainMap.has(source.domain))
      domainMap.set(source.domain, {
        domain: source.domain,
        sources: 0,
        cited: 0,
        annotations: 0,
      });
    const domain = domainMap.get(source.domain);
    if (source.inSearch) domain.sources++;
    if (source.citations) domain.cited++;
    domain.annotations += source.citations;
  }
  const domains = [...domainMap.values()].sort(
    (a, b) => b.sources - a.sources || a.domain.localeCompare(b.domain)
  );
  const answerText = answers.map(a => a.text).join("\n\n");
  // Ignore annotated citation labels and link destinations in mention counts.
  const mentionText = answers
    .map(a => {
      const chars = Array.from(a.text);
      for (const annotation of a.annotations) {
        if (
          Number.isInteger(annotation.start) &&
          Number.isInteger(annotation.end) &&
          annotation.start >= 0 &&
          annotation.end <= chars.length
        ) {
          for (let i = annotation.start; i < annotation.end; i++)
            chars[i] = " ";
        }
      }
      return chars.join("").replace(/\]\((?:https?:\/\/)[^)]*\)/g, "]");
    })
    .join("\n\n");
  const brands = arr(config.brands)
    .filter(b => b && typeof b.name === "string")
    .map(brand => {
      const names = [
        ...new Set(
          [brand.name, ...arr(brand.aliases)].filter(
            n => typeof n === "string" && n.trim()
          )
        ),
      ];
      const evidence = [
        ...new Map(
          names.flatMap(n => occurrences(mentionText, n)).map(e => [e.index, e])
        ).values(),
      ].sort((a, b) => a.index - b.index);
      const brandSources = sources.filter(s =>
        arr(brand.domains).some(
          d =>
            s.domain === d.toLowerCase() ||
            s.domain.endsWith(`.${d.toLowerCase()}`)
        )
      );
      return {
        name: brand.name,
        target: !!brand.target,
        mentions: evidence.length,
        firstPosition: evidence.length ? evidence[0].index : null,
        evidence,
        sourceUrls: brandSources.map(s => s.url),
        citedUrls: brandSources.filter(s => s.citations).length,
      };
    });
  // Candidates are evidence-linked domains, not an assertion that every publisher is a competitor.
  const candidates = domains
    .filter(
      d => !brands.some(b => b.sourceUrls.some(u => host(u) === d.domain))
    )
    .map(d => ({
      ...d,
      mentioned: answerText.toLowerCase().includes(
        d.domain
          .replace(/^www\./, "")
          .split(".")[0]
          .toLowerCase()
      ),
    }));
  const summary = {
    queryCount: queries.length,
    uniqueQueries: new Set(queries.map(q => q.text)).size,
    searchCalls: calls.filter(c => c.type === "search").length,
    toolCalls: calls.length,
    sourceCount: sources.filter(s => s.inSearch).length,
    domainCount: domains.filter(d => d.sources).length,
    citedUrls: sources.filter(s => s.citations).length,
    citationCount: citations.length,
    restrictedQueries: queries.filter(q => q.restricted.length).length,
    hintQueries: queries.filter(q => q.hints.length).length,
  };
  return {
    schemaVersion: 1,
    id:
      config.id ||
      createHash("sha256")
        .update(JSON.stringify(raw))
        .digest("hex")
        .slice(0, 16),
    query: config.query || "Imported research",
    model: raw.model || config.model || "unknown",
    createdAt:
      config.createdAt ||
      (raw.created_at
        ? new Date(raw.created_at * 1000).toISOString()
        : new Date().toISOString()),
    generatedAt: new Date().toISOString(),
    status: raw.status || "unknown",
    responseId: raw.id || null,
    demo: !!config.demo,
    reasoning: raw.reasoning?.effort || config.reasoning || null,
    searchMode: raw.tool_choice || config.searchMode || null,
    summary,
    calls,
    queries,
    sources,
    domains,
    brands,
    candidates,
    answers,
    usage: raw.usage || null,
    rawSha256: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
    incompleteDetails: raw.incomplete_details || null,
    notes: [
      "记录的是 API 公开返回的搜索动作、来源和答案，不是模型内部思维链，也不等同于个性化 ChatGPT 网页结果。",
      "来源按完整 URL 去重，保留参数与片段。同一调用包含多个查询时，无法把某个来源可靠地分配给其中一条查询。",
      "可见查询可能只是实际检索的一部分；返回字段缺失时显示为未返回，不推测补全。",
      "site: 是域名限定语法；site. 仅按原样展示为域名线索。品牌提及按配置名称与别名匹配，排除引用标签和链接地址；提及顺序不代表推荐排名。",
      "候选域名可能是媒体、社区或工具站，需人工确认；证据不能证明模型为何选择某个品牌。",
    ],
  };
}
