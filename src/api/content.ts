import type { ApiDefinition } from "../types";

// Local content uses the existing invocation and widget contracts, without a request.
export const contentApi: ApiDefinition = {
  id: "canvas-content",
  name: "Canvas content",
  description: "Notes and supplied content saved on this device.",
  categories: ["Local content"],
  keywords: [],
  docs: "#",
  icon: "document",
  operations: [
    {
      id: "content",
      title: "Canvas content",
      description: "Edit this card's saved content.",
      inputs: {},
      endpoint: "",
      buildUrl: () => "",
      extract: (value) => value,
      sample: () => null,
      preferred: "note",
    },
  ],
};
