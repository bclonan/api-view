import { defineApi, queryUrl, resultLimit as limit } from "../defineApi";
export default defineApi({
  id: "nasa",
  name: "NASA Images",
  description: "Explore beyond the everyday.",
  categories: ["Space", "Images"],
  keywords: ["space", "nasa", "moon", "mars", "astronomy", "images", "photos"],
  icon: "orbit",
  docs: "https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf",
  operations: [
    {
      id: "search",
      title: "Space imagery",
      description: "Search the NASA Image and Video Library.",
      endpoint: "https://images-api.nasa.gov/search",
      inputs: {
        q: { type: "string", label: "Search NASA", default: "earth" },
        limit,
      },
      buildUrl: (a) =>
        queryUrl("https://images-api.nasa.gov/search", {
          q: a.q,
          media_type: "image",
          page_size: a.limit,
        }),
      extract: (r) =>
        r.collection.items.map((i: any) => ({
          title: i.data[0].title,
          description: i.data[0].description,
          image_url: i.links?.[0]?.href,
        })),
      sample: () => ({
        collection: {
          items: [
            {
              data: [
                {
                  title: "Earth from space",
                  description: "NASA public domain imagery. Sample selection.",
                },
              ],
              links: [
                {
                  href: "https://images-assets.nasa.gov/image/PIA18033/PIA18033~thumb.jpg",
                },
              ],
            },
          ],
        },
      }),
      preferred: "gallery",
    },
  ],
});
