import { defineApi, queryUrl } from "../defineApi";
import { weatherSample } from "../fixtures";
export default defineApi({
  id: "open-meteo",
  name: "Open-Meteo",
  description: "Weather, wherever you are.",
  categories: ["Weather"],
  keywords: ["temperature", "forecast", "wind", "climate"],
  icon: "cloud-sun",
  docs: "https://open-meteo.com/en/docs",
  operations: [
    {
      id: "forecast",
      title: "Local weather",
      description:
        "Current conditions and an hourly temperature forecast. Temperatures are Celsius.",
      endpoint: "https://api.open-meteo.com/v1/forecast",
      inputs: {
        forecast_days: {
          type: "integer",
          label: "Forecast days",
          default: 7,
          minimum: 1,
          maximum: 16,
        },
        hourly: {
          type: "string",
          label: "Hourly variables",
          default: "temperature_2m,precipitation_probability",
        },
        timezone: { type: "string", label: "Timezone", default: "auto" },
        latitude: {
          type: "number",
          label: "Latitude",
          required: true,
          minimum: -90,
          maximum: 90,
          placeholder: "38.9072",
        },
        longitude: {
          type: "number",
          label: "Longitude",
          required: true,
          minimum: -180,
          maximum: 180,
          placeholder: "-77.0369",
        },
      },
      buildUrl: (a) =>
        queryUrl("https://api.open-meteo.com/v1/forecast", {
          ...a,
          current:
            "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
          hourly: a.hourly ?? "temperature_2m,precipitation_probability",
          forecast_days: a.forecast_days ?? 7,
          timezone: a.timezone ?? "auto",
        }),
      extract: (r) =>
        r.hourly.time.map((time: string, i: number) => ({
          time,
          ...(r.hourly.temperature_2m
            ? { temperature: r.hourly.temperature_2m[i] }
            : {}),
          ...Object.fromEntries(
            Object.entries(r.hourly)
              .filter(([key]) => !["time", "temperature_2m"].includes(key))
              .map(([key, values]) => [key, (values as unknown[])[i]]),
          ),
        })),
      sample: weatherSample,
      preferred: "weather",
      collectionPath: "hourly",
      cacheTtlMs: 600000,
      capability: {
        id: "weather.forecast",
        intents: [
          "weather",
          "forecast",
          "temperature",
          "precipitation",
          "rain",
          "wind",
        ],
        examples: [
          {
            prompt:
              "Show Baltimore temperature and precipitation for seven days",
            arguments: { latitude: 39.29, longitude: -76.61, forecast_days: 7 },
          },
        ],
        views: ["weather", "line-chart", "table"],
      },
      metadata: (r) => ({ current: r.current, units: r.current_units }),
    },
  ],
});
