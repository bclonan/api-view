import { defineApi, queryUrl, resultLimit as limit } from "../defineApi";
import { imageSample } from "../fixtures";
export default defineApi({
  id: "picsum",
  name: "Lorem Picsum",
  description: "Photography for a fresh perspective.",
  categories: ["Images"],
  keywords: ["images", "gallery", "photos", "photography"],
  icon: "image",
  docs: "https://picsum.photos/",
  operations: [
    {
      id: "images",
      title: "Photo collection",
      description:
        "A collection of photographs. This source does not support searching by location.",
      endpoint: "https://picsum.photos/v2/list",
      inputs: {
        limit: { ...limit, default: 6, maximum: 30 },
        page: {
          type: "integer",
          label: "Page",
          default: 2,
          minimum: 1,
          maximum: 100,
        },
      },
      buildUrl: (a) => queryUrl("https://picsum.photos/v2/list", a),
      extract: (r) =>
        r.map((i: any) => ({
          title: `Photo by ${i.author}`,
          image_url: `https://picsum.photos/id/${i.id}/640/420`,
          author: i.author,
          url: i.url,
        })),
      sample: imageSample,
      preferred: "gallery",
    },
  ],
});
