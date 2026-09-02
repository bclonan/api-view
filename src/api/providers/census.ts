import { defineApi, queryUrl } from "../defineApi";
export default defineApi({
  id: "census",
  name: "U.S. Census",
  authentication: "api-key",
  liveNotice:
    "Census now requires an API key for this endpoint. This adapter supports sample data only. API key storage is not implemented.",
  description: "People and places, in numbers.",
  categories: ["Government", "Population"],
  keywords: ["population", "states", "census", "people"],
  icon: "users",
  docs: "https://www.census.gov/data/developers/data-sets/decennial-census.html",
  operations: [
    {
      id: "population",
      title: "State population",
      description: "2020 decennial population counts by state.",
      endpoint: "https://api.census.gov/data/2020/dec/pl",
      inputs: {},
      buildUrl: () =>
        "https://api.census.gov/data/2020/dec/pl?get=NAME,P1_001N&for=state:*",
      extract: (r) =>
        r.slice(1).map((v: string[]) => ({
          state: v[0],
          population: Number(v[1]),
          state_id: v[2],
        })),
      sample: () => [
        ["NAME", "P1_001N", "state"],
        ["Maryland", "6177224", "24"],
        ["Virginia", "8631393", "51"],
        ["Delaware", "989948", "10"],
        ["Pennsylvania", "13002700", "42"],
      ],
      preferred: "bar-chart",
      hints: { state_id: "identifier" },
    },
  ],
});
