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
          hourly: "temperature_2m",
          forecast_days: 1,
          timezone: "auto",
        }),
      extract: (r) =>
        r.hourly.time.map((time: string, i: number) => ({
          time,
          temperature: r.hourly.temperature_2m[i],
        })),
      sample: weatherSample,
      preferred: "weather",
      metadata: (r) => ({ current: r.current, units: r.current_units }),
    },
  ],
});
