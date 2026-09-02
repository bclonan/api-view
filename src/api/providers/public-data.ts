import { queryUrl } from "../defineApi";
import { inferStructure } from "../../runtime/structure";
import type {
  ApiDefinition,
  Operation,
  InputDefinition,
  Row,
  PresentationType,
} from "../../types";
const text = (
  label: string,
  defaultValue?: string,
  required = false,
): InputDefinition => ({
  type: "string",
  label,
  required,
  ...(defaultValue !== undefined ? { default: defaultValue } : {}),
});
const count = (label = "Results", value = 12, max = 50): InputDefinition => ({
  type: "integer",
  label,
  default: value,
  minimum: 1,
  maximum: max,
});
const choices = (
  label: string,
  values: string[],
  value = values[0],
): InputDefinition => ({ ...text(label, value), enum: values });
const date = (label: string): InputDefinition => ({ type: "date", label });
type Endpoint = {
  id: string;
  capabilityId: string;
  title: string;
  description: string;
  endpoint: string;
  inputs: Record<string, InputDefinition>;
  sample: unknown;
  intents: string[];
  example: string;
  exampleArgs: Row;
  query?: (args: Row) => Row;
  extract?: (raw: any) => unknown;
  path?: (args: Row) => string;
  view?: PresentationType;
  collectionPath?: string;
  ttl?: number;
  expand?: Operation["expand"];
};
export function endpoint(d: Endpoint): Operation {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    endpoint: d.endpoint,
    inputs: d.inputs,
    method: "GET",
    buildUrl: (a) =>
      queryUrl(d.path?.(a) ?? d.endpoint, d.query ? d.query(a) : a),
    extract: d.extract ?? ((raw) => inferStructure(raw, d.collectionPath).data),
    sample: () => structuredClone(d.sample),
    collectionPath: d.collectionPath,
    cacheTtlMs: d.ttl ?? 3600000,
    expand: d.expand,
    capability: {
      id: d.capabilityId,
      intents: d.intents,
      examples: [{ prompt: d.example, arguments: d.exampleArgs }],
      views: d.view ? [d.view, "table", "json"] : ["table", "record", "json"],
    },
  };
}
const source = (
  id: string,
  name: string,
  categories: string[],
  docs: string,
  operations: Operation[],
  description: string,
): ApiDefinition => ({
  id,
  name,
  categories,
  docs,
  operations,
  description,
  keywords: operations.flatMap((o) => o.capability?.intents ?? []),
  icon: "globe",
  browser: { expectedCors: "unknown" },
});
const paperSample = {
  message: {
    "total-results": 2,
    items: [
      {
        DOI: "10.5555/sample.1",
        title: ["Illustrative earthquake monitoring study"],
        author: [{ given: "Alex", family: "Example" }],
        publisher: "Sample research publisher",
        published: { "date-parts": [[2025, 6, 1]] },
        URL: "https://example.com/paper-1",
        "is-referenced-by-count": 42,
        type: "journal-article",
        abstract: "Illustrative metadata for testing the document view.",
      },
      {
        DOI: "10.5555/sample.2",
        title: ["Illustrative seismic sensor study"],
        author: [{ given: "Sam", family: "Example" }],
        publisher: "Sample research publisher",
        published: { "date-parts": [[2024, 9, 12]] },
        URL: "https://example.com/paper-2",
        "is-referenced-by-count": 18,
        type: "journal-article",
      },
    ],
  },
};
const paperRows = (raw: any) => {
  const works = raw.message?.items ?? (raw.message ? [raw.message] : []);
  return works.map((r: any) => {
    const parts =
      r.published?.["date-parts"]?.[0] ?? r.issued?.["date-parts"]?.[0] ?? [];
    return {
      ...r,
      title: r.title?.[0] ?? "Untitled work",
      authors: (r.author ?? [])
        .map((a: any) => [a.given, a.family].filter(Boolean).join(" "))
        .join(", "),
      publication_year: parts[0],
      published: parts[0]
        ? `${parts[0]}-${String(parts[1] ?? 1).padStart(2, "0")}-${String(parts[2] ?? 1).padStart(2, "0")}`
        : null,
      description: r.abstract ?? "",
      citations: r["is-referenced-by-count"] ?? 0,
      url: r.URL,
    };
  });
};
const artworkSample = {
  data: [
    {
      id: 1,
      title: "Illustrative water lilies",
      artist_title: "Claude Monet",
      date_display: "1906",
      date_start: 1906,
      image_id: "sample-id",
      is_public_domain: true,
      medium_display: "Oil on canvas",
    },
  ],
  config: { iiif_url: "https://www.artic.edu/iiif/2" },
};
const artworkRows = (raw: any) =>
  (Array.isArray(raw.data) ? raw.data : [raw.data])
    .filter(Boolean)
    .map((r: any) => ({
      ...r,
      author: r.artist_title,
      date: r.date_start ? `${r.date_start}-01-01` : null,
      image_url:
        r.image_id && r.image_id !== "sample-id"
          ? `${raw.config?.iiif_url ?? "https://www.artic.edu/iiif/2"}/${encodeURIComponent(r.image_id)}/full/843,/0/default.jpg`
          : r.image_id === "sample-id"
            ? "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=640"
            : null,
      url: `https://www.artic.edu/artworks/${r.id}`,
      description: r.medium_display,
    }));
const artFields =
  "id,title,artist_title,artist_display,date_display,date_start,image_id,thumbnail,classification_title,medium_display,is_public_domain";
const chemicalSample = {
  PropertyTable: {
    Properties: [
      {
        CID: 2244,
        MolecularFormula: "C9H8O4",
        MolecularWeight: 180.16,
        ConnectivitySMILES: "CC(=O)OC1=CC=CC=C1C(=O)O",
        XLogP: 1.2,
        TPSA: 63.6,
        HBondDonorCount: 1,
        HBondAcceptorCount: 4,
      },
    ],
  },
};
const chemicalProperties =
  "MolecularFormula,MolecularWeight,ConnectivitySMILES,SMILES,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount";
const chemicalRows = (r: any) =>
  (r.PropertyTable?.Properties ?? []).map((p: any) => ({
    ...p,
    title: `Compound ${p.CID}`,
    url: `https://pubchem.ncbi.nlm.nih.gov/compound/${p.CID}`,
  }));
const trialSample = {
  studies: [
    {
      protocolSection: {
        identificationModule: {
          nctId: "NCT00000000",
          briefTitle: "Illustrative research study",
        },
        statusModule: {
          overallStatus: "RECRUITING",
          startDateStruct: { date: "2025-01-01" },
        },
        conditionsModule: { conditions: ["Illustrative condition"] },
        descriptionModule: {
          briefSummary:
            "Sample public research metadata. This is not a real trial.",
        },
        sponsorCollaboratorsModule: {
          leadSponsor: { name: "Example research institute" },
        },
        designModule: { phases: ["PHASE1"] },
        contactsLocationsModule: {
          locations: [
            {
              city: "Baltimore",
              country: "United States",
              geoPoint: { lat: 39.29, lon: -76.61 },
            },
          ],
        },
      },
    },
  ],
};
const trialRows = (r: any) =>
  (r.studies ?? (r.protocolSection ? [r] : [])).map((s: any) => {
    const p = s.protocolSection ?? {};
    return {
      ...s,
      id: p.identificationModule?.nctId,
      title: p.identificationModule?.briefTitle,
      status: p.statusModule?.overallStatus,
      conditions: p.conditionsModule?.conditions,
      description: p.descriptionModule?.briefSummary,
      sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name,
      phase: p.designModule?.phases,
      start_date: p.statusModule?.startDateStruct?.date,
      latitude: p.contactsLocationsModule?.locations?.[0]?.geoPoint?.lat,
      longitude: p.contactsLocationsModule?.locations?.[0]?.geoPoint?.lon,
      url: `https://clinicaltrials.gov/study/${p.identificationModule?.nctId}`,
    };
  });
const locSample = {
  results: [
    {
      id: "https://www.loc.gov/item/example/",
      title: "Illustrative Baltimore photograph",
      date: "1920-01-01",
      description: ["A sample historical record."],
      image_url: [
        "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=640",
      ],
      url: "https://www.loc.gov/",
    },
  ],
};
const locRows = (r: any) =>
  (r.results ?? (r.item ? [r.item] : [])).map((v: any) => ({
    ...v,
    image_url: v.image_url?.[0],
    description: Array.isArray(v.description)
      ? v.description.join(" ")
      : v.description,
  }));
const hnSample = [
  {
    id: 1,
    title: "Illustrative developer story",
    by: "example",
    score: 120,
    descendants: 32,
    time: 1788264000,
    url: "https://example.com/story",
    type: "story",
  },
  {
    id: 2,
    title: "Illustrative open-source project",
    by: "sample",
    score: 85,
    descendants: 14,
    time: 1788267600,
    url: "https://example.com/project",
    type: "story",
  },
];

export const firstWave: ApiDefinition[] = [
  source(
    "artic",
    "Art Institute of Chicago",
    ["Art", "Images"],
    "https://api.artic.edu/docs/",
    [
      endpoint({
        id: "search",
        capabilityId: "artwork.search",
        title: "Search artworks",
        description:
          "Search museum artworks with images, artist names and dates.",
        endpoint: "https://api.artic.edu/api/v1/artworks/search",
        inputs: {
          q: text("Search", "Monet", true),
          limit: count(),
          page: count("Page", 1, 100),
          fields: text("Selected API fields", artFields),
        },
        sample: artworkSample,
        intents: [
          "art",
          "artwork",
          "paintings",
          "Monet",
          "museum",
          "artist",
          "gallery",
        ],
        example: "Find Monet paintings",
        exampleArgs: { q: "Monet" },
        extract: artworkRows,
        view: "gallery",
        ttl: 86400000,
      }),
      endpoint({
        id: "artwork",
        capabilityId: "artwork.get",
        title: "Get an artwork",
        description: "Retrieve an artwork by its museum ID.",
        endpoint: "https://api.artic.edu/api/v1/artworks",
        path: (a) =>
          `https://api.artic.edu/api/v1/artworks/${encodeURIComponent(String(a.id))}`,
        inputs: { id: count("Artwork ID", 27992, 10000000) },
        query: () => ({ fields: artFields }),
        sample: artworkSample,
        intents: ["artwork ID", "art detail"],
        example: "Get artwork 27992",
        exampleArgs: { id: 27992 },
        extract: artworkRows,
        view: "record",
      }),
    ],
    "Artworks and their public museum metadata.",
  ),
  source(
    "crossref",
    "Crossref",
    ["Research", "Knowledge"],
    "https://api.crossref.org/swagger-ui/index.html",
    [
      endpoint({
        id: "works",
        capabilityId: "research.search",
        title: "Search research papers",
        description:
          "Search scholarly metadata by topic, author or title. Sort by publication date or citations.",
        endpoint: "https://api.crossref.org/works",
        inputs: {
          query: text("Topic", "earthquakes", true),
          author: text("Author"),
          from: date("Published after"),
          rows: count(),
          sort: choices("Sort by", [
            "relevance",
            "published",
            "is-referenced-by-count",
          ]),
          order: choices("Order", ["desc", "asc"]),
        },
        query: (a) => ({
          query: a.query,
          "query.author": a.author,
          rows: a.rows,
          sort: a.sort,
          order: a.order,
          filter: a.from ? `from-pub-date:${a.from}` : undefined,
        }),
        sample: paperSample,
        intents: [
          "research",
          "papers",
          "academic",
          "scholarly",
          "publications",
          "citation",
          "DOI",
        ],
        example: "Find recent papers about WebMCP",
        exampleArgs: { query: "WebMCP", sort: "published" },
        extract: paperRows,
        view: "document",
        collectionPath: "message.items",
        ttl: 21600000,
      }),
      endpoint({
        id: "doi",
        capabilityId: "research.lookupDoi",
        title: "Look up a DOI",
        description: "Get published metadata for an exact DOI.",
        endpoint: "https://api.crossref.org/works",
        path: (a) =>
          `https://api.crossref.org/works/${encodeURIComponent(String(a.doi))}`,
        inputs: { doi: text("DOI", undefined, true) },
        query: () => ({}),
        sample: { message: paperSample.message.items[0] },
        intents: ["DOI lookup", "exact paper"],
        example: "Look up a DOI",
        exampleArgs: { doi: "10.1038/nphys1170" },
        extract: paperRows,
        view: "document",
      }),
    ],
    "Scholarly publication metadata and citation counts.",
  ),
  source(
    "pubchem",
    "PubChem",
    ["Chemistry", "Research"],
    "https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest",
    [
      ...["name", "cid"].map((kind) =>
        endpoint({
          id: kind,
          capabilityId:
            kind === "name" ? "compound.lookupByName" : "compound.lookupByCid",
          title: kind === "name" ? "Look up a compound" : "Get compound by CID",
          description:
            "Chemical formula and measured or computed properties. Public scientific data.",
          endpoint: "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound",
          path: (a) =>
            `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${kind}/${encodeURIComponent(String(a[kind]))}/property/${chemicalProperties}/JSON`,
          inputs: {
            [kind]: text(
              kind === "name" ? "Compound name" : "Compound CID",
              kind === "name" ? "caffeine" : undefined,
              true,
            ),
          },
          query: () => ({}),
          sample: chemicalSample,
          intents:
            kind === "name"
              ? [
                  "compound",
                  "chemical",
                  "caffeine",
                  "aspirin",
                  "ibuprofen",
                  "molecular",
                  "formula",
                ]
              : ["CID", "compound identifier"],
          example:
            kind === "name" ? "Look up caffeine" : "Look up compound 2244",
          exampleArgs: { [kind]: kind === "name" ? "caffeine" : "2244" },
          extract: chemicalRows,
          view: "record",
          ttl: 86400000,
        }),
      ),
    ],
    "Chemical structures and properties from public research data.",
  ),
  source(
    "clinical-trials",
    "ClinicalTrials.gov",
    ["Health", "Research"],
    "https://clinicaltrials.gov/data-api/api",
    [
      endpoint({
        id: "search",
        capabilityId: "clinicalTrial.search",
        title: "Search clinical trials",
        description:
          "Public research data, not medical advice. Search registered studies by condition, intervention, location or recruitment status.",
        endpoint: "https://clinicaltrials.gov/api/v2/studies",
        inputs: {
          condition: text("Condition"),
          intervention: text("Intervention"),
          location: text("Location"),
          status: choices("Recruitment status", [
            "",
            "RECRUITING",
            "NOT_YET_RECRUITING",
            "COMPLETED",
            "ACTIVE_NOT_RECRUITING",
          ]),
          pageSize: count(),
        },
        query: (a) => ({
          "query.cond": a.condition,
          "query.intr": a.intervention,
          "query.locn": a.location,
          "filter.overallStatus": a.status,
          pageSize: a.pageSize,
          format: "json",
        }),
        sample: trialSample,
        intents: [
          "clinical trials",
          "recruiting",
          "studies",
          "intervention",
          "condition",
        ],
        example: "Find recruiting trials mentioning caffeine",
        exampleArgs: { intervention: "caffeine", status: "RECRUITING" },
        extract: trialRows,
        view: "list",
        collectionPath: "studies",
      }),
    ],
    "Registered clinical studies. Public research data, not medical advice.",
  ),
  source(
    "data-usa",
    "Data USA",
    ["Population", "Government"],
    "https://datausa.io/about/api/",
    [
      endpoint({
        id: "population",
        capabilityId: "population.query",
        title: "Population by state and year",
        description:
          "Query ACS state population. State IDs use Census geography codes such as 04000US24 for Maryland.",
        endpoint: "https://api.datausa.io/tesseract/data.jsonrecords",
        inputs: {
          year: count("Year", 2023, 2100),
          state: text("State geography ID"),
          limit: count("Results", 52, 100),
        },
        query: (a) => ({
          cube: "acs_yg_total_population_5",
          drilldowns: "State,Year",
          measures: "Population",
          include: `Year:${a.year}${a.state ? `;State:${a.state}` : ""}`,
          limit: `${a.limit},0`,
        }),
        sample: {
          data: [
            { State: "Maryland", Year: 2023, Population: 6177224 },
            { State: "Virginia", Year: 2023, Population: 8642274 },
          ],
        },
        intents: ["population", "demographic", "state population", "ACS"],
        example: "Compare state populations in 2023",
        exampleArgs: { year: 2023 },
        collectionPath: "data",
        view: "bar-chart",
      }),
    ],
    "ACS population by state using the current Data USA API.",
  ),
  source(
    "frankfurter",
    "Frankfurter",
    ["Finance"],
    "https://frankfurter.dev/",
    [
      endpoint({
        id: "rates",
        capabilityId: "currency.history",
        title: "Exchange rates",
        description:
          "Daily reference exchange rates for one currency pair over an optional date range.",
        endpoint: "https://api.frankfurter.dev/v2/rates",
        query: (a) => ({
          base: a.base,
          quotes: a.quote,
          from: a.from,
          to: a.to,
        }),
        inputs: {
          base: text("Base currency", "USD", true),
          quote: text("Quote currency", "EUR", true),
          from: date("From date"),
          to: date("To date"),
        },
        sample: [
          { date: "2025-01-02", base: "USD", quote: "EUR", rate: 0.97 },
          { date: "2025-01-03", base: "USD", quote: "EUR", rate: 0.969 },
        ],
        intents: ["currency", "exchange rate", "USD", "EUR", "GBP", "convert"],
        example: "Compare USD to EUR over the past year",
        exampleArgs: { base: "USD", quote: "EUR" },
        view: "line-chart",
        ttl: 3600000,
      }),
    ],
    "Daily currency reference rates.",
  ),
  source(
    "brewery",
    "Open Brewery DB",
    ["Places", "Geography"],
    "https://www.openbrewerydb.org/documentation",
    [
      endpoint({
        id: "search",
        capabilityId: "brewery.search",
        title: "Find breweries",
        description:
          "Search breweries by city, state or name with coordinates and website links.",
        endpoint: "https://api.openbrewerydb.org/v1/breweries",
        inputs: {
          city: text("City"),
          state: text("State"),
          name: text("Name"),
          per_page: count(),
        },
        query: (a) => ({
          by_city: a.city,
          by_state: a.state,
          by_name: a.name,
          per_page: a.per_page,
        }),
        sample: [
          {
            id: "sample-brewery",
            name: "Illustrative brewery",
            city: "Baltimore",
            state_province: "Maryland",
            latitude: "39.29",
            longitude: "-76.61",
            brewery_type: "micro",
            website_url: "https://example.com",
          },
        ],
        intents: ["breweries", "brewery", "beer", "taproom"],
        example: "Find breweries in Baltimore",
        exampleArgs: { city: "Baltimore" },
        view: "map",
      }),
    ],
    "Brewery locations, types and websites.",
  ),
  source(
    "nager-date",
    "Nager.Date",
    ["Events", "Travel"],
    "https://date.nager.at/Api",
    [
      endpoint({
        id: "holidays",
        capabilityId: "holiday.byCountryYear",
        title: "Public holidays",
        description: "National public holidays by ISO country code and year.",
        endpoint: "https://date.nager.at/api/v3/PublicHolidays",
        path: (a) =>
          `https://date.nager.at/api/v3/PublicHolidays/${a.year}/${encodeURIComponent(String(a.countryCode))}`,
        inputs: {
          countryCode: text("Country code", "US", true),
          year: count("Year", new Date().getUTCFullYear(), 2100),
        },
        query: () => ({}),
        sample: [
          {
            date: "2026-01-01",
            name: "New Year's Day",
            localName: "New Year's Day",
            countryCode: "US",
            global: true,
          },
          {
            date: "2026-07-04",
            name: "Independence Day",
            localName: "Independence Day",
            countryCode: "US",
            global: true,
          },
        ],
        intents: ["holidays", "holiday", "calendar", "public holidays"],
        example: "Show US public holidays in 2026",
        exampleArgs: { countryCode: "US", year: 2026 },
        view: "calendar",
        ttl: 604800000,
      }),
    ],
    "Public holidays by country and year.",
  ),
  source(
    "hacker-news",
    "Hacker News",
    ["Developer", "News"],
    "https://github.com/HackerNews/API",
    [
      endpoint({
        id: "stories",
        capabilityId: "hn.stories",
        title: "Hacker News stories",
        description:
          "Top, new, best, Ask HN, Show HN and job posts. Fetches a bounded set of story IDs then their records.",
        endpoint: "https://hacker-news.firebaseio.com/v0",
        path: (a) =>
          `https://hacker-news.firebaseio.com/v0/${a.feed}stories.json`,
        inputs: {
          feed: choices("Feed", ["top", "new", "best", "ask", "show", "job"]),
          limit: count("Results", 20, 50),
        },
        query: () => ({}),
        sample: hnSample,
        intents: [
          "hacker news",
          "HN",
          "developer news",
          "show hn",
          "job posts",
        ],
        example: "Show top Hacker News stories",
        exampleArgs: { feed: "top", limit: 20 },
        extract: (r) => r,
        view: "list",
        ttl: 300000,
        expand: {
          path: "$",
          parameter: "limit",
          max: 50,
          url: "https://hacker-news.firebaseio.com/v0/item/{id}.json",
        },
      }),
    ],
    "Public Hacker News stories and discussions.",
  ),
  source(
    "loc",
    "Library of Congress",
    ["History", "Images", "Books"],
    "https://www.loc.gov/apis/json-and-yaml/",
    [
      endpoint({
        id: "search",
        capabilityId: "loc.search",
        title: "Search historical collections",
        description:
          "Find photographs, maps, books, newspapers and recordings in Library of Congress collections.",
        endpoint: "https://www.loc.gov/search/",
        path: (a) =>
          `https://www.loc.gov/${a.format === "all" ? "search" : a.format}/`,
        inputs: {
          q: text("Search", "Baltimore", true),
          format: choices("Collection", [
            "all",
            "photos",
            "maps",
            "books",
            "newspapers",
            "audio",
            "film-and-videos",
          ]),
          c: count(),
          sp: count("Page", 1, 100),
        },
        query: (a) => ({
          q: a.q,
          c: a.c,
          sp: a.sp,
          fo: "json",
          at: "results,pagination",
        }),
        sample: locSample,
        intents: [
          "historical",
          "photographs",
          "history",
          "library of congress",
          "archives",
          "maps",
          "newspapers",
        ],
        example: "Find historical photographs of Baltimore",
        exampleArgs: { q: "Baltimore", format: "photos" },
        extract: locRows,
        collectionPath: "results",
        view: "gallery",
        ttl: 86400000,
      }),
    ],
    "Historical photographs, maps and documents.",
  ),
];
