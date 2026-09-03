import { endpoint } from "./public-data";
import type {
  ApiDefinition,
  InputDefinition,
  Operation,
  Row,
} from "../../types";

const text = (
  label: string,
  value?: string,
  required = false,
): InputDefinition => ({ type: "string", label, default: value, required });
const count: InputDefinition = {
  type: "integer",
  label: "Results",
  default: 6,
  minimum: 1,
  maximum: 20,
};
const page: InputDefinition = {
  type: "integer",
  label: "Page",
  default: 1,
  minimum: 1,
  maximum: 100,
};
function list(value: unknown, label: string): any[] {
  if (!Array.isArray(value))
    throw new Error(
      `${label} was missing from the response. Inspect the raw data; the provider may have changed its format.`,
    );
  return value;
}
const plain = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .trim()
    : undefined;
const tracked = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["unsplash.com", "www.unsplash.com"].includes(url.hostname)
    )
      return undefined;
    url.searchParams.set("utm_source", "api_canvas");
    url.searchParams.set("utm_medium", "referral");
    return url.href;
  } catch {
    return undefined;
  }
};
function source(
  id: string,
  name: string,
  categories: string[],
  docs: string,
  description: string,
  operation: Operation,
): ApiDefinition {
  return {
    id,
    name,
    categories,
    docs,
    description,
    operations: [operation],
    keywords: operation.capability?.intents ?? [],
    icon: "globe",
    authentication: "none",
    browser: { expectedCors: "unknown" },
  };
}
const photoOperation = endpoint({
  id: "search",
  capabilityId: "unsplash.photos.search",
  title: "Search Unsplash photos",
  description:
    "Search photos by subject, with photographer attribution. Requires a server-side Unsplash Access Key.",
  endpoint: "https://api.unsplash.com/search/photos",
  path: () =>
    new URL(
      "/.netlify/functions/unsplash",
      typeof location === "undefined"
        ? "https://api-canvas-bclonan.netlify.app"
        : location.origin,
    ).href,
  inputs: {
    query: text("Photo subject", "Baltimore", true),
    per_page: count,
    page,
    orientation: {
      ...text("Orientation"),
      enum: ["", "landscape", "portrait", "squarish"],
    },
  },
  sample: {
    total: 1,
    total_pages: 1,
    results: [
      {
        id: "sample-metadata",
        alt_description: "Illustrative photo metadata",
        description:
          "Sample only. Configure the Unsplash Access Key to load real photos.",
        user: { name: "Sample photographer" },
      },
    ],
  },
  extract: (r) =>
    list(r.results, "Photo results").map((p) => ({
      id: p.id,
      title: p.alt_description || p.description || "Photo",
      description: p.description,
      image_url: p.urls?.small,
      full_image_url: p.urls?.regular,
      width: p.width,
      height: p.height,
      image_credit_name: p.user?.name,
      image_credit_url: tracked(p.user?.links?.html),
      image_source_name: "Unsplash",
      image_source_url: tracked(p.links?.html),
      url: tracked(p.links?.html),
      created_at: p.created_at,
    })),
  intents: ["unsplash", "photos", "photography", "image search", "pictures"],
  example: "Find Unsplash photos of Baltimore",
  exampleArgs: { query: "Baltimore" },
  view: "gallery",
});
photoOperation.preferred = "gallery";
photoOperation.hints = { image_url: "image", full_image_url: "image" };

export const openCollections: ApiDefinition[] = [
  {
    ...source(
      "unsplash",
      "Unsplash",
      ["Images"],
      "https://unsplash.com/documentation",
      "Search the Unsplash photo library. Photos stay on Unsplash's image servers and include photographer credits.",
      photoOperation,
    ),
    authentication: "api-key",
    keySetup: {
      environmentVariable: "UNSPLASH_ACCESS_KEY",
      url: "https://unsplash.com/oauth/applications",
      message:
        "Create an Unsplash application and add its Access Key as UNSPLASH_ACCESS_KEY in this site's Netlify environment variables with Functions scope. Redeploy afterward. The Secret Key is not needed for public photo search. Keys never belong in cards or share links.",
    },
    accessNote:
      "Requests use this site's Netlify function. Unsplash demo applications allow 50 requests per hour. Sample mode shows illustrative metadata; configure the key to search the live library.",
  },
  source(
    "wikimedia-commons",
    "Wikimedia Commons",
    ["Images", "Culture"],
    "https://www.mediawiki.org/wiki/API:Imageinfo",
    "Search openly licensed media. Read each file's license and author credit before reuse.",
    endpoint({
      id: "images",
      capabilityId: "commons.images.search",
      title: "Search Commons images",
      description:
        "Find image files with author, license and original file-page links.",
      endpoint: "https://commons.wikimedia.org/w/api.php",
      inputs: {
        q: text("Image subject", "Baltimore skyline", true),
        limit: count,
      },
      query: (a) => ({
        action: "query",
        format: "json",
        formatversion: 2,
        origin: "*",
        generator: "search",
        gsrsearch: `${a.q} filetype:bitmap`,
        gsrnamespace: 6,
        gsrlimit: a.limit,
        prop: "imageinfo",
        iiprop: "url|extmetadata",
        iiurlwidth: 640,
      }),
      sample: {
        query: {
          pages: [
            {
              pageid: 1,
              title: "Sample image metadata",
              imageinfo: [
                {
                  descriptionurl: "https://commons.wikimedia.org",
                  extmetadata: {
                    Artist: { value: "Sample author" },
                    LicenseShortName: { value: "Check the source license" },
                  },
                },
              ],
            },
          ],
        },
      },
      extract: (r) => {
        if (r.error)
          throw new Error(`Commons: ${r.error.info ?? r.error.code}`);
        if (!r.query && r.batchcomplete !== undefined) return [];
        return list(r.query?.pages, "Commons pages").map((p) => {
          const info = p.imageinfo?.[0],
            meta = info?.extmetadata;
          return {
            id: p.pageid,
            title: p.title?.replace(/^File:/, ""),
            image_url: info?.thumburl ?? info?.url,
            description: plain(meta?.ImageDescription?.value),
            image_credit_name: plain(meta?.Artist?.value),
            image_credit_url: info?.descriptionurl,
            image_source_name: "Wikimedia Commons",
            image_source_url: info?.descriptionurl,
            license: plain(meta?.LicenseShortName?.value),
            license_url: meta?.LicenseUrl?.value,
            url: info?.descriptionurl,
          };
        });
      },
      intents: ["commons", "wikimedia", "open images", "licensed photos"],
      example: "Find openly licensed Baltimore skyline images",
      exampleArgs: { q: "Baltimore skyline" },
      view: "gallery",
    }),
  ),
  source(
    "met-museum",
    "The Metropolitan Museum of Art",
    ["Art", "Images", "Culture"],
    "https://metmuseum.github.io/",
    "Search the Met collection and fetch up to six object records. Public-domain images include a link to the museum record.",
    endpoint({
      id: "search",
      capabilityId: "met.art.search",
      title: "Search museum artworks",
      description:
        "Search collection titles, artists and subjects, then load the matching artwork records.",
      endpoint:
        "https://collectionapi.metmuseum.org/public/collection/v1/search",
      inputs: {
        q: text("Artist or subject", "sunflowers", true),
        limit: { ...count, maximum: 6 },
      },
      query: (a) => ({ q: a.q, hasImages: "true" }),
      expand: {
        path: "objectIDs",
        max: 6,
        parameter: "limit",
        url: "https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}",
      },
      sample: [
        {
          objectID: 1,
          title: "Illustrative museum object",
          artistDisplayName: "Sample artist",
          objectDate: "1900",
          isPublicDomain: true,
          objectURL: "https://www.metmuseum.org/art/collection",
        },
      ],
      extract: (r) =>
        list(r, "Museum objects").map((p) => ({
          id: p.objectID,
          title: p.title,
          artist: p.artistDisplayName,
          date: p.objectDate,
          medium: p.medium,
          department: p.department,
          image_url: p.isPublicDomain
            ? p.primaryImageSmall || undefined
            : undefined,
          image_credit_name:
            p.artistDisplayName || "The Metropolitan Museum of Art",
          image_credit_url: p.objectURL,
          image_source_name: "The Metropolitan Museum of Art",
          image_source_url: p.objectURL,
          license: p.isPublicDomain
            ? "Public domain / CC0"
            : "Check museum rights information",
          url: p.objectURL,
        })),
      intents: ["met", "museum", "artworks", "paintings", "artists"],
      example: "Find sunflower paintings at the Met",
      exampleArgs: { q: "sunflowers", limit: 2 },
      view: "gallery",
    }),
  ),
  source(
    "gbif",
    "GBIF Biodiversity",
    ["Nature", "Science", "Maps"],
    "https://techdocs.gbif.org/en/openapi/",
    "Public occurrence records from biodiversity collections and observations, with supplied coordinates and dataset citations.",
    endpoint({
      id: "occurrences",
      capabilityId: "biodiversity.occurrences",
      title: "Find species observations",
      description:
        "Search a scientific name and optional country code. Coordinates come from the published record.",
      endpoint: "https://api.gbif.org/v1/occurrence/search",
      inputs: {
        scientificName: text("Scientific name", "Corvus corax", true),
        country: text("Country code", "US"),
        limit: count,
      },
      query: (a) => ({ ...a, hasCoordinate: "true" }),
      sample: {
        results: [
          {
            key: "sample",
            species: "Sample species",
            decimalLatitude: 39.3,
            decimalLongitude: -76.6,
            basisOfRecord: "Illustrative observation",
            license: "Check source license",
          },
        ],
      },
      extract: (r) =>
        list(r.results, "Occurrence results").map((p) => ({
          id: p.key,
          title: p.species ?? p.scientificName,
          latitude: p.decimalLatitude,
          longitude: p.decimalLongitude,
          date: p.eventDate,
          locality: p.locality,
          country: p.country,
          basis: p.basisOfRecord,
          publisher: p.institutionCode,
          dataset: p.datasetKey,
          license: p.license,
          url: `https://www.gbif.org/occurrence/${encodeURIComponent(p.key)}`,
        })),
      intents: [
        "gbif",
        "biodiversity",
        "species",
        "wildlife map",
        "occurrences",
      ],
      example: "Map published common raven observations in the US",
      exampleArgs: { scientificName: "Corvus corax", country: "US" },
      view: "map",
    }),
  ),
  source(
    "inaturalist",
    "iNaturalist",
    ["Nature", "Images", "Maps"],
    "https://api.inaturalist.org/v1/docs/",
    "Public community nature observations. Hidden or obscured locations remain as supplied; photo licenses vary.",
    endpoint({
      id: "observations",
      capabilityId: "nature.observations",
      title: "Search nature observations",
      description:
        "Find recent public observations of a species, with photos and contributor credits.",
      endpoint: "https://api.inaturalist.org/v1/observations",
      inputs: {
        taxon_name: text("Species name", "Corvus corax", true),
        per_page: count,
        page,
      },
      query: (a) => ({ ...a, photos: "true", order_by: "observed_on" }),
      sample: {
        results: [
          {
            id: "sample",
            species_guess: "Illustrative observation",
            observed_on: "2025-01-01",
            user: { login: "sample observer" },
            photos: [],
          },
        ],
      },
      extract: (r) =>
        list(r.results, "Observations").map((p) => ({
          id: p.id,
          title:
            p.taxon?.preferred_common_name ?? p.species_guess ?? p.taxon?.name,
          scientific_name: p.taxon?.name,
          date: p.observed_on,
          place: p.place_guess,
          latitude:
            p.geojson?.type === "Point"
              ? p.geojson.coordinates?.[1]
              : undefined,
          longitude:
            p.geojson?.type === "Point"
              ? p.geojson.coordinates?.[0]
              : undefined,
          location_privacy: p.geoprivacy ?? p.taxon_geoprivacy,
          image_url: p.photos?.[0]?.url,
          image_credit_name: p.photos?.[0]?.attribution ?? p.user?.login,
          image_credit_url: p.uri,
          image_source_name: "iNaturalist",
          image_source_url: p.uri,
          license: p.photos?.[0]?.license_code ?? "Check source photo rights",
          url: p.uri,
        })),
      intents: [
        "inaturalist",
        "nature photos",
        "observations",
        "plants",
        "birds",
      ],
      example: "Show recent common raven observations",
      exampleArgs: { taxon_name: "Corvus corax" },
      view: "gallery",
    }),
  ),
  source(
    "eonet",
    "NASA EONET",
    ["Nature", "Space", "Maps"],
    "https://eonet.gsfc.nasa.gov/docs/v3",
    "NASA's natural-event metadata, including wildfire, storm and volcano reports with source links.",
    endpoint({
      id: "events",
      capabilityId: "natural.events",
      title: "Track natural events",
      description:
        "Load open or closed natural events. Each map point uses the latest supplied Point geometry.",
      endpoint: "https://eonet.gsfc.nasa.gov/api/v3/events",
      inputs: {
        status: {
          ...text("Event status", "open"),
          enum: ["open", "closed", "all"],
        },
        limit: count,
        days: {
          type: "integer",
          label: "Past days",
          default: 30,
          minimum: 1,
          maximum: 365,
        },
      },
      sample: {
        events: [
          {
            id: "sample",
            title: "Illustrative natural event",
            categories: [{ title: "Wildfires" }],
            geometry: [
              { type: "Point", date: "2025-01-01", coordinates: [-120, 40] },
            ],
            sources: [],
          },
        ],
      },
      extract: (r) =>
        list(r.events, "Natural events").map((p) => {
          const point = [...(p.geometry ?? [])]
            .reverse()
            .find((g: any) => g.type === "Point");
          return {
            id: p.id,
            title: p.title,
            category: p.categories?.map((c: Row) => c.title).join(", "),
            date: point?.date,
            longitude: point?.coordinates?.[0],
            latitude: point?.coordinates?.[1],
            closed: p.closed,
            url: p.sources?.[0]?.url ?? p.link,
            sources: p.sources,
          };
        }),
      intents: ["eonet", "wildfires", "volcanoes", "storms", "natural events"],
      example: "Map open natural events reported by NASA EONET",
      exampleArgs: { status: "open", days: 30 },
      view: "map",
    }),
  ),
  source(
    "nws-alerts",
    "National Weather Service Alerts",
    ["Weather", "Government"],
    "https://www.weather.gov/documentation/services-web-api",
    "Active US weather alerts. A successful empty result means no matching active alerts, not a failed request.",
    endpoint({
      id: "active",
      capabilityId: "weather.alerts",
      title: "Active US weather alerts",
      description:
        "Read current alerts for a two-letter US state or territory code. Follow official instructions in the source.",
      endpoint: "https://api.weather.gov/alerts/active",
      inputs: { area: text("State or territory code", "MD", true) },
      query: (a) => ({ area: String(a.area).toUpperCase() }),
      sample: {
        features: [
          {
            properties: {
              id: "sample",
              headline: "Illustrative weather alert",
              event: "Sample only",
              severity: "Unknown",
              areaDesc: "Example region",
              description: "This is not an active alert.",
              senderName: "Sample",
            },
          },
        ],
      },
      extract: (r) =>
        list(r.features, "Weather alerts").map((p) => ({
          id: p.properties?.id,
          title: p.properties?.headline ?? p.properties?.event,
          event: p.properties?.event,
          severity: p.properties?.severity,
          area: p.properties?.areaDesc,
          effective: p.properties?.effective,
          expires: p.properties?.expires,
          description: p.properties?.description,
          instruction: p.properties?.instruction,
          sender: p.properties?.senderName,
          url: p.id ?? p.properties?.id,
        })),
      intents: [
        "nws",
        "weather alerts",
        "weather warnings",
        "national weather service",
      ],
      example: "Show active weather alerts for Maryland",
      exampleArgs: { area: "MD" },
      view: "document",
      ttl: 60000,
    }),
  ),
  source(
    "nobel-prize",
    "Nobel Prize",
    ["Science", "Culture", "History"],
    "https://www.nobelprize.org/about/developer-zone-2/",
    "Award years, categories, laureates and prize motivations from the Nobel Prize API.",
    endpoint({
      id: "awards",
      capabilityId: "nobel.awards",
      title: "Explore Nobel awards",
      description:
        "Find awards by year and category. The API may have no awards for a future year.",
      endpoint: "https://api.nobelprize.org/2.1/nobelPrizes",
      inputs: {
        nobelPrizeYear: {
          type: "integer",
          label: "Award year",
          default: 2024,
          minimum: 1901,
          maximum: 2100,
        },
        nobelPrizeCategory: {
          ...text("Category"),
          enum: ["", "che", "eco", "lit", "pea", "phy", "med"],
        },
        limit: count,
      },
      sample: {
        nobelPrizes: [
          {
            awardYear: "1901",
            category: { en: "Physics" },
            laureates: [
              {
                knownName: { en: "Wilhelm Conrad Röntgen" },
                motivation: {
                  en: "Sample award record. Check the live source for the full motivation.",
                },
              },
            ],
          },
        ],
      },
      extract: (r) =>
        list(r.nobelPrizes, "Nobel awards").map((p) => ({
          title: `${p.category?.en ?? "Award"} ${p.awardYear}`,
          year: p.awardYear,
          category: p.category?.en,
          laureates: p.laureates
            ?.map(
              (l: any) => l.knownName?.en ?? l.orgName?.en ?? l.fullName?.en,
            )
            .filter(Boolean)
            .join(", "),
          motivation: p.laureates
            ?.map((l: any) => l.motivation?.en)
            .filter(Boolean)
            .join("\n"),
          date: p.dateAwarded,
          prize_amount: p.prizeAmount,
          url: (Array.isArray(p.links) ? p.links[0] : p.links)?.href,
        })),
      intents: ["nobel", "awards", "laureates", "prizes"],
      example: "Show the 2024 Nobel Prize awards",
      exampleArgs: { nobelPrizeYear: 2024 },
      view: "document",
    }),
  ),
];
for (const api of openCollections) {
  if (["wikimedia-commons", "met-museum", "inaturalist"].includes(api.id)) {
    api.operations[0].preferred = "gallery";
    api.operations[0].hints = { image_url: "image" };
  }
}
