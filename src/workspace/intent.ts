import { searchCapabilities, getCapability } from "../api/capabilities";
import { validateOperationArguments } from "../runtime/invoke";
import type { Row, PresentationType, Widget } from "../types";
export interface IntentStep {
  sourceId: string;
  capabilityId: string;
  params: Row;
  title: string;
  presentation?: PresentationType;
  width: number;
  reason: string;
  dependency?: { step: number; kind: "strongest-location" | "geocode" };
}
export interface IntentPlan {
  prompt: string;
  steps: IntentStep[];
  questions: string[];
  notes: string[];
  comparison?: boolean;
  edits?: { tool: string; input: Row; reason: string }[];
}
const date = (value: Date) => value.toISOString().slice(0, 10);
const daysBefore = (now: Date, days: number) =>
  date(new Date(now.getTime() - days * 86400000));
const clean = (s: string) =>
  s
    .trim()
    .replace(/[.!?]+$/, "")
    .replace(
      /\s+(and|then)\s+(show|add|find|map|chart|pick|choose|arrange).*$/i,
      "",
    )
    .trim();
export function planIntent(
  prompt: string,
  now = new Date(),
  context?: { widgets: Widget[]; selectedIds: string[] },
): IntentPlan {
  if (!prompt.trim() || prompt.length > 1500)
    throw new Error("Describe a goal in 1 to 1500 characters.");
  const q = prompt.toLowerCase(),
    plan: IntentPlan = {
      prompt,
      steps: [],
      questions: [],
      notes: [
        "This local planner uses catalog capabilities and explicit rules. Review inferred inputs before running.",
      ],
    };
  if (
    context?.widgets.length &&
    /duplicate|turn .* into|make (this|that|the)|only show|sort (this|these|the)|group (this|these|the)|move .*beside/.test(
      q,
    )
  ) {
    const edits: NonNullable<IntentPlan["edits"]> = [];
    const selected = context.widgets.filter((w) =>
      context.selectedIds.includes(w.id),
    );
    const quake = context.widgets.find((w) =>
      w.result?.fields.some((f) => f.semanticType === "magnitude"),
    );
    const papers = context.widgets.find((w) =>
      w.result?.fields.some((f) => f.semanticType === "doi"),
    );
    const weather = context.widgets.find((w) => w.result?.metadata.current);
    const target = /earthquake/.test(q)
      ? quake
      : /papers|research/.test(q)
        ? papers
        : /weather/.test(q)
          ? weather
          : selected.length === 1
            ? selected[0]
            : undefined;
    const change = (card: Widget, patch: Row, reason: string) =>
      edits.push({
        tool: "update_card",
        input: { cardId: card.id, ...patch },
        reason,
      });
    if (/duplicate/.test(q) && /histogram/.test(q) && quake)
      edits.push({
        tool: "duplicate_card",
        input: {
          cardId: quake.id,
          presentation: {
            type: "histogram",
            yField: quake.result?.fields.find(
              (f) => f.semanticType === "magnitude",
            )?.key,
          },
        },
        reason: "Reuse the earthquake response as a magnitude histogram.",
      });
    if (/papers/.test(q) && /table/.test(q) && papers) {
      const fields = ["title", "authors", "publication_year", "DOI"].filter(
        (key) => papers.result?.fields.some((f) => f.key === key),
      );
      change(
        papers,
        { presentation: { type: "table", fields }, width: 12 },
        "Display only title, authors, publication year and DOI from the existing research response.",
      );
    }
    if (/weather/.test(q) && /beside/.test(q) && weather && quake) {
      change(quake, { width: 8 }, "Reserve eight columns for the map.");
      change(
        weather,
        {
          width: 4,
          position: Math.min(
            context.widgets.length - 1,
            context.widgets.indexOf(quake) + 1,
          ),
        },
        "Move weather beside the map.",
      );
    }
    if (/smaller/.test(q) && quake)
      change(quake, { width: 8 }, "Reduce the map width.");
    if (!edits.length && target) {
      const type: PresentationType | undefined = /histogram/.test(q)
        ? "histogram"
        : /map/.test(q)
          ? "map"
          : /table/.test(q)
            ? "table"
            : /gallery/.test(q)
              ? "gallery"
              : /timeline/.test(q)
                ? "timeline"
                : undefined;
      if (type)
        change(
          target,
          { presentation: { type } },
          `Use the ${type} view with the existing data.`,
        );
      const min = /above\s+(\d+(\.\d+)?)/.exec(q)?.[1];
      if (min && quake)
        change(
          quake,
          {
            transforms: [
              ...(quake.transforms ?? []),
              {
                op: "filter",
                field: quake.result?.fields.find(
                  (f) => f.semanticType === "magnitude",
                )?.key,
                comparison: "gt",
                value: Number(min),
              },
            ],
          },
          "Filter magnitudes without another request.",
        );
      if (/latest first/.test(q)) {
        const dateField = target.result?.fields.find((f) =>
          ["date", "datetime"].includes(f.type),
        );
        if (dateField)
          change(
            target,
            {
              transforms: [
                ...(target.transforms ?? []),
                { op: "sort", field: dateField.key, direction: "desc" },
              ],
            },
            "Sort by the observed date field.",
          );
      }
    }
    plan.edits = edits;
    if (!edits.length)
      plan.questions.push(
        "Select one card and name a supported view or filter.",
      );
    return plan;
  }
  const add = (
    sourceId: string,
    capabilityId: string,
    params: Row,
    title: string,
    reason: string,
    presentation?: PresentationType,
    width = 6,
  ) => {
    getCapability(sourceId, capabilityId);
    plan.steps.push({
      sourceId,
      capabilityId,
      params,
      title,
      reason,
      presentation,
      width,
    });
    return plan.steps.length - 1;
  };
  const quoted = /["“]([^"”]+)["”]/.exec(prompt)?.[1];
  const topic = clean(
    quoted ??
      /(?:about|mentioning|on)\s+(.+?)(?:[,;]|\s+and\s+(?:find|show|add)|$)/i.exec(
        prompt,
      )?.[1] ??
      "",
  );
  const quake =
    /earthquakes?|seismic/.test(q) &&
    (!/papers?|research|publications/.test(q) ||
      /dashboard|map|magnitude|strongest|largest/.test(q));
  if (quake) {
    const magnitude =
      /magnitude\s*(\d+(?:\.\d+)?)/.exec(q)?.[1] ??
      /(\d+(?:\.\d+)?)\s*\+\s*earthquakes?/.exec(q)?.[1];
    const span = /(?:past|last)\s+(\d+)\s+days?/.exec(q)?.[1];
    const days = span
      ? Number(span)
      : /(?:last|past) (?:week|seven days)/.test(q)
        ? 7
        : /(?:last|past) month/.test(q)
          ? 30
          : 7;
    add(
      "usgs",
      "earthquake.search",
      {
        minmagnitude: magnitude
          ? Number(magnitude)
          : /science|research dashboard/.test(q)
            ? 5
            : 2.5,
        starttime: daysBefore(now, Math.min(days, 365)),
        endtime: date(now),
        limit: 50,
        orderby: "magnitude",
      },
      "Earthquake observations",
      `Magnitude ${magnitude ?? (/science|research dashboard/.test(q) ? 5 : 2.5)} and ${days} days are mapped to USGS filters.`,
      "map",
      8,
    );
  }
  if (/papers?|research|scholarly|academic|publications/.test(q)) {
    const query = /earthquake|seismic/.test(q)
      ? "earthquakes"
      : /caffeine/.test(q)
        ? "caffeine"
        : topic ||
          clean(
            prompt.replace(
              /^(find|show|add)( me)? (recent |academic |research )*(papers?|research|publications)\s*/i,
              "",
            ),
          );
    if (query)
      add(
        "crossref",
        "research.search",
        {
          query,
          rows: 12,
          sort: /cited|citations/.test(q)
            ? "is-referenced-by-count"
            : "published",
          ...(/recent/.test(q) ? { from: daysBefore(now, 365) } : {}),
        },
        `${query} research`,
        "Research requests use publication metadata, not a general web or image search.",
        "document",
        12,
      );
    else plan.questions.push("What topic should the research search cover?");
  }
  if (
    /compound|molecular|formula|\b(caffeine|aspirin|ibuprofen|acetaminophen)\b/.test(
      q,
    ) &&
    (!/papers?|trials?/.test(q) || /dashboard|look up|compound|compare/.test(q))
  ) {
    const names = /compare/.test(q)
      ? clean(prompt.replace(/^.*?compare\s+/i, ""))
          .split(/\s+and\s+|,\s*/)
          .slice(0, 4)
      : [
          /\b(caffeine|aspirin|ibuprofen|acetaminophen)\b/.exec(q)?.[1] ??
            topic ??
            "",
        ];
    names
      .filter(Boolean)
      .forEach((name) =>
        add(
          "pubchem",
          "compound.lookupByName",
          { name: clean(name) },
          clean(name),
          "Compound names map to PubChem name lookup.",
          "record",
          4,
        ),
      );
    plan.comparison = /compare/.test(q) && names.length > 1;
  }
  if (/clinical|trials?|recruiting/.test(q))
    add(
      "clinical-trials",
      "clinicalTrial.search",
      {
        intervention: /caffeine/.test(q) ? "caffeine" : topic || undefined,
        status: /recruiting/.test(q) ? "RECRUITING" : "",
        pageSize: 12,
      },
      "Clinical research",
      "Searches registered research records and explicit recruitment status.",
      "list",
      8,
    );
  if (/monet|paintings?|artworks?|museum art/.test(q)) {
    const query = /monet/.test(q)
      ? "Monet"
      : (quoted ??
        clean(
          prompt
            .replace(/^.*?(?:find|show|search)(?: me)?\s+/i, "")
            .replace(/\s*(paintings?|artworks?)$/i, ""),
        ));
    add(
      "artic",
      "artwork.search",
      { q: query, limit: 12 },
      `${query} artworks`,
      "Art searches use a museum collection with image metadata.",
      "gallery",
      8,
    );
  }
  if (/brewer/.test(q)) {
    const city = clean(/\bin\s+(.+)/i.exec(prompt)?.[1] ?? "");
    if (city)
      add(
        "brewery",
        "brewery.search",
        { city, per_page: 20 },
        `Breweries in ${city}`,
        "City becomes the brewery city filter.",
        "map",
      );
    else plan.questions.push("Which city or brewery name should I search?");
  }
  if (/holiday/.test(q)) {
    const country = /\b(us|usa|united states)\b/.test(q)
      ? "US"
      : /\b(uk|gb|united kingdom)\b/.test(q)
        ? "GB"
        : /\bcanada\b/.test(q)
          ? "CA"
          : /\bgermany\b/.test(q)
            ? "DE"
            : /\bfrance\b/.test(q)
              ? "FR"
              : /\bjapan\b/.test(q)
                ? "JP"
                : /\b([A-Z]{2})\b/.exec(prompt)?.[1];
    if (country)
      add(
        "nager-date",
        "holiday.byCountryYear",
        {
          countryCode: country,
          year: Number(/\b(20\d\d)\b/.exec(q)?.[1] ?? now.getUTCFullYear()),
        },
        `${country} holidays`,
        "Country and year select national public holidays.",
        "calendar",
      );
    else plan.questions.push("Which country should the holiday calendar use?");
  }
  if (/hacker news|\bhn\b/.test(q)) {
    const feeds = /dashboard/.test(q)
      ? [
          "top",
          ...(/show/.test(q) ? ["show"] : []),
          ...(/job/.test(q) ? ["job"] : []),
        ]
      : [
          /show hn/.test(q)
            ? "show"
            : /job/.test(q)
              ? "job"
              : /ask/.test(q)
                ? "ask"
                : /\bbest\b/.test(q)
                  ? "best"
                  : /\bnew\b/.test(q.replace(/hacker news/g, ""))
                    ? "new"
                    : "top",
        ];
    feeds.forEach((feed) =>
      add(
        "hacker-news",
        "hn.stories",
        { feed, limit: 20 },
        `Hacker News ${feed}`,
        "Uses the requested HN feed, capped at 20 item requests.",
        "list",
      ),
    );
  }
  if (
    /library of congress|archives|historical.*(?:photos|photographs|images|maps|records|media)|(?:photos|photographs|maps).*historical/.test(
      q,
    )
  ) {
    const query = /baltimore/.test(q)
      ? "Baltimore"
      : topic || quoted || clean(prompt.replace(/^.*?(?:of|in|about)\s+/i, ""));
    const formats = /dashboard|gallery.*maps|photographs.*maps/.test(q)
      ? ["photos", "maps"]
      : [/maps/.test(q) ? "maps" : "photos"];
    formats.forEach((format) =>
      add(
        "loc",
        "loc.search",
        { q: query, format, c: 12 },
        `${query} ${format}`,
        "Historical media searches use Library of Congress format collections.",
        "gallery",
      ),
    );
  }
  if (/currency|exchange|\bUSD\b|\bEUR\b|\bGBP\b/i.test(prompt)) {
    const codes = prompt.match(/\b[A-Z]{3}\b/g) ?? [];
    if (codes.length >= 2)
      add(
        "frankfurter",
        "currency.history",
        {
          base: codes[0],
          quote: codes[1],
          ...(/past year|last year/.test(q)
            ? { from: daysBefore(now, 365), to: date(now) }
            : {}),
        },
        `${codes[0]} / ${codes[1]}`,
        "Currency codes and dates map to reference rate parameters.",
        "line-chart",
      );
    else
      plan.questions.push("Which base and quote currency codes should I use?");
  }
  if (/population/.test(q)) {
    let remaining = q;
    const states = Object.entries(stateCodes)
      .sort((a, b) => b[0].length - a[0].length)
      .filter(([name]) => {
        const pattern = new RegExp(`\\b${name}\\b`);
        if (!pattern.test(remaining)) return false;
        remaining = remaining.replace(pattern, "");
        return true;
      });
    const year = Number(/\b(20\d\d)\b/.exec(q)?.[1] ?? 2023);
    if (/income|employment|trend|over time/.test(q))
      plan.questions.push(
        "This capability supports a state population snapshot for one year. Choose that scope, or select another capability in Discover.",
      );
    const targets = states.length ? states : [["All states", ""]];
    for (const [name, code] of targets)
      add(
        "data-usa",
        "population.query",
        { year, limit: 52, ...(code ? { state: `04000US${code}` } : {}) },
        `${name} population`,
        `${name} and ${year} map to explicit ACS geography and year filters.`,
        "bar-chart",
        8,
      );
    if (
      !states.length &&
      /\b(in|for)\b/.test(q) &&
      !/all states|united states|\bus\b/.test(q)
    )
      plan.questions.push(
        "Which US state should the population request use? This capability covers US states only.",
      );
  }
  if (
    /weather|forecast|temperature|precipitation/.test(q) ||
    (quake && /science|research dashboard/.test(q))
  ) {
    const days = Number(/next\s+(\d+)\s+days?/.exec(q)?.[1] ?? 7);
    const quakeStep = plan.steps.findIndex((s) => s.sourceId === "usgs");
    if (
      quakeStep >= 0 &&
      /largest|strongest|science|research dashboard/.test(q)
    ) {
      const i = add(
        "open-meteo",
        "weather.forecast",
        { forecast_days: days },
        "Weather near the strongest event",
        "Uses the coordinates from the largest returned earthquake.",
        "weather",
        4,
      );
      plan.steps[i].dependency = {
        step: quakeStep,
        kind: "strongest-location",
      };
    } else {
      const place = clean(
        /(?:weather|forecast|temperature|precipitation).*?\b(?:in|for|at)\s+(.+?)(?:\s+for\s+the|\s+and\s+|[.!?]|$)/i.exec(
          prompt,
        )?.[1] ??
          /(baltimore|washington|new york|london|paris|tokyo)/i.exec(
            prompt,
          )?.[1] ??
          "",
      );
      if (place) {
        const geocode = add(
          "geocoding",
          "search",
          { name: place },
          `Locate ${place}`,
          "Resolve the requested place to coordinates. Ambiguous matches require a choice.",
          "table",
        );
        const i = add(
          "open-meteo",
          "weather.forecast",
          {
            forecast_days: Math.min(16, days),
            hourly: "temperature_2m,precipitation_probability",
          },
          `${place} weather`,
          "Coordinates come from geocoding; forecast length comes from the request.",
          "weather",
          4,
        );
        plan.steps[i].dependency = { step: geocode, kind: "geocode" };
      } else
        plan.questions.push("Which location should the weather request use?");
    }
  }
  if (/treasury|federal debt/.test(q))
    add(
      "treasury",
      "debt-to-penny",
      { limit: /90/.test(q) ? 90 : 30 },
      "Federal debt",
      "Uses the Treasury debt series.",
      "area-chart",
      8,
    );
  if (/books?/.test(q) && !/historical|library of congress/.test(q))
    add(
      "open-library",
      "search",
      { q: topic || "architecture", limit: 6 },
      "Book search",
      "Searches book metadata.",
      "book",
    );
  if (/nasa|\bmars\b|\bmoon\b|space imagery/.test(q))
    add(
      "nasa",
      "search",
      {
        q: /mars/.test(q) ? "mars" : /moon/.test(q) ? "moon" : "earth",
        limit: 6,
      },
      "NASA imagery",
      "Uses a searchable space image archive.",
      "gallery",
    );
  if (!plan.steps.length) {
    const matches = searchCapabilities(prompt);
    plan.notes.push(
      matches.length
        ? `Relevant catalog capabilities: ${matches
            .slice(0, 3)
            .map((m) => m.title)
            .join(", ")}.`
        : "No matching capability found.",
    );
    plan.questions.push(
      "Choose a capability in Discover and review its inputs, or connect a WebMCP agent for broader planning.",
    );
  }
  for (const step of plan.steps) {
    step.params = Object.fromEntries(
      Object.entries(step.params).filter(([, value]) => value !== undefined),
    );
    try {
      const valid = validateOperationArguments(
        getCapability(step.sourceId, step.capabilityId).operation,
        step.params,
      );
      if (valid.missing.length && !step.dependency)
        plan.questions.push(`${step.title} needs ${valid.missing.join(", ")}.`);
    } catch (e) {
      plan.questions.push((e as Error).message);
    }
  }
  return plan;
}
const stateCodes: Record<string, string> = Object.fromEntries(
  "alabama:01,alaska:02,arizona:04,arkansas:05,california:06,colorado:08,connecticut:09,delaware:10,district of columbia:11,florida:12,georgia:13,hawaii:15,idaho:16,illinois:17,indiana:18,iowa:19,kansas:20,kentucky:21,louisiana:22,maine:23,maryland:24,massachusetts:25,michigan:26,minnesota:27,mississippi:28,missouri:29,montana:30,nebraska:31,nevada:32,new hampshire:33,new jersey:34,new mexico:35,new york:36,north carolina:37,north dakota:38,ohio:39,oklahoma:40,oregon:41,pennsylvania:42,rhode island:44,south carolina:45,south dakota:46,tennessee:47,texas:48,utah:49,vermont:50,virginia:51,washington:53,west virginia:54,wisconsin:55,wyoming:56"
    .split(",")
    .map((value) => value.split(":")),
);
