import {
  buildForecasts,
  type FeedbackValue,
  type Transaction,
} from "../../../../lib/debitmap";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    transactions?: Array<Transaction | {
      id: string; sender: string; occurred_at: string; amount: number; direction: "debit" | "credit";
      merchant: string; normalized_merchant: string; category: string; account_suffix?: string;
      reference?: string; explicit_recurring: boolean; confidence: number;
    }>;
    feedback?: Record<string, FeedbackValue>;
    referenceDate?: string;
    reference_date?: string;
  };
  if (!Array.isArray(body.transactions) || body.transactions.length > 2000) {
    return Response.json({ error: "Provide between 1 and 2,000 normalized transactions." }, { status: 400 });
  }
  const normalized = body.transactions.map((item) => {
    if ("occurred_at" in item) {
      return {
        id: item.id, sender: item.sender, occurredAt: item.occurred_at, amount: item.amount,
        direction: item.direction, merchant: item.merchant, normalizedMerchant: item.normalized_merchant,
        category: item.category, accountSuffix: item.account_suffix, reference: item.reference,
        explicitRecurring: item.explicit_recurring, confidence: item.confidence, sourceText: "discarded",
      } satisfies Transaction;
    }
    return item;
  });
  const reference = body.reference_date ?? body.referenceDate;
  const referenceDate = reference ? new Date(reference) : new Date();
  const forecasts = buildForecasts(normalized, body.feedback ?? {}, referenceDate).map((item) => ({
    id: item.id, merchant: item.merchant, category: item.category, cadence: item.cadence,
    next_debit_at: item.nextDebitAt, window_start: item.windowStart, window_end: item.windowEnd,
    expected_amount: item.expectedAmount, amount_min: item.amountMin, amount_max: item.amountMax,
    confidence: item.confidence, confidence_score: item.confidenceScore, evidence: item.evidence,
    price_change_percent: item.priceChangePercent,
  }));
  return Response.json({ forecasts });
}
