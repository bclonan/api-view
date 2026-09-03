import type { Row } from "../types";
import { readPath } from "./fields";

export const scenarioKinds = ["sports-score", "sports-team", "places", "news", "events", "person", "product"] as const;
export type ScenarioKind = (typeof scenarioKinds)[number];
const record = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const scalar = (value: unknown) => text(value) || (typeof value === "number" && Number.isFinite(value));
const name = (value: unknown) => record(value) ? value.displayName ?? value.fullName ?? value.name : value;

/** Shape checks, not hostname checks. Explicit response paths always take priority. */
export function scenarioCollection(raw: Row): { data: unknown; collectionPath: string } | undefined {
  if (record(raw.team) && record(raw.team.record)) return { data: raw.team, collectionPath: "team" };
  if (record(raw.record) && (raw.displayName || raw.name)) return { data: raw, collectionPath: "$" };
  if (Array.isArray(raw.dates) && raw.dates.every(d => record(d) && Array.isArray(d.games)))
    return { data: raw.dates.flatMap(d => (d as Row).games as unknown[]), collectionPath: "dates[].games[]" };
  for (const key of ["events", "games", "articles", "locations", "places", "people", "products"])
    if (Array.isArray(raw[key])) return { data: raw[key], collectionPath: key };
  return undefined;
}

export function scenarioFor(row: Row): { kind?: ScenarioKind; values: Row; mappings: Record<string, string> } {
  const values: Row = {}, mappings: Record<string, string> = {};
  const pick = (slot: string, paths: string[], convert: (v: unknown) => unknown = v => v) => {
    for (const path of [slot, ...paths]) {
      const value = convert(readPath(row, path));
      if (scalar(value)) { values[slot] = value; mappings[slot] = path; return value; }
    }
  };
  pick("title", ["headline", "displayName", "fullName", "name", "label"]);
  pick("description", ["summary", "abstract", "snippet", "bio"]);
  pick("image_url", ["image", "thumbnail", "photo", "avatar", "logos[0].href", "images[0].url"], v => record(v) ? v.url : v);
  pick("url", ["link", "links[0].href", "website"]);
  pick("time", ["startDate", "gameDate", "date", "publishedAt", "pubDate", "published", "datePublished"]);
  const schemaType = String(row["@type"] ?? row.type ?? "").toLowerCase();
  const competition = record(row.competitions?.[0 as never]) ? (row.competitions as Row[])[0] : row;
  const competitors = Array.isArray(competition.competitors) ? competition.competitors.filter(record) : [];
  const home = competitors.find(c => c.homeAway === "home"), away = competitors.find(c => c.homeAway === "away");
  pick("home_team", ["teams.home.team", "homeTeam", "home.name"], name);
  pick("away_team", ["teams.away.team", "awayTeam", "away.name"], name);
  if (home && !values.home_team) { values.home_team = name(home.team ?? home.athlete); mappings.home_team = "competitions[0].competitors[homeAway=home].team.displayName"; }
  if (away && !values.away_team) { values.away_team = name(away.team ?? away.athlete); mappings.away_team = "competitions[0].competitors[homeAway=away].team.displayName"; }
  if (text(values.home_team) && text(values.away_team)) {
    pick("home_score", ["teams.home.score", "homeScore", "home.score"]);
    pick("away_score", ["teams.away.score", "awayScore", "away.score"]);
    // ESPN may return a scalar score or a score object. Zero is a valid score.
    for (const [slot, competitor] of [["home_score", home], ["away_score", away]] as const) {
      const score = record(competitor?.score) ? competitor.score.value : competitor?.score;
      if (values[slot] === undefined && scalar(score)) values[slot] = score;
    }
    pick("status_label", ["status.type.detail", "status.detailedState", "status.type.description", "status", "state"]);
    pick("venue", ["venue.name", "venue.fullName", "location.name"]);
    pick("season_label", ["season.year", "season"]);
    return { kind: "sports-score", values, mappings };
  }
  const records = record(row.record) && Array.isArray(row.record.items) ? row.record.items.filter(record) : [];
  const total = records.find(r => r.type === "total" || r.name === "overall") ?? records[0];
  const stats = Array.isArray(total?.stats) ? total.stats.filter(record) : Array.isArray(row.stats) ? row.stats.filter(record) : [];
  pick("record_summary", ["recordSummary", "record.summary"]);
  if (total && text(total.summary)) values.record_summary = total.summary;
  for (const field of ["wins", "losses", "ties", "rank", "streak"]) {
    pick(field, []);
    const stat = stats.find(s => s.name === field);
    if (values[field] === undefined && stat && scalar(stat.displayValue ?? stat.value)) values[field] = stat.displayValue ?? stat.value;
  }
  if (records.length || (stats.length && text(row.summary)) || (values.wins !== undefined && values.losses !== undefined)) {
    if (!values.record_summary && text(row.summary)) values.record_summary = row.summary;
    if (!values.title && text(row.type)) values.title = row.type === "total" ? "Overall record" : row.type === "road" ? "Away record" : `${row.type} record`;
    for (const [slot, type] of [["home_record", "home"], ["away_record", "road"]]) {
      const item = records.find(r => r.type === type);
      if (item && text(item.summary)) values[slot] = item.summary;
    }
    return { kind: "sports-team", values, mappings };
  }
  pick("address", ["formatted_address", "formattedAddress", "display_name", "location.address"], v => record(v) ? [v.streetAddress ?? v.address1, v.addressLocality ?? v.city, v.addressRegion ?? v.state, v.postalCode, name(v.addressCountry)].filter(scalar).join(", ") : v);
  pick("latitude", ["lat", "geo.latitude", "location.latitude", "location.lat"]);
  pick("longitude", ["lng", "lon", "geo.longitude", "location.longitude", "location.lng"]);
  pick("venue", ["location.name", "venue.name"]);
  if (schemaType.includes("event") || (values.time && (row.startDate || row.endDate || values.venue))) {
    pick("end_time", ["endDate", "endTime"]);
    pick("status_label", ["eventStatus", "status"]);
    return { kind: "events", values, mappings };
  }
  if (values.address || (values.latitude !== undefined && values.longitude !== undefined)) return { kind: "places", values, mappings };
  if (schemaType.includes("person") || row.jobTitle || (row.firstName && row.lastName)) {
    if (!values.title && row.firstName && row.lastName) values.title = `${row.firstName} ${row.lastName}`;
    pick("role", ["jobTitle", "occupation"]);
    pick("organization", ["worksFor", "company", "affiliation"], name);
    pick("email", []);
    return { kind: "person", values, mappings };
  }
  if (schemaType.includes("product") || (values.title && (row.price !== undefined || record(row.offers)))) {
    pick("price", ["offers.price"]);
    pick("currency", ["offers.priceCurrency", "priceCurrency"]);
    pick("availability", ["offers.availability", "stockStatus"]);
    pick("rating", ["aggregateRating.ratingValue", "rating.rate", "rating"]);
    return { kind: "product", values, mappings };
  }
  if (schemaType.includes("newsarticle") || (values.title && values.url && (row.headline || row.pubDate || row.publishedAt || row.published || row.datePublished))) {
    pick("author", ["creator", "byline"], name);
    pick("publisher", ["source", "provider"], name);
    return { kind: "news", values, mappings };
  }
  return { values: {}, mappings: {} };
}

export function normalizeScenario(row: Row): Row {
  const { kind, values } = scenarioFor(row);
  // Keep the original row intact; canonical slots are added only when absent.
  return kind ? { ...values, ...row } : row;
}
