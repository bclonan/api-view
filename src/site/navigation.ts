import project from "./project.json";
export const siteRoutes = ["/", "/webmcp", "/hackathon"] as const;
export type SiteRoute = (typeof siteRoutes)[number];
export function routeFor(path: string): SiteRoute {
  const clean = path.replace(/\/$/, "") || "/";
  return siteRoutes.includes(clean as SiteRoute) ? (clean as SiteRoute) : "/";
}
export function pageMetadata(path: string) {
  const route = routeFor(path);
  return {
    title:
      route === "/webmcp"
        ? "WebMCP tools and workflows | API Canvas"
        : route === "/hackathon"
          ? "Hackathon demo and architecture | API Canvas"
          : "API Canvas | Connected data, shared control",
    description:
      route === "/webmcp"
        ? "Explore API Canvas's registered WebMCP tools, validated examples, chained workflows and live tool inspector."
        : project.description,
    canonical: `${project.liveUrl}${route === "/" ? "/" : route}`,
  };
}
export function updateMetadata(path: string) {
  const meta = pageMetadata(path);
  document.title = meta.title;
  for (const [selector, value] of [
    ['meta[name="description"]', meta.description],
    ['meta[property="og:title"]', meta.title],
    ['meta[property="og:description"]', meta.description],
    ['meta[property="og:url"]', meta.canonical],
    ['meta[name="twitter:title"]', meta.title],
    ['meta[name="twitter:description"]', meta.description],
  ])
    document.querySelector(selector)?.setAttribute("content", value);
  document
    .querySelector('link[rel="canonical"]')
    ?.setAttribute("href", meta.canonical);
}
export function youtubeEmbed(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return;
    const id =
      url.hostname === "youtu.be"
        ? url.pathname.slice(1)
        : ["youtube.com", "www.youtube.com"].includes(url.hostname)
          ? url.searchParams.get("v") ||
            url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1]
          : undefined;
    if (id && /^[\w-]{11}$/.test(id))
      return `https://www.youtube-nocookie.com/embed/${id}`;
  } catch {
    /* Unconfigured or invalid video stays a visible placeholder. */
  }
}
