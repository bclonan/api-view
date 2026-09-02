import { defineApi, queryUrl, resultLimit as limit } from "../defineApi";
import { bookSample } from "../fixtures";
export default defineApi({
  id: "open-library",
  name: "Open Library",
  description: "Find your next good read.",
  categories: ["Books"],
  keywords: ["book", "books", "author", "publication", "reading"],
  icon: "book-open",
  docs: "https://openlibrary.org/dev/docs/api/search",
  operations: [
    {
      id: "search",
      title: "Book search",
      description: "Search books by title, author, or subject.",
      endpoint: "https://openlibrary.org/search.json",
      inputs: {
        q: {
          type: "string",
          label: "Search books",
          required: true,
          placeholder: "Architecture and cities",
        },
        limit,
      },
      buildUrl: (a) =>
        queryUrl("https://openlibrary.org/search.json", {
          ...a,
          fields: "key,title,author_name,first_publish_year,cover_i",
        }),
      extract: (r) =>
        r.docs.map((b: any) => ({
          title: b.title,
          author: b.author_name?.join(", "),
          year: b.first_publish_year,
          ...(b.cover_i
            ? {
                image_url: `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`,
              }
            : {}),
          url: `https://openlibrary.org${b.key}`,
        })),
      sample: bookSample,
      preferred: "book",
    },
  ],
});
