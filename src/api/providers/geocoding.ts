import { defineApi, queryUrl } from "../defineApi";
export default defineApi({
  id: "geocoding",
  name: "Open-Meteo Geocoding",
  description: "Put a place on the map.",
  categories: ["Geography"],
  keywords: ["location", "coordinates", "place", "city", "geocode"],
  icon: "map-pin",
  docs: "https://open-meteo.com/en/docs/geocoding-api",
  operations: [
    {
      id: "search",
      title: "Find a location",
      description:
        "Search cities and get their coordinates for weather requests.",
      endpoint: "https://geocoding-api.open-meteo.com/v1/search",
      inputs: {
        name: {
          type: "string",
          label: "Place name",
          required: true,
          placeholder: "Baltimore",
        },
      },
      buildUrl: (a) =>
        queryUrl("https://geocoding-api.open-meteo.com/v1/search", {
          ...a,
          count: 8,
          language: "en",
        }),
      extract: (r) => r.results ?? [],
      sample: (a) => ({
        results: [
          {
            name: a.name,
            latitude: 39.29,
            longitude: -76.61,
            country: "United States",
            timezone: "America/New_York",
          },
        ],
      }),
      preferred: "map",
    },
  ],
});
