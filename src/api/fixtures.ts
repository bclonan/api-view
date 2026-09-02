import type { Row } from "../types";
const days = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(2026, 7, 31 - count + i + 1)).toISOString().slice(0, 10),
  );
export const debtSample = (args: Row) => ({
  data: days(Number(args.limit ?? 30))
    .filter(
      (date) =>
        (!args.from || date >= String(args.from)) &&
        (!args.to || date <= String(args.to)),
    )
    .map((record_date, i) => ({
      record_date,
      tot_pub_debt_out_amt: String(
        36700000000000 + i * 6400000000 + Math.sin(i / 3) * 13000000000,
      ),
      debt_held_public_amt: String(29000000000000 + i * 4400000000),
    })),
  meta: { source: "Illustrative sample, not current Treasury figures" },
});
export const weatherSample = () => ({
  latitude: 38.9,
  longitude: -77.04,
  current: {
    temperature_2m: 24,
    apparent_temperature: 25,
    relative_humidity_2m: 61,
    wind_speed_10m: 11,
    weather_code: 2,
    time: "2026-08-31T12:00",
  },
  current_units: { temperature_2m: "°C", wind_speed_10m: "km/h" },
  hourly: {
    time: Array.from(
      { length: 24 },
      (_, i) => `2026-08-31T${String(i).padStart(2, "0")}:00`,
    ),
    temperature_2m: Array.from({ length: 24 }, (_, i) =>
      Math.round(21 + Math.sin((i - 7) / 5) * 6),
    ),
  },
});
export const quakeSample = () => ({
  type: "FeatureCollection",
  features: [
    ["Northern California", -122.8, 38.8, 3.2],
    ["Southern Alaska", -150.4, 61.1, 4.1],
    ["Island of Hawaii", -155.3, 19.4, 2.8],
    ["Puerto Rico region", -66.8, 18, 3.6],
    ["Central California", -120.4, 36.1, 2.5],
    ["Nevada", -116.7, 38.2, 2.9],
  ].map(([place, longitude, latitude, magnitude], i) => ({
    id: `sample-${i}`,
    geometry: { type: "Point", coordinates: [longitude, latitude, 10] },
    properties: {
      place,
      mag: magnitude,
      time: Date.UTC(2026, 7, 31, 12 - i),
      url: "https://earthquake.usgs.gov/",
    },
  })),
});
export const bookSample = (args: Row) => ({
  docs: [
    ["The City in History", "Lewis Mumford", 1961],
    ["A Pattern Language", "Christopher Alexander", 1977],
    ["The Death and Life of Great American Cities", "Jane Jacobs", 1961],
    ["Invisible Cities", "Italo Calvino", 1972],
  ].map(([title, author, year], i) => ({
    title,
    author_name: [author],
    first_publish_year: year,
    key: `/works/OL${i + 1}W`,
    subject: [String(args.q ?? "Cities")],
  })),
});
export const imageSample = () =>
  Array.from({ length: 6 }, (_, i) => ({
    id: String(i),
    author: [
      "Alejandro Escamilla",
      "Paul Jarvis",
      "Paul Jarvis",
      "Alejandro Escamilla",
      "Alejandro Escamilla",
      "Alejandro Escamilla",
    ][i],
    download_url: `https://picsum.photos/id/${[10, 11, 12, 13, 14, 15][i]}/640/420`,
    url: "https://picsum.photos",
    width: 640,
    height: 420,
  }));
