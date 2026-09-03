import { reactive } from "vue";
import type { LocalFileReference } from "../types";
import { readLocal, writeLocal } from "./persistence";
import { parseCsv } from "../sources/adapters";

export interface ReadFileHandle {
  name: string;
  getFile(): Promise<File>;
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
}
export const fileStates = reactive(
  new Map<string, { code: string; message: string }>(),
);
const objectUrls = new Set<string>();
export const isLocalObjectUrl = (url: unknown) =>
  typeof url === "string" && objectUrls.has(url);
export function localObjectUrl(file: Blob) {
  const url = URL.createObjectURL(file);
  objectUrls.add(url);
  return url;
}
export function releaseLocalUrl(url: string) {
  objectUrls.delete(url);
  URL.revokeObjectURL(url);
}
export function localFileKind(
  file: Pick<LocalFileReference, "name" | "mediaType">,
) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (["json", "csv", "txt", "md"].includes(extension ?? "")) return extension!;
  if (/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.mediaType ?? ""))
    return "image";
  if (file.mediaType?.startsWith("video/")) return "video";
  if (file.mediaType?.startsWith("audio/")) return "audio";
  return "unsupported";
}
export async function referenceForFile(
  file: File,
  handle?: ReadFileHandle,
  previousId?: string,
) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Choose a file up to 20 MB.");
  const reference: LocalFileReference = {
    id: previousId ?? `local-${crypto.randomUUID()}`,
    name: file.name,
    access: handle ? "handle" : "snapshot",
    mediaType: file.type,
    size: file.size,
    lastModified: file.lastModified,
  };
  const kind = localFileKind(reference);
  if (["json", "csv", "txt", "md"].includes(kind)) {
    if (file.size > 50000)
      reference.previewIssue =
        "Text preview limited to files up to 50 KB. Download the original to read it.";
    else
      try {
        const text = await file.text();
        reference.data =
          kind === "json"
            ? JSON.parse(text)
            : kind === "csv"
              ? parseCsv(text)
              : text;
        if (JSON.stringify(reference.data).length > 60000) {
          delete reference.data;
          reference.previewIssue =
            "Parsed data exceeds the preview limit. Download the original.";
        }
      } catch {
        reference.previewIssue =
          "The file could not be parsed. Correct its JSON or CSV and choose it again.";
      }
  } else if (kind === "unsupported")
    reference.previewIssue =
      "No preview for this file type. Its original file is available to download.";
  const persistent = await writeLocal(
    `local-file:${reference.id}`,
    handle ?? file,
    { structured: true },
  );
  fileStates.set(
    reference.id,
    persistent
      ? { code: "available", message: "Available on this device." }
      : {
          code: "session_only",
          message:
            "Device storage is unavailable. This file is available for this session; choose it again after reload.",
        },
  );
  return reference;
}
export async function resolveLocalFile(
  reference: LocalFileReference,
  requestPermission = false,
): Promise<File> {
  const item = await readLocal<File | ReadFileHandle>(
    `local-file:${reference.id}`,
  );
  if (!item || reference.access === "reference") {
    fileStates.set(reference.id, {
      code: "local_file_unavailable",
      message:
        "Local file unavailable. Choose the file on this device to reconnect it. A URI alone does not grant browser access.",
    });
    throw new Error(fileStates.get(reference.id)!.message);
  }
  try {
    if ("getFile" in item) {
      const permission = requestPermission
        ? await item.requestPermission({ mode: "read" })
        : await item.queryPermission({ mode: "read" });
      if (permission !== "granted") {
        fileStates.set(reference.id, {
          code: "local_file_permission",
          message:
            "Read permission is required. Use Grant read access or choose the file again.",
        });
        throw new Error(fileStates.get(reference.id)!.message);
      }
      const file = await item.getFile();
      if (
        file.lastModified !== reference.lastModified ||
        file.size !== reference.size
      ) {
        fileStates.set(reference.id, {
          code: "local_file_changed",
          message:
            "The original file changed. Reconnect it in Edit content to update its saved data and references.",
        });
        throw new Error(fileStates.get(reference.id)!.message);
      }
      fileStates.set(reference.id, {
        code: "available",
        message: "Available on this device.",
      });
      return file;
    }
    if (fileStates.get(reference.id)?.code !== "session_only")
      fileStates.set(reference.id, {
        code: "available",
        message: "Available on this device.",
      });
    return item;
  } catch (error) {
    if (
      !["local_file_permission", "local_file_changed"].includes(
        fileStates.get(reference.id)?.code ?? "",
      )
    )
      fileStates.set(reference.id, {
        code: "local_file_unavailable",
        message:
          "The file is missing or read access was revoked. Reconnect it in Edit content.",
      });
    throw error;
  }
}
// Strip device locators and file contents throughout exported snapshots, including
// raw/result/field samples. Share viewers never resolve references on their device.
export function publicFileReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicFileReferences);
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    ["snapshot", "handle", "reference"].includes(String(row.access))
  )
    return {
      id: row.id,
      name: row.name,
      access: "reference",
      mediaType: row.mediaType,
      size: row.size,
      lastModified: row.lastModified,
      previewIssue: "Local files are not included in shared views.",
    };
  return Object.fromEntries(
    Object.entries(row).map(([key, item]) => [key, publicFileReferences(item)]),
  );
}
