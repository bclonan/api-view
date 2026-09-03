import type { NormalizedError, Row, SemanticResult, Widget } from "../types";
import { compatibleComponents } from "../blocks/definitions";
import { scenarioFor, scenarioKinds } from "./scenarios";
import { embedSource } from "./embeds";
import { pricePoint, mappedPriceRow } from "./market";
import { readPath } from "./fields";
import { fileStates } from "./localFiles";

export function recoveryFor(error: NormalizedError) {
  const retryable = [
    "network",
    "timeout",
    "cancelled",
    "429",
    "408",
    "500",
    "502",
    "503",
    "504",
  ].includes(error.code);
  const recovery =
    error.code === "authentication-required"
      ? "Follow the source's API key setup instructions. Retrying without configuring a valid key will not help. Keep credentials out of card inputs and share links."
      : error.code === "network"
        ? "Retry once. If browser access still fails, use a documented CORS-enabled endpoint or an approved adapter. Repeating the same blocked request will not fix CORS."
        : error.code === "429"
          ? `Wait ${error.retryAfter ?? 60} seconds before retrying this source. Other cards can continue loading.`
          : error.code === "timeout"
            ? "Retry this source with a smaller date range or page size. Other cards can continue loading."
            : retryable
              ? "Retry this source when ready. Keep successful cards."
              : "Inspect the source URL, format, response path and inputs. Correct them in the source editor before retrying.";
  return { ...error, retryable, recovery };
}

export function blockOutcome(
  widget: Widget,
  display: { result?: SemanticResult; issues: string[]; answerIds?: string[] },
) {
  const data = display.result?.data;
  const rows = Array.isArray(data) ? data : data == null ? [] : [data];
  const type =
    widget.presentation.type === "auto"
      ? display.result?.suggestedPresentations[0]
      : widget.presentation.type;
  const issues: {
    code: string;
    message: string;
    retryable: boolean;
    recovery: string;
    retryAfter?: number;
  }[] = [];
  if (widget.error) issues.push(recoveryFor(widget.error));
  if (widget.viewError)
    issues.push({
      ...widget.viewError,
      retryable: true,
      recovery:
        "Retry the player or open the original URL. Provider access and codec support may prevent playback.",
    });
  if (widget.content?.kind === "question" && !display.answerIds?.length)
    issues.push({
      code: "awaiting_answer",
      message: "Question saved. No model-generated answer has been supplied.",
      retryable: false,
      recovery:
        "Use prepare_canvas_question with questionBlockId, then answer_canvas_question to add normal answer blocks with citations.",
    });
  for (const file of widget.content?.files ?? []) {
    const state = fileStates.get(file.id) ?? {
      code: "local_file_unverified",
      message: "Local file access has not been checked on this device.",
    };
    if (state.code !== "available")
      issues.push({
        ...state,
        retryable: false,
        recovery:
          "Open the file card. Grant read access if prompted or reconnect the file in Edit content. A saved URI does not grant access.",
      });
    if (file.previewIssue)
      issues.push({
        code: "local_file_preview",
        message: file.previewIssue,
        retryable: false,
        recovery:
          "Download the original, choose a supported file type, or correct the file and reconnect it.",
      });
  }
  if (
    ["summary", "answer"].includes(widget.content?.kind ?? "") &&
    !widget.content?.citations?.length
  )
    issues.push({
      code: "uncited_content",
      message: "This content has no supporting citations.",
      retryable: false,
      recovery:
        "Add source card or public URL citations and review the claims.",
    });
  if (type && ["embed", "video", "audio", "media"].includes(type)) {
    const row = (rows[0] && typeof rows[0] === "object" ? rows[0] : {}) as Row;
    const field = display.result?.fields.find((f) =>
      ["audio", "video"].includes(f.type),
    );
    const source = embedSource(
      field ? { ...row, url: readPath(row, field.key) } : row,
      type,
    );
    if (source.kind === "invalid")
      issues.push({
        code: "invalid_embed",
        message: source.error ?? "Invalid embed URL.",
        retryable: false,
        recovery:
          "Map url, video_url or audio_url to a public HTTPS URL, or edit the content card.",
      });
    else if (source.kind === "iframe")
      issues.push({
        code: "embed_unverified",
        message:
          "External provider playback is not verified. A human must load the embed.",
        retryable: false,
        recovery:
          "Use Load embed or Open original. Framing restrictions cannot be bypassed by retrying the source API.",
      });
  }
  if (type === "stock-chart") {
    const prices = rows.map((r) =>
      pricePoint(
        mappedPriceRow(
          r && typeof r === "object" ? (r as Row) : {},
          widget.presentation,
        ),
      ),
    );
    const missing = prices.filter(
      (p) => !p.time || p.close === undefined,
    ).length;
    if (missing || prices.some((p) => !p.ohlc))
      issues.push({
        code: "incomplete_prices",
        message: `${missing} rows lack valid dated closing prices. Some OHLC values may be unavailable.`,
        retryable: false,
        recovery:
          "Map time, open, high, low, close and optional volume, or use the closing-price view. Never fill missing prices with zero.",
      });
  }
  for (const message of display.issues)
    issues.push({
      code: widget.content ? "stale_content" : "binding",
      message,
      retryable: false,
      recovery: widget.content
        ? "Read the cited source cards, then review or regenerate this content with current citations."
        : "Inspect the source cards and edit the binding paths or transforms. Retry only the failed sources.",
    });
  if (
    rows.length > 0 &&
    display.result &&
    type &&
    !(
      type === "stock-chart" &&
      rows.some((r) => {
        const p = pricePoint(
          mappedPriceRow(
            r && typeof r === "object" ? (r as Row) : {},
            widget.presentation,
          ),
        );
        return p.time && p.close !== undefined;
      })
    ) &&
    !compatibleComponents(display.result).some(
      (c) => c.id === type && c.compatible,
    )
  )
    issues.push({
      code: "incompatible_view",
      message: `The data does not fit ${type}.`,
      retryable: false,
      recovery:
        "Use inspect_source_schema to review suggested views, then choose_visualization or bind_data_to_block.",
    });
  if (type && scenarioKinds.some((k) => k === type)) {
    const unmatched = rows.filter(
      (r) =>
        !r ||
        typeof r !== "object" ||
        scenarioFor(r as Row, type).kind !== type,
    ).length;
    if (unmatched)
      issues.push({
        code: "unmatched_records",
        message: `${unmatched} records lack fields for ${type}. Their details remain available.`,
        retryable: false,
        recovery:
          "Map the missing fields, filter these records, or choose a table.",
      });
    if (
      type === "sports-score" &&
      rows.some((r) => {
        const v = scenarioFor(
          r && typeof r === "object" ? (r as Row) : {},
        ).values;
        return v.home_score === undefined || v.away_score === undefined;
      })
    )
      issues.push({
        code: "missing_scores",
        message: "Some games have no supplied score. No score was guessed.",
        retryable: false,
        recovery:
          "Keep the schedule view, or refresh the source after scores are published.",
      });
  }
  if (type === "map" || type === "places") {
    const missing = rows.filter((r) => {
      if (!r || typeof r !== "object") return true;
      const v = scenarioFor(r as Row).values;
      return ![
        [v.latitude, 90],
        [v.longitude, 180],
      ].every(
        ([n, max]) =>
          n !== undefined &&
          n !== null &&
          String(n).trim() !== "" &&
          Number.isFinite(Number(n)) &&
          Math.abs(Number(n)) <= Number(max),
      );
    }).length;
    if (missing)
      issues.push({
        code: "missing_coordinates",
        message: `${missing} records cannot be placed on the map.`,
        retryable: false,
        recovery:
          "Bind valid latitude and longitude, or use places with address search links. Do not infer coordinates.",
      });
  }
  const status =
    widget.status === "error"
      ? rows.length
        ? "partial"
        : "error"
      : ["loading", "refreshing", "draft", "needs-input"].includes(
            widget.status,
          )
        ? widget.status
        : !display.result && display.issues.length
          ? "blocked"
          : issues.length
            ? "partial"
            : !rows.length
              ? "empty"
              : "ready";
  return {
    status,
    blockId: widget.id,
    recordCount: rows.length,
    visualization: type ?? null,
    stale: !!widget.error && !!display.result,
    issues,
    next:
      status === "loading" || status === "refreshing"
        ? "Read list_blocks after this request settles. Create independent cards meanwhile; do not repeat create_block."
        : status === "empty"
          ? "The source returned no records. Check the query or date range; do not invent records."
          : status === "needs-input"
            ? `Supply required inputs: ${widget.missingInputs.join(", ")}.`
            : null,
  };
}
