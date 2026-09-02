import { defineApi, queryUrl } from "../defineApi";
export default defineApi({
  id: "wikipedia",
  name: "Wikipedia",
  description: "A little context for anything.",
  categories: ["Knowledge"],
  keywords: ["encyclopedia", "article", "knowledge", "summary", "city"],
  icon: "globe",
  docs: "https://www.mediawiki.org/wiki/API:Main_page",
  operations: [
    {
      id: "summary",
      title: "Article summary",
      description: "An introduction and image for an encyclopedia article.",
      endpoint: "https://en.wikipedia.org/w/api.php",
      inputs: {
        title: {
          type: "string",
          label: "Article title",
          required: true,
          placeholder: "Baltimore",
        },
      },
      buildUrl: (a) =>
        queryUrl("https://en.wikipedia.org/w/api.php", {
          action: "query",
          format: "json",
          origin: "*",
          prop: "extracts|pageimages|info",
          exintro: 1,
          explaintext: 1,
          inprop: "url",
          pithumbsize: 640,
          titles: a.title,
        }),
      extract: (r) => {
        const p: any = Object.values(r.query.pages)[0];
        return p.missing !== undefined
          ? null
          : {
              title: p.title,
              description: p.extract,
              image_url: p.thumbnail?.source,
              url: p.fullurl,
            };
      },
      sample: (a) => ({
        query: {
          pages: {
            "1": {
              title: a.title,
              extract: `${a.title} is the topic of this sample encyclopedia card. Live mode retrieves the article introduction from Wikipedia.`,
              fullurl: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(a.title))}`,
            },
          },
        },
      }),
      preferred: "link-preview",
    },
  ],
});
