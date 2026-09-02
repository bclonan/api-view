import { defineApi, queryUrl, resultLimit as limit } from "../defineApi";
import { quakeSample } from "../fixtures";
export default defineApi({
  id: "usgs",
  name: "USGS Earthquakes",
  description: "A picture of our restless planet.",
  categories: ["Earth science", "Geography"],
  keywords: ["earthquake", "earthquakes", "seismic", "map", "geology"],
  icon: "activity",
  docs: "https://earthquake.usgs.gov/fdsnws/event/1/",
  operations: [
    {
      id: "recent",
      title: "Recent earthquakes",
      description: "Recent seismic events, with magnitude and location.",
      endpoint: "https://earthquake.usgs.gov/fdsnws/event/1/query",
      inputs: {
        starttime: { type: "date", label: "Start date" },
        endtime: { type: "date", label: "End date" },
        maxmagnitude: {
          type: "number",
          label: "Maximum magnitude",
          minimum: 0,
          maximum: 10,
        },
        latitude: {
          type: "number",
          label: "Latitude",
          minimum: -90,
          maximum: 90,
        },
        longitude: {
          type: "number",
          label: "Longitude",
          minimum: -180,
          maximum: 180,
        },
        maxradiuskm: {
          type: "number",
          label: "Radius in kilometres",
          minimum: 1,
          maximum: 20000,
        },
        orderby: {
          type: "string",
          label: "Sort by",
          default: "time",
          enum: ["time", "time-asc", "magnitude", "magnitude-asc"],
        },
        limit,
        minmagnitude: {
          type: "number",
          label: "Minimum magnitude",
          default: 2.5,
          minimum: 0,
          maximum: 10,
        },
      },
      buildUrl: (a) =>
        queryUrl("https://earthquake.usgs.gov/fdsnws/event/1/query", {
          format: "geojson",
          orderby: "time",
          ...a,
        }),
      extract: (r) =>
        r.features.map((f: any) => ({
          place: f.properties.place,
          magnitude: f.properties.mag,
          depth: f.geometry.coordinates[2],
          time: new Date(f.properties.time).toISOString(),
          longitude: f.geometry.coordinates[0],
          latitude: f.geometry.coordinates[1],
          url: f.properties.url,
        })),
      sample: quakeSample,
      preferred: "map",
      collectionPath: "features",
      cacheTtlMs: 300000,
      capability: {
        id: "earthquake.search",
        intents: [
          "earthquake",
          "earthquakes",
          "seismic",
          "magnitude",
          "geology",
        ],
        examples: [
          {
            prompt: "Show magnitude 5+ earthquakes from the last week",
            arguments: { minmagnitude: 5, limit: 30 },
          },
        ],
        views: ["map", "histogram", "timeline", "table"],
      },
    },
  ],
});
