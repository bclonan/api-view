import type { WidgetInput } from "../types";
export const templates: {
  id: string;
  title: string;
  description: string;
  tag: string;
  widgets: WidgetInput[];
}[] = [
  {
    id: "government",
    title: "The U.S. at a glance",
    description: "Federal debt, local weather, and a planet in motion.",
    tag: "GOVERNMENT & EARTH",
    widgets: [
      {
        apiId: "treasury",
        operationId: "debt-to-penny",
        arguments: { limit: 30 },
        title: "Total federal debt",
        presentation: "metric",
        width: 4,
      },
      {
        apiId: "open-meteo",
        operationId: "forecast",
        arguments: { latitude: 38.9072, longitude: -77.0369 },
        title: "Washington, DC",
        presentation: "weather",
        width: 4,
      },
      {
        apiId: "census",
        operationId: "population",
        arguments: {},
        mode: "sample",
        title: "Population by state",
        presentation: "bar-chart",
        width: 4,
      },
      {
        apiId: "treasury",
        operationId: "debt-to-penny",
        arguments: { limit: 30 },
        title: "Federal debt over time",
        presentation: "line-chart",
        width: 6,
      },
      {
        apiId: "usgs",
        operationId: "recent",
        arguments: { limit: 12, minmagnitude: 2.5 },
        title: "Recent earthquakes",
        presentation: "map",
        width: 6,
      },
    ],
  },
  {
    id: "city",
    title: "A day in Baltimore",
    description: "Check the forecast. Read about the city. Find a book.",
    tag: "PLACES & PEOPLE",
    widgets: [
      {
        apiId: "open-meteo",
        operationId: "forecast",
        arguments: { latitude: 39.29, longitude: -76.61 },
        title: "Baltimore weather",
        width: 4,
      },
      {
        apiId: "wikipedia",
        operationId: "summary",
        arguments: { title: "Baltimore" },
        title: "About Baltimore",
        width: 8,
      },
      {
        apiId: "open-library",
        operationId: "search",
        arguments: { q: "Baltimore history", limit: 4 },
        title: "On the reading list",
        width: 12,
      },
    ],
  },
  {
    id: "space",
    title: "A wider perspective",
    description: "NASA imagery and the latest seismic activity.",
    tag: "SPACE & SCIENCE",
    widgets: [
      {
        apiId: "nasa",
        operationId: "search",
        arguments: { q: "earth", limit: 6 },
        title: "Looking back at Earth",
        width: 8,
      },
      {
        apiId: "usgs",
        operationId: "recent",
        arguments: { limit: 8, minmagnitude: 4 },
        title: "Earth in motion",
        presentation: "timeline",
        width: 4,
      },
    ],
  },
];
