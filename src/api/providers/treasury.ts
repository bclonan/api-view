import { defineApi, queryUrl, resultLimit as limit } from "../defineApi";
import { debtSample } from "../fixtures";
export default defineApi({
  id: "treasury",
  name: "U.S. Treasury",
  description: "Federal debt, down to the penny.",
  categories: ["Government", "Finance"],
  keywords: ["debt", "federal", "historical", "money"],
  icon: "landmark",
  docs: "https://fiscaldata.treasury.gov/api-documentation/",
  operations: [
    {
      id: "debt-to-penny",
      title: "Federal debt",
      description:
        "Daily total public debt and debt held by the public. Amounts are in USD.",
      endpoint:
        "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny",
      inputs: {
        limit: { ...limit, default: 30, maximum: 365 },
        from: { type: "date", label: "From date" },
        to: { type: "date", label: "To date" },
      },
      buildUrl: (a) =>
        queryUrl(
          "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny",
          {
            "page[size]": a.limit,
            sort: "-record_date",
            fields: "record_date,tot_pub_debt_out_amt,debt_held_public_amt",
            filter: [
              a.from && `record_date:gte:${a.from}`,
              a.to && `record_date:lte:${a.to}`,
            ]
              .filter(Boolean)
              .join(","),
          },
        ),
      extract: (r) => r.data,
      sample: debtSample,
      hints: {
        record_date: "date",
        tot_pub_debt_out_amt: "currency",
        debt_held_public_amt: "currency",
      },
      preferred: "line-chart",
      metadata: () => ({ currency: "USD" }),
    },
  ],
});
