import { defineApi, queryUrl, resultLimit as limit } from "../defineApi";
export default defineApi({
  id: "github",
  name: "GitHub",
  description: "See what people are building.",
  categories: ["Developer"],
  keywords: ["code", "repository", "repositories", "open source", "developer"],
  icon: "code",
  docs: "https://docs.github.com/en/rest/search/search#search-repositories",
  operations: [
    {
      id: "repositories",
      title: "Repository search",
      description:
        "Find public repositories by topic or language. Unauthenticated rate limits apply.",
      endpoint: "https://api.github.com/search/repositories",
      inputs: {
        q: { type: "string", label: "Search repositories", default: "vue" },
        limit,
      },
      buildUrl: (a) =>
        queryUrl("https://api.github.com/search/repositories", {
          q: a.q,
          per_page: a.limit,
          sort: "stars",
        }),
      extract: (r) =>
        r.items.map((v: any) => ({
          title: v.full_name,
          description: v.description,
          stars: v.stargazers_count,
          language: v.language,
          url: v.html_url,
        })),
      sample: () => ({
        items: [
          {
            full_name: "vuejs/core",
            description: "The progressive JavaScript framework.",
            stargazers_count: 50000,
            language: "TypeScript",
            html_url: "https://github.com/vuejs/core",
          },
          {
            full_name: "vitejs/vite",
            description: "Frontend development tools.",
            stargazers_count: 70000,
            language: "TypeScript",
            html_url: "https://github.com/vitejs/vite",
          },
        ],
      }),
      preferred: "cards",
    },
  ],
});
