// Synthetic contract fixtures. These are not current scores, news or addresses.
export const teamFixture = {
  team: {
    id: "33",
    displayName: "Baltimore Ravens",
    record: {
      items: [
        {
          type: "total",
          summary: "3-0",
          stats: [
            { name: "wins", value: 3 },
            { name: "losses", value: 0 },
          ],
        },
        { type: "home", summary: "2-0" },
        { type: "road", summary: "1-0" },
      ],
    },
  },
};
export const scheduleFixture = {
  totalGames: 1,
  dates: [
    {
      date: "2026-09-02",
      games: [
        {
          gamePk: 824312,
          gameDate: "2026-09-02T19:10:00Z",
          season: "2026",
          status: { detailedState: "Final" },
          teams: {
            home: { team: { name: "Baltimore Orioles" }, score: 5 },
            away: { team: { name: "Example visitors" }, score: 0 },
          },
          venue: { name: "Example ballpark" },
        },
      ],
    },
  ],
};
export const placeFixture = {
  name: "Example visitor center",
  address: {
    streetAddress: "100 Example Street",
    addressLocality: "Baltimore",
    addressRegion: "MD",
  },
};
export const newsFixture = {
  headline: "Example community update",
  description: "Synthetic article for layout testing.",
  publishedAt: "2026-09-02T12:00:00Z",
  url: "https://example.org/news",
};
export const eventFixture = {
  "@type": "Event",
  name: "Example neighborhood walk",
  startDate: "2026-09-05T14:00:00Z",
  location: { name: "Example park", address: "Example Street" },
};
export const personFixture = {
  "@type": "Person",
  name: "Example organizer",
  jobTitle: "Coordinator",
  worksFor: { name: "Example group" },
};
export const productFixture = {
  "@type": "Product",
  name: "Example guide",
  offers: { price: 12, priceCurrency: "GBP", availability: "InStock" },
};
