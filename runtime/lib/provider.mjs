export async function collectResponse({
  query,
  model = process.env.OPENAI_MODEL || "gpt-6-astra",
  signal,
  fetchImpl = fetch,
  apiKey = process.env.OPENAI_API_KEY,
  baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
}) {
  if (!apiKey)
    throw new Error(
      "请在 .env 配置 OPENAI_API_KEY 后启动真实研究。也可以先查看演示或导入已有响应。"
    );
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    // Brand configuration is deliberately absent: the measurement must not prime the answer.
    body: JSON.stringify({
      model,
      input: query,
      max_output_tokens: 6000,
      max_tool_calls: 6,
      ...(/^gpt-[56]|^o[134]/.test(model)
        ? { reasoning: { effort: "low" } }
        : {}),
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      store: false,
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(180000)])
      : AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    // Do not forward provider error bodies, which may echo credentials or prompts.
    throw new Error(
      `模型服务请求失败（HTTP ${response.status}）。请检查账户额度、模型权限和网络后手动重试。`
    );
  }
  const raw = await response.json();
  if (raw.error)
    throw new Error("OpenAI 返回失败状态，未生成报告。请检查账户与模型配置。");
  return raw;
}
