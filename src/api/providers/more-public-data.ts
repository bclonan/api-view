import { endpoint } from "./public-data";
import type { ApiDefinition, InputDefinition } from "../../types";
const text = (
  label: string,
  value?: string,
  required = false,
): InputDefinition => ({ type: "string", label, default: value, required });
const limit: InputDefinition = {
  type: "integer",
  label: "Results",
  default: 12,
  minimum: 1,
  maximum: 50,
};
export const morePublicData: ApiDefinition[] = [
  {
    id: "federal-register",
    name: "Federal Register",
    description: "Published federal rules, notices and proposed rules.",
    categories: ["Government", "Documents"],
    keywords: ["federal rules", "regulation", "notices", "rulemaking"],
    docs: "https://www.federalregister.gov/developers/documentation/api/v1",
    icon: "file-text",
    operations: [
      endpoint({
        id: "documents",
        capabilityId: "rules.search",
        title: "Search federal documents",
        description:
          "Search published federal documents by term and publication date.",
        endpoint: "https://www.federalregister.gov/api/v1/documents.json",
        inputs: {
          q: text("Search", "environment", true),
          from: { type: "date", label: "Published after" },
          per_page: limit,
        },
        query: (a) => ({
          "conditions[term]": a.q,
          "conditions[publication_date][gte]": a.from,
          per_page: a.per_page,
          order: "newest",
        }),
        sample: {
          results: [
            {
              title: "Illustrative public notice",
              abstract: "Sample document metadata.",
              publication_date: "2025-06-01",
              html_url: "https://www.federalregister.gov/",
              type: "Notice",
            },
          ],
        },
        extract: (r) =>
          (r.results ?? []).map((v: any) => ({
            ...v,
            description: v.abstract,
            url: v.html_url,
          })),
        intents: [
          "federal rules",
          "regulations",
          "notices",
          "federal register",
        ],
        example: "Find federal rules about clean water",
        exampleArgs: { q: "clean water" },
        view: "document",
      }),
    ],
  },
  {
    id: "fdic",
    name: "FDIC BankFind",
    description: "Bank institutions and recorded failures.",
    categories: ["Finance", "Government"],
    keywords: ["banks", "bank failures", "FDIC"],
    docs: "https://api.fdic.gov/banks/docs",
    icon: "landmark",
    operations: [
      endpoint({
        id: "failures",
        capabilityId: "bank.failures",
        title: "Bank failures",
        description:
          "Recorded failed institutions with state and closing date.",
        endpoint: "https://api.fdic.gov/banks/failures",
        inputs: { state: text("State abbreviation"), limit },
        query: (a) => ({
          filters: a.state
            ? `PSTALP:${String(a.state).replace(/[^A-Za-z]/g, "")}`
            : undefined,
          limit: a.limit,
          sort_by: "FAILDATE",
          sort_order: "DESC",
          fields: "NAME,CITY,PSTALP,FAILDATE,COST,RESTYPE",
        }),
        sample: {
          data: [
            {
              data: {
                NAME: "Illustrative bank",
                CITY: "Example city",
                PSTALP: "MD",
                FAILDATE: "2020-01-01",
                COST: 1000,
              },
            },
          ],
        },
        extract: (r) =>
          (r.data ?? []).map((v: any) => ({
            ...v.data,
            title: v.data.NAME,
            date: v.data.FAILDATE,
          })),
        intents: ["bank failures", "failed banks", "FDIC"],
        example: "Show bank failures",
        exampleArgs: { limit: 12 },
        view: "timeline",
      }),
    ],
  },
  {
    id: "bls",
    name: "Bureau of Labor Statistics",
    description: "Employment and price index time series.",
    categories: ["Government", "Economy"],
    keywords: ["employment", "unemployment", "inflation", "CPI", "labor"],
    docs: "https://www.bls.gov/developers/",
    icon: "chart-line",
    operations: [
      endpoint({
        id: "series",
        capabilityId: "labor.series",
        title: "Labor or price series",
        description:
          "Retrieve a BLS series by its published identifier, such as LNS14000000 for unemployment.",
        endpoint: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        path: (a) =>
          `https://api.bls.gov/publicAPI/v2/timeseries/data/${encodeURIComponent(String(a.series))}`,
        inputs: { series: text("Series ID", "LNS14000000", true) },
        query: () => ({}),
        sample: {
          Results: {
            series: [
              {
                seriesID: "LNS14000000",
                data: [
                  { year: "2025", period: "M01", value: "4.0" },
                  { year: "2025", period: "M02", value: "4.1" },
                ],
              },
            ],
          },
        },
        extract: (r) =>
          (r.Results?.series ?? []).flatMap((s: any) =>
            (s.data ?? [])
              .filter((v: any) => /^M(0[1-9]|1[0-2])$/.test(v.period))
              .map((v: any) => ({
                ...v,
                series: s.seriesID,
                date: `${v.year}-${v.period.slice(1)}-01`,
                value: Number(v.value),
              })),
          ),
        intents: ["unemployment", "employment", "labor", "CPI", "inflation"],
        example: "Show the unemployment rate",
        exampleArgs: { series: "LNS14000000" },
        view: "line-chart",
      }),
    ],
  },
  {
    id: "tvmaze",
    name: "TVmaze",
    description: "TV show metadata and episode schedules.",
    categories: ["Entertainment", "Events"],
    keywords: ["TV", "television", "shows", "episodes"],
    docs: "https://www.tvmaze.com/api",
    icon: "tv",
    operations: [
      endpoint({
        id: "shows",
        capabilityId: "tv.search",
        title: "Search TV shows",
        description: "Find shows by title with summary, dates and images.",
        endpoint: "https://api.tvmaze.com/search/shows",
        inputs: { q: text("Show title", "Star Trek", true) },
        sample: [
          {
            show: {
              name: "Illustrative show",
              premiered: "2024-01-01",
              summary: "Sample show metadata.",
              image: {
                medium:
                  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=640",
              },
              url: "https://www.tvmaze.com/",
            },
          },
        ],
        extract: (r) =>
          r.map((v: any) => ({
            ...v.show,
            title: v.show.name,
            description: v.show.summary,
            image_url: v.show.image?.medium,
          })),
        intents: ["TV shows", "television", "episodes"],
        example: "Find Star Trek TV shows",
        exampleArgs: { q: "Star Trek" },
        view: "cards",
      }),
    ],
  },
  {
    id: "openf1",
    name: "OpenF1",
    description: "Historical Formula 1 sessions and lap times.",
    categories: ["Sports", "Time series"],
    keywords: ["Formula 1", "F1", "laps", "drivers", "racing"],
    docs: "https://openf1.org/",
    icon: "flag",
    operations: [
      endpoint({
        id: "laps",
        capabilityId: "f1.laps",
        title: "Formula 1 laps",
        description:
          "Lap timing for one session and optional driver. Historical data is keyless; live data can require authentication.",
        endpoint: "https://api.openf1.org/v1/laps",
        inputs: {
          session_key: text("Session key", "9158", true),
          driver_number: {
            type: "integer",
            label: "Driver number",
            minimum: 1,
            maximum: 99,
          },
        },
        sample: [
          {
            session_key: 9158,
            driver_number: 1,
            lap_number: 1,
            lap_duration: 92.2,
            date_start: "2023-09-16T13:00:00Z",
          },
          {
            session_key: 9158,
            driver_number: 1,
            lap_number: 2,
            lap_duration: 91.4,
            date_start: "2023-09-16T13:01:32Z",
          },
        ],
        intents: ["F1 laps", "Formula 1", "lap times", "drivers"],
        example: "Show F1 lap times for session 9158",
        exampleArgs: { session_key: "9158" },
        view: "line-chart",
      }),
    ],
  },
  {
    id: "world-bank",
    name: "World Bank",
    description: "Country development indicators over time.",
    categories: ["Population", "Economy"],
    keywords: ["country indicators", "GDP", "population trend", "development"],
    docs: "https://datahelpdesk.worldbank.org/knowledgebase/topics/125589-developer-information",
    icon: "globe",
    operations: [
      endpoint({
        id: "indicator",
        capabilityId: "development.indicator",
        title: "Country indicator",
        description:
          "Retrieve an indicator for a country code. SP.POP.TOTL is total population and NY.GDP.PCAP.CD is GDP per capita.",
        endpoint: "https://api.worldbank.org/v2/country",
        path: (a) =>
          `https://api.worldbank.org/v2/country/${encodeURIComponent(String(a.country))}/indicator/${encodeURIComponent(String(a.indicator))}`,
        inputs: {
          country: text("Country code", "US", true),
          indicator: text("Indicator", "SP.POP.TOTL", true),
          date: text("Year range", "2015:2024"),
        },
        query: (a) => ({ date: a.date, format: "json", per_page: 100 }),
        sample: [
          { page: 1, total: 2 },
          [
            {
              country: { value: "United States" },
              date: "2023",
              value: 334914895,
            },
            {
              country: { value: "United States" },
              date: "2022",
              value: 333287557,
            },
          ],
        ],
        extract: (r) =>
          (r[1] ?? []).map((v: any) => ({
            ...v,
            country: v.country?.value,
            date: `${v.date}-01-01`,
          })),
        intents: [
          "country population",
          "GDP",
          "development indicator",
          "World Bank",
        ],
        example: "Show US population over time",
        exampleArgs: {
          country: "US",
          indicator: "SP.POP.TOTL",
          date: "2015:2024",
        },
        view: "line-chart",
      }),
    ],
  },
  {
    id: "gutendex",
    name: "Gutendex",
    description: "Public-domain books from Project Gutenberg.",
    categories: ["Books", "History"],
    keywords: ["public domain", "ebooks", "Gutenberg", "literature"],
    docs: "https://gutendex.com/",
    icon: "book-open",
    operations: [
      endpoint({
        id: "books",
        capabilityId: "ebook.search",
        title: "Find public-domain books",
        description:
          "Search book titles and authors with available formats and cover images.",
        endpoint: "https://gutendex.com/books/",
        inputs: { search: text("Search", "Jane Austen", true) },
        sample: {
          results: [
            {
              id: 1342,
              title: "Pride and Prejudice",
              authors: [{ name: "Austen, Jane" }],
              formats: {
                "image/jpeg":
                  "https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg",
              },
              download_count: 12000,
            },
          ],
        },
        extract: (r) =>
          (r.results ?? []).map((v: any) => ({
            ...v,
            author: (v.authors ?? []).map((a: any) => a.name).join(", "),
            image_url: v.formats?.["image/jpeg"],
            url: `https://www.gutenberg.org/ebooks/${v.id}`,
          })),
        intents: ["public-domain books", "Gutenberg", "ebooks"],
        example: "Find public-domain books by Jane Austen",
        exampleArgs: { search: "Jane Austen" },
        view: "gallery",
        ttl: 86400000,
      }),
    ],
  },
  {
    id: "zippopotamus",
    name: "Zippopotam.us",
    description: "Place names and coordinates for postal codes.",
    categories: ["Geography", "Places"],
    keywords: ["postal code", "ZIP code", "coordinates"],
    docs: "https://www.zippopotam.us/",
    icon: "map-pin",
    operations: [
      endpoint({
        id: "postal",
        capabilityId: "postal.lookup",
        title: "Postal code lookup",
        description:
          "Resolve country and postal code into place names and coordinates.",
        endpoint: "https://api.zippopotam.us",
        path: (a) =>
          `https://api.zippopotam.us/${encodeURIComponent(String(a.country))}/${encodeURIComponent(String(a.postal))}`,
        inputs: {
          country: text("Country code", "US", true),
          postal: text("Postal code", "21201", true),
        },
        query: () => ({}),
        sample: {
          places: [
            {
              "place name": "Baltimore",
              state: "Maryland",
              latitude: "39.29",
              longitude: "-76.61",
            },
          ],
        },
        extract: (r) =>
          (r.places ?? []).map((v: any) => ({ ...v, title: v["place name"] })),
        intents: ["postal code", "ZIP code", "postal coordinates"],
        example: "Locate ZIP code 21201",
        exampleArgs: { country: "US", postal: "21201" },
        view: "map",
      }),
    ],
  },
];
