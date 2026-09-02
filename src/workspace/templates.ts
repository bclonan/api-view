import type { WidgetInput } from "../types";
import type { createToolRunner } from "../webmcp/handlers";
export const templates: {
  id: string;
  title: string;
  description: string;
  tag: string;
  widgets: WidgetInput[];
}[] = [
  {
    id: "public-data",
    title: "Public data dashboard",
    description:
      "Space imagery, earthquakes, published labels, and population in shared components.",
    tag: "FOUR SOURCES, ONE VIEW",
    widgets: [
      {
        apiId: "nasa",
        operationId: "search",
        arguments: { q: "moon", limit: 2 },
        title: "Space imagery",
        presentation: "gallery",
        width: 6,
      },
      {
        apiId: "usgs",
        operationId: "recent",
        arguments: { limit: 6, minmagnitude: 2.5 },
        title: "Earthquake observations",
        presentation: "table",
        width: 6,
        bindings: {
          place: { path: "place" },
          magnitude: { path: "magnitude" },
          time: { path: "time" },
        },
      },
      {
        apiId: "open-fda",
        operationId: "labels",
        arguments: { q: "aspirin", limit: 2 },
        title: "Published drug labels",
        presentation: "cards",
        width: 6,
      },
      {
        apiId: "census",
        operationId: "population",
        arguments: {},
        mode: "sample",
        title: "Population sample",
        presentation: "bar-chart",
        width: 6,
      },
      {
        apiId: "census",
        operationId: "population",
        arguments: {},
        mode: "sample",
        title: "Across the sources",
        presentation: "record",
        width: 12,
        bindings: {
          title: { literal: "Selected source values" },
          value: {
            sourceId: "template:3",
            origin: "data",
            path: "[0].population",
            label: "Population sample",
          },
          earthquakes: {
            sourceId: "template:1",
            origin: "raw",
            path: "features.length",
            label: "Earthquakes returned",
          },
          space: {
            sourceId: "template:0",
            origin: "data",
            path: "[0].title",
            label: "NASA image",
          },
          published_label: {
            sourceId: "template:2",
            origin: "data",
            path: "[0].title",
            label: "Published label",
          },
        },
      },
    ],
  },
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
export async function createTemplate(
  templateId: string,
  runTool: ReturnType<typeof createToolRunner>,
) {
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) throw new Error("Template not found.");
  const created = await runTool("create_dashboard", {
    title: template.title,
    widgets: template.widgets.map(
      ({ bindings: _bindings, ...widget }) => widget,
    ),
  });
  if (created.isError) return created;
  const workspace = JSON.parse(created.content[0].text);
  const widgets = workspace.widgets.slice(-template.widgets.length);
  for (const [index, spec] of template.widgets.entries()) {
    if (!spec.bindings) continue;
    const bindings = Object.fromEntries(
      Object.entries(spec.bindings).map(([slot, binding]) => [
        slot,
        {
          ...binding,
          ...(binding.sourceId?.startsWith("template:")
            ? { sourceId: widgets[Number(binding.sourceId.split(":")[1])].id }
            : {}),
        },
      ]),
    );
    const updated = await runTool("update_widget", {
      widgetId: widgets[index].id,
      patch: { bindings },
    });
    if (updated.isError) return updated;
  }
  return runTool("get_workspace", {});
}
