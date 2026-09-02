import { defineApi, queryUrl, resultLimit as limit } from "../defineApi";
export default defineApi({
  id: "open-fda",
  name: "openFDA",
  description: "Drug labels from the source.",
  categories: ["Health"],
  keywords: ["medicine", "drug", "medication", "warnings", "health"],
  icon: "pill",
  docs: "https://open.fda.gov/apis/drug/label/",
  operations: [
    {
      id: "labels",
      title: "Drug labels",
      description:
        "Published drug labeling. Read full source labels for context.",
      endpoint: "https://api.fda.gov/drug/label.json",
      inputs: {
        q: {
          type: "string",
          label: "Drug name",
          required: true,
          placeholder: "Aspirin",
        },
        limit: { ...limit, default: 3, maximum: 10 },
      },
      buildUrl: (a) =>
        queryUrl("https://api.fda.gov/drug/label.json", {
          search: `openfda.generic_name:"${String(a.q).replace(/["\\]/g, "")}"`,
          limit: a.limit,
        }),
      extract: (r) =>
        (r.results ?? []).map((d: any) => ({
          title:
            d.openfda?.brand_name?.[0] ??
            d.openfda?.generic_name?.[0] ??
            "Drug label",
          generic_name: d.openfda?.generic_name?.join(", "),
          indications: d.indications_and_usage?.join("\n"),
          warnings: d.warnings?.join("\n"),
          dosage: d.dosage_and_administration?.join("\n"),
        })),
      sample: () => ({
        results: [
          {
            openfda: {
              brand_name: ["Sample drug label"],
              generic_name: ["Illustrative record"],
            },
            indications_and_usage: [
              "Sample text demonstrates long-form sections. Load live data to retrieve a published label.",
            ],
            warnings: ["This sample contains no dosing or treatment guidance."],
          },
        ],
      }),
      preferred: "drug",
    },
  ],
});
