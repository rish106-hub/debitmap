import { parseMessages, type MessageInput } from "../../../../lib/debitmap";

export async function POST(request: Request) {
  const body = (await request.json()) as { messages?: MessageInput[] };
  if (!Array.isArray(body.messages) || body.messages.length > 500) {
    return Response.json({ error: "Provide between 1 and 500 messages." }, { status: 400 });
  }
  const transactions = parseMessages(body.messages).map(({ sourceText: _discarded, ...transaction }) => ({
    id: transaction.id,
    sender: transaction.sender,
    occurred_at: transaction.occurredAt,
    amount: transaction.amount,
    direction: transaction.direction,
    merchant: transaction.merchant,
    normalized_merchant: transaction.normalizedMerchant,
    category: transaction.category,
    account_suffix: transaction.accountSuffix,
    reference: transaction.reference,
    explicit_recurring: transaction.explicitRecurring,
    confidence: transaction.confidence,
  }));
  return Response.json({ transactions, privacy: "Raw message text discarded after this response." });
}
