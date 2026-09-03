import { publicSourceUrl } from "../sources/security";
import type { Row } from "../types";
import { isLocalObjectUrl } from "./localFiles";

export function embedSource(row: Row, requested = "auto") {
  const raw =
    row.embed_url ??
    row.video_url ??
    row.audio_url ??
    row.url ??
    row.src ??
    row.value;
  try {
    if (isLocalObjectUrl(raw) && ["video", "audio"].includes(requested))
      return {
        kind: requested,
        provider: "Local file",
        src: String(raw),
        url: String(raw),
        trusted: false,
      };
    const url = publicSourceUrl(String(raw ?? ""));
    if (typeof location !== "undefined" && url.origin === location.origin)
      throw new Error("Use an external public embed URL.");
    const host = url.hostname.replace(/^www\./, "");
    const forced =
      requested === "video" || requested === "audio"
        ? requested
        : row.mediaType;
    if (
      host === "youtu.be" ||
      ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)
    ) {
      const id =
        host === "youtu.be"
          ? url.pathname.slice(1)
          : (url.searchParams.get("v") ??
            url.pathname.split("/").filter(Boolean).at(-1));
      if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id))
        throw new Error("Use a YouTube video URL with a valid video ID.");
      return {
        kind: "iframe",
        provider: "YouTube",
        src: `https://www.youtube-nocookie.com/embed/${id}`,
        url: url.href,
        trusted: true,
      };
    }
    if (["vimeo.com", "player.vimeo.com"].includes(host)) {
      const id = url.pathname.split("/").find((p) => /^\d+$/.test(p));
      if (!id) throw new Error("Use a Vimeo video URL.");
      return {
        kind: "iframe",
        provider: "Vimeo",
        src: `https://player.vimeo.com/video/${id}`,
        url: url.href,
        trusted: true,
      };
    }
    if (host === "open.spotify.com") {
      const match = url.pathname.match(
        /\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/,
      );
      if (!match)
        throw new Error(
          "Use a Spotify track, album, playlist, show or episode URL.",
        );
      return {
        kind: "iframe",
        provider: "Spotify",
        src: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
        url: url.href,
        trusted: true,
      };
    }
    if (host === "soundcloud.com")
      return {
        kind: "iframe",
        provider: "SoundCloud",
        src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&auto_play=false`,
        url: url.href,
        trusted: true,
      };
    const extension = url.pathname.toLowerCase();
    const kind =
      forced === "iframe"
        ? "iframe"
        : forced === "audio"
          ? "audio"
          : forced === "video" || /\.(mp4|webm|ogv|mov)$/.test(extension)
            ? "video"
            : forced === "audio" ||
                /\.(mp3|wav|ogg|m4a|aac|flac)$/.test(extension)
              ? "audio"
              : "iframe";
    return {
      kind,
      provider: host,
      src: url.href,
      url: url.href,
      trusted: false,
    };
  } catch (error) {
    return {
      kind: "invalid",
      provider: "Unavailable embed",
      error: (error as Error).message,
    };
  }
}
