import {
  presentations,
  type PresentationType,
  type SemanticResult,
} from "../types";
import { isMeasure } from "../runtime/semantics";
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
    ],
    additionalSlots: true,
    props: {
      compact: { type: "boolean", default: false },
      numberFormat: { enum: ["compact", "standard"], default: "compact" },
      showSource: { type: "boolean", default: true },
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
      const bindings: Record<string, { path: string }> = {};
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
