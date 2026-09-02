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
          time: new Date(f.properties.time).toISOString(),
          longitude: f.geometry.coordinates[0],
          latitude: f.geometry.coordinates[1],
          url: f.properties.url,
        })),
      sample: quakeSample,
      preferred: "map",
    },
  ],
});
