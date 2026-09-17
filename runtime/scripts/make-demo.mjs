import { writeFile } from "node:fs/promises";
// Synthetic data for exercising the UI. These are not recorded API results.
const sources = [
  [
    "https://www.neuralframes.com/ai-music-video-generator",
    "AI music video generator — Neural Frames",
  ],
  ["https://freebeat.ai/", "Freebeat — Music to video"],
  ["https://helpcenter.kaiber.ai/", "Kaiber Help Center — Beat Sync"],
  ["https://runwayml.com/", "Runway — Creative tools"],
  ["https://www.reddit.com/r/aivideo/", "AI video community"],
  ["https://www.reddit.com/r/VideoEditing/", "Video editing discussions"],
  ["https://www.reddit.com/r/musicproduction/", "Music production discussions"],
  ["https://www.neuralframes.com/", "Neural Frames"],
  ["https://freebeat.ai/blog", "Freebeat blog"],
  ["https://help.runwayml.com/", "Runway Help Center"],
  ["https://www.youtube.com/", "Creator tutorials"],
  ["https://www.tomsguide.com/", "Video software reviews"],
].map(([url, title]) => ({ type: "url", url, title }));
const paragraphs = [
  {
    text: "For an audio-reactive music video, Neural Frames is a candidate to evaluate. Its workflow focuses on turning a song into a visual sequence.",
    source: 0,
  },
  {
    text: "For a more automated song-to-video workflow, Freebeat is another option to compare. Review its current features and pricing before choosing.",
    source: 1,
  },
  {
    text: "Kaiber is worth comparing for beat-synced clips, while Runway offers a broader set of creative video tools.",
    source: 2,
  },
  {
    text: "Runway may suit a shot-by-shot workflow where you want more direct control over the visual sequence.",
    source: 3,
  },
  {
    text: "Start with the same 20-second sample in each tool. Compare music alignment, visual consistency, editing control, and export quality. Neural Frames is one candidate for that trial.",
    source: 0,
  },
];
let answer = "";
const annotations = [];
for (const p of paragraphs) {
  answer += (answer ? "\n\n" : "") + p.text + " ";
  const label = `[${sources[p.source].title}]`;
  const start_index = answer.length;
  answer += label;
  annotations.push({
    type: "url_citation",
    url: sources[p.source].url,
    title: sources[p.source].title,
    start_index,
    end_index: answer.length,
  });
}
const raw = {
  id: "resp_synthetic_demo",
  model: "gpt-6-astra · demo fixture",
  created_at: 1789606800,
  status: "completed",
  tool_choice: "required",
  reasoning: { effort: "low" },
  output: [
    {
      id: "ws_demo_01",
      type: "web_search_call",
      status: "completed",
      action: {
        type: "search",
        queries: [
          "best image generator audio reactive comparison",
          "site.kaiber.ai music video generator",
          "site.runwayml.com music video generator",
        ],
        sources: sources.slice(2),
      },
    },
    {
      id: "ws_demo_02",
      type: "web_search_call",
      status: "completed",
      action: {
        type: "search",
        queries: [
          "freebeat AI music video features",
          "site:neuralframes.com full song music video",
        ],
        sources: [...sources.slice(0, 4), sources[7], sources[8]],
      },
    },
    {
      id: "msg_demo",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: answer, annotations }],
    },
  ],
};
const config = {
  query: "best image generator",
  demo: true,
  brands: [
    { name: "Freebeat", domains: ["freebeat.ai"], target: true },
    {
      name: "Neural Frames",
      aliases: ["neuralframes"],
      domains: ["neuralframes.com"],
    },
    { name: "Kaiber", domains: ["kaiber.ai"] },
    { name: "Runway", domains: ["runwayml.com"] },
  ],
};
await writeFile(
  new URL("../examples/demo-response.json", import.meta.url),
  JSON.stringify(raw, null, 2) + "\n"
);
await writeFile(
  new URL("../examples/demo-config.json", import.meta.url),
  JSON.stringify(config, null, 2) + "\n"
);
