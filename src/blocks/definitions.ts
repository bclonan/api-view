import {
  presentations,
  type PresentationType,
  type SemanticResult,
} from "../types";
import { isMeasure } from "../runtime/semantics";
import { embedSource } from "../runtime/embeds";
import { pricePoint } from "../runtime/market";
import { readPath } from "../runtime/fields";
import { blockStyleSchema } from "../runtime/blockStyle";
import {
  scenarioFor,
  scenarioKinds,
  type ScenarioKind,
} from "../runtime/scenarios";
const descriptions: Record<Exclude<PresentationType, "auto">, string> = {
  metric: "One primary numeric value with an optional label and subtitle.",
  stats: "Several numeric fields in one card.",
  text: "Text values and descriptions.",
  "key-value": "Labeled fields from any record.",
  record: "A record with an optional heading, image, and description.",
  table: "Sortable, filterable records.",
  list: "A vertical list of records.",
  cards: "A set of reusable record cards.",
  image: "A single image with a caption.",
  gallery: "A collection of images.",
  "line-chart": "Numeric values across an ordered axis.",
  "bar-chart": "Compare numeric values by category.",
  "area-chart": "A filled line chart.",
  scatter: "Two numeric axes.",
  pie: "Up to 12 nonnegative values as shares.",
  timeline: "Records ordered by date or time.",
  map: "Latitude and longitude on a coordinate map.",
  weather: "Optional weather convenience view with current conditions.",
  "finance-quote": "A numeric value with optional quote fields.",
  book: "Optional book-style record cards.",
  drug: "Optional published-label record cards.",
  media: "Native audio or video controls.",
  "link-preview": "A record with a link and optional image.",
  json: "The complete displayed value.",
  histogram:
    "Distribution of one numeric field using bounded equal-width bins.",
  comparison: "Compare records across the same selected properties.",
  document:
    "Titles, authors, publication dates, descriptions and source links.",
  calendar: "Dated records grouped by calendar day.",
  graph: "A relationship diagram of nodes and edges.",
  "sports-score":
    "Games with home and away teams, optional scores, schedule, venue and status. Missing scores stay unavailable.",
  "sports-team":
    "Team records, wins, losses, home and away splits. Never treats absent statistics as zero.",
  places:
    "Addresses and coordinates with map links. Addresses alone are never assigned invented coordinates.",
  news: "Headlines with publication time, author, summary and original article links.",
  events: "Event time, venue, address and availability.",
  person: "People with roles, organizations and contact details.",
  product: "Products with supplied prices, currency, availability and ratings.",
  embed:
    "Click-to-load YouTube, Vimeo, Spotify, SoundCloud or sandboxed public HTTPS embeds. Providers may refuse framing.",
  video:
    "Playable video URLs with controls, failure feedback and an original link.",
  audio: "Playable audio URLs with controls and an original link.",
  note: "Editable local notes, agent answers and summaries with explicit citations.",
  file: "Download supplied text, Markdown, JSON or CSV files, or open a public file link.",
  "stock-chart":
    "Dated OHLC candles, closing prices and optional volume, separated by symbol. Missing observations remain missing.",
};
const numberViews = new Set(["metric", "stats", "finance-quote"]);
const chartViews = new Set([
  "line-chart",
  "area-chart",
  "bar-chart",
  "scatter",
  "pie",
  "histogram",
]);
const scenarioSlots: Partial<Record<PresentationType, string[]>> = {
  embed: ["embed_url", "mediaType"],
  video: ["video_url"],
  audio: ["audio_url"],
  note: ["body"],
  file: ["filename", "text"],
  "stock-chart": [
    "open",
    "high",
    "low",
    "close",
    "volume",
    "symbol",
    "currency",
  ],
  "sports-score": [
    "home_team",
    "away_team",
    "home_score",
    "away_score",
    "status_label",
    "venue",
    "season_label",
  ],
  "sports-team": [
    "record_summary",
    "wins",
    "losses",
    "ties",
    "home_record",
    "away_record",
    "rank",
    "streak",
  ],
  places: ["address"],
  map: ["address"],
  news: ["author", "publisher"],
  events: ["venue", "address", "end_time", "status_label"],
  person: ["role", "organization", "email"],
  product: ["price", "currency", "availability", "rating"],
};
export const componentDefinitions = presentations
  .filter((id) => id !== "auto")
  .map((id) => ({
    id,
    name: id.replaceAll("-", " "),
    description: descriptions[id],
    accepts: numberViews.has(id)
      ? ["number", "integer", "currency", "percent"]
      : chartViews.has(id)
        ? ["record-list", "number"]
        : id === "map"
          ? ["latitude", "longitude"]
          : ["image", "gallery"].includes(id)
            ? ["image", "url"]
            : id === "media"
              ? ["audio", "video"]
              : id === "timeline"
                ? ["date", "datetime"]
                : ["object", "array", "text"],
    slots: [
      {
        id: "$data",
        name: "Dataset",
        accepts: ["anything"],
        description: "Select a root object or array before transforms.",
      },
      {
        id: "value",
        name: "Primary value",
        accepts: ["number", "integer", "currency", "percent"],
      },
      { id: "title", name: "Label", accepts: ["text", "category"] },
      { id: "description", name: "Subtitle", accepts: ["text", "category"] },
      { id: "unit", name: "Unit", accepts: ["text"] },
      { id: "trend", name: "Trend", accepts: ["number", "percent"] },
      { id: "image_url", name: "Image", accepts: ["image", "url"] },
      { id: "url", name: "Source link", accepts: ["url"] },
      { id: "time", name: "Timestamp", accepts: ["date", "datetime"] },
      { id: "latitude", name: "Latitude", accepts: ["latitude", "number"] },
      { id: "longitude", name: "Longitude", accepts: ["longitude", "number"] },
      ...(scenarioSlots[id] ?? []).map((id) => ({
        id,
        name: id.replaceAll("_", " "),
        accepts: ["text", "number"],
      })),
    ],
    additionalSlots: true,
    props: {
      compact: { type: "boolean", default: false },
      numberFormat: { enum: ["compact", "standard"], default: "compact" },
      showSource: { type: "boolean", default: true },
      style: blockStyleSchema,
    },
    defaults: { type: id },
    layout: { widths: [3, 4, 6, 8, 12] },
  }));
export function compatibleComponents(result?: SemanticResult) {
  const fields = result?.fields ?? [];
  const numbers = fields.filter(isMeasure);
  const find = (...types: string[]) =>
    fields.find(
      (f) => types.includes(f.semanticType ?? "") || types.includes(f.type),
    );
  const date = find("date", "datetime", "timestamp"),
    lat = find("latitude"),
    lon = find("longitude"),
    img = find("image"),
    title = find("title");
  const collection = Array.isArray(result?.data),
    count = collection
      ? (result!.data as unknown[]).length
      : result?.data == null
        ? 0
        : 1;
  const rows = (
    collection ? (result!.data as unknown[]) : [result?.data]
  ).filter(
    (r): r is Record<string, unknown> =>
      !!r && typeof r === "object" && !Array.isArray(r),
  );
  const scenarios = rows.map((row) => scenarioFor(row));
  return componentDefinitions
    .map((d) => {
      let compatible = true,
        score = 35,
        reason = "Displays record fields without assumptions.",
        requirements: string[] = [];
      if (d.id === "json") {
        score = 10;
        reason = "Inspect the complete value.";
      }
      if (["table", "list", "cards", "comparison"].includes(d.id)) {
        score = collection ? 70 : 40;
        reason = collection
          ? `${count} records can be compared or browsed.`
          : "One record is available.";
      }
      if (numberViews.has(d.id)) {
        compatible = !!numbers.length;
        score = count === 1 ? 90 : 45;
        requirements = ["numeric field"];
        reason = `${numbers.length} quantitative fields detected.`;
      }
      if (chartViews.has(d.id)) {
        compatible = collection && !!numbers.length;
        requirements = ["collection", "numeric field"];
        score = 70;
        reason = "Collection has quantitative values.";
        if (["line-chart", "area-chart"].includes(d.id)) {
          compatible &&= !!date;
          score = d.id === "line-chart" ? 94 : 88;
          requirements.push("temporal field");
          reason = "Temporal and quantitative fields form a time series.";
        }
        if (d.id === "scatter") {
          compatible &&= numbers.length >= 2;
          score = 72;
          requirements.push("second numeric field");
          reason = "Two quantitative fields can share numeric axes.";
        }
        if (d.id === "histogram") {
          score = 75;
          reason = "One quantitative field supports a frequency distribution.";
        }
        if (d.id === "pie") {
          compatible &&= count <= 12;
          score = 55;
          requirements.push("at most 12 records");
        }
      }
      if (d.id === "map") {
        compatible = !!lat && !!lon;
        score = 100;
        requirements = ["latitude", "longitude"];
        reason = "Latitude and longitude identify geographic points.";
      }
      if (["gallery", "image"].includes(d.id)) {
        compatible = !!img;
        score =
          (d.id === "gallery" && collection) ||
          (d.id === "image" && !collection)
            ? 98
            : 82;
        requirements = ["image URL"];
        reason = "Validated image URLs detected.";
      }
      if (["calendar", "timeline"].includes(d.id)) {
        compatible = !!date;
        score = 82;
        requirements = ["temporal field"];
        reason = "Dated records can be ordered or grouped by day.";
      }
      if (d.id === "document") {
        compatible =
          !!title && !!find("description", "doi", "person", "organization");
        score = 96;
        requirements = ["title", "description, author or document identifier"];
        reason = "Document title and publication fields detected.";
      }
      if (d.id === "media") {
        compatible = !!find("audio", "video");
        score = 99;
        requirements = ["audio or video URL"];
        reason = "Playable media URL detected.";
      }
      if (["embed", "video", "audio"].includes(d.id)) {
        const media = find("audio", "video");
        const candidates = rows.map((row) =>
          embedSource(
            media ? { ...row, url: readPath(row, media.key) } : row,
            d.id,
          ),
        );
        compatible = candidates.some((s) => s.kind !== "invalid");
        score =
          rows.some((row) => row.embed_url || row.video_url || row.audio_url) ||
          candidates.some((s) => s.trusted)
            ? 105
            : d.id === "embed"
              ? 25
              : 20;
        if (d.id === "video") score = find("video") ? 106 : 20;
        if (d.id === "audio") score = find("audio") ? 106 : 20;
        requirements = ["public HTTPS media or embed URL"];
        reason =
          "Playback is controlled by the source. Loading an iframe does not verify provider access.";
      }
      if (d.id === "stock-chart") {
        const prices = rows.map(pricePoint);
        compatible =
          collection && prices.some((p) => p.time && p.close !== undefined);
        score = prices.some((p) => p.ohlc)
          ? 115
          : rows.some((r) => r.close !== undefined || r.symbol || r.ticker)
            ? 98
            : 25;
        requirements = ["dated close prices; OHLC for candles"];
        reason =
          "Plots supplied prices and optional volume without inventing missing values.";
      }
      if (d.id === "note") {
        compatible = rows.some(
          (r) => typeof r.body === "string" || typeof r.text === "string",
        );
        score = result?.metadata.canvasContent ? 120 : 30;
        requirements = ["body or text"];
      }
      if (d.id === "file") {
        compatible =
          !!result?.metadata.canvasContent ||
          rows.some((r) => r.url || r.file || r.filename);
        score =
          (result?.metadata.canvasContent as any)?.kind === "file" ? 125 : 20;
        requirements = ["a supplied file or public file URL"];
      }
      if (d.id === "weather") {
        compatible = !!result?.metadata.current;
        score = 95;
        requirements = ["current conditions metadata"];
        reason = "Current conditions are available.";
      }
      if (d.id === "graph") {
        const v = result?.data as any;
        compatible = !!v && Array.isArray(v.nodes) && Array.isArray(v.edges);
        score = 98;
        requirements = ["nodes and edges"];
        reason = "Explicit node and edge collections detected.";
      }
      if (scenarioKinds.includes(d.id as ScenarioKind)) {
        const matches = rows.filter(
          (row) => scenarioFor(row, d.id).kind === d.id,
        ).length;
        compatible = matches > 0;
        score =
          d.id === "places"
            ? 97
            : scenarios.some((s) => s.kind === d.id)
              ? 110
              : 65;
        requirements = [
          d.id === "sports-score"
            ? "home_team and away_team"
            : d.id === "sports-team"
              ? "team record or wins and losses"
              : d.id === "places"
                ? "address or coordinates"
                : `${d.id} fields; inspect the component slots`,
        ];
        reason = `${matches} of ${rows.length} records match this view. Unmatched records remain available as details.`;
      }
      const bindings: Record<string, { path: string }> = {};
      const scenario = scenarios.find((s) => s.kind === d.id);
      if (scenario)
        for (const slot of Object.keys(scenario.values)) {
          const path = fields.some((f) => f.key === slot)
            ? slot
            : scenario.mappings[slot];
          if (path) bindings[slot] = { path };
        }
      if (title) bindings.title = { path: title.key };
      if (img) bindings.image_url = { path: img.key };
      if (date) bindings.time = { path: date.key };
      if (lat) bindings.latitude = { path: lat.key };
      if (lon) bindings.longitude = { path: lon.key };
      if (numbers[0]) bindings.value = { path: numbers[0].key };
      const x =
        d.id === "scatter"
          ? numbers[0]?.key
          : (date?.key ?? title?.key ?? result?.dimensions[0]);
      const y = d.id === "scatter" ? numbers[1]?.key : numbers[0]?.key;
      return {
        ...d,
        compatible: result ? compatible : true,
        score: result && compatible ? score : 0,
        reason: compatible ? reason : `Requires ${requirements.join(", ")}.`,
        requires: requirements,
        bindings,
        presentation: {
          type: d.id,
          ...(x ? { xField: x } : {}),
          ...(y ? { yField: y } : {}),
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}
