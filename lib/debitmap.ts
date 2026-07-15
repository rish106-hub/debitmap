export type MessageInput = {
  id?: string;
  sender: string;
  timestamp: string;
  text: string;
};

export type Transaction = {
  id: string;
  sender: string;
  occurredAt: string;
  amount: number;
  direction: "debit" | "credit";
  merchant: string;
  normalizedMerchant: string;
  category: string;
  accountSuffix?: string;
  reference?: string;
  explicitRecurring: boolean;
  sourceText: string;
  confidence: number;
};

export type FeedbackValue = "expected" | "not_recurring" | "ended";

export type Forecast = {
  id: string;
  merchant: string;
  category: string;
  cadence: "weekly" | "monthly" | "quarterly" | "annual";
  nextDebitAt: string;
  windowStart: string;
  windowEnd: string;
  expectedAmount: number;
  amountMin: number;
  amountMax: number;
  confidence: "high" | "medium";
  confidenceScore: number;
  evidence: string[];
  history: Transaction[];
  priceChangePercent: number | null;
};

const MONEY_PATTERN = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i;
const FINANCIAL_TERMS = /\b(debit(?:ed)?|paid|spent|purchase|charged|autopay|mandate|nach|standing instruction|emi|bill|withdrawn|credit(?:ed)?|refund(?:ed)?|received)\b/i;
const OTP_TERMS = /\b(otp|one[ -]?time password|verification code|do not share)\b/i;
const RECURRING_TERMS = /\b(autopay|auto pay|mandate|nach|standing instruction|recurring|subscription|emi)\b/i;

const aliases: Record<string, string> = {
  "netflix com": "Netflix",
  netflix: "Netflix",
  "google youtube": "YouTube Premium",
  youtube: "YouTube Premium",
  yt: "YouTube Premium",
  "bajaj finance": "Bajaj Finance EMI",
  bajajfinserv: "Bajaj Finance EMI",
  "hdfc ergo": "HDFC ERGO",
  hdfcergo: "HDFC ERGO",
  airtel: "Airtel",
  "airtel broadband": "Airtel Broadband",
  tatapower: "Tata Power",
  "tata power": "Tata Power",
  spotify: "Spotify",
  jiocinema: "JioCinema",
  hotstar: "Disney+ Hotstar",
};

const categoryTerms: Array<[RegExp, string]> = [
  [/netflix|youtube|spotify|hotstar|jiocinema|prime|subscription/i, "Entertainment"],
  [/airtel|jio|vi |broadband|electric|power|gas|water|utility/i, "Utilities"],
  [/emi|loan|bajaj|finance/i, "EMI"],
  [/insurance|ergo|lic|premium/i, "Insurance"],
  [/gym|cultfit|fitness/i, "Health"],
  [/swiggy|zomato|restaurant|food/i, "Food"],
];

const merchantPatterns = [
  /(?:paid|debited|payment of|purchase of|charged)\s+(?:₹|rs\.?|inr)?\s*[\d,.]+\s+(?:to|at|for)\s+(.+?)(?:\s+(?:via|using|on|ref|reference|txn|from|a\/c)\b|[.;]|$)/i,
  /(?:autopay|mandate|nach|standing instruction|emi)(?:\s+debit)?\s+(?:of\s+)?(?:₹|rs\.?|inr)?\s*[\d,.]+\s+(?:for|to|towards|by)\s+(.+?)(?:\s+(?:on|ref|reference|txn|from|a\/c)\b|[.;]|$)/i,
  /(?:to|at|for|towards|by)\s+([a-z][a-z0-9 &+._-]{2,40}?)(?:\s+(?:via|using|on|ref|reference|txn|from|a\/c)\b|[.;]|$)/i,
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanMerchant(value: string) {
  return value
    .replace(/\b(?:upi|card|credit card|debit card|e-?mandate)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 &+._-]/gi, "")
    .trim();
}

export function normalizeMerchant(value: string) {
  const cleaned = cleanMerchant(value);
  const key = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (key === alias || key.includes(alias)) return canonical;
  }
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function isLikelyFinancialMessage(text: string) {
  if (OTP_TERMS.test(text)) return false;
  return MONEY_PATTERN.test(text) && FINANCIAL_TERMS.test(text);
}

function inferMerchant(text: string) {
  for (const pattern of merchantPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeMerchant(match[1]);
  }
  const known = Object.keys(aliases).find((alias) => text.toLowerCase().includes(alias));
  return known ? aliases[known] : "Unknown merchant";
}

function inferCategory(merchant: string, text: string) {
  const haystack = `${merchant} ${text}`;
  return categoryTerms.find(([pattern]) => pattern.test(haystack))?.[1] ?? "Other";
}

export function parseMessage(input: MessageInput): Transaction | null {
  if (!isLikelyFinancialMessage(input.text)) return null;
  const amountMatch = input.text.match(MONEY_PATTERN);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const isCredit = /\b(credited|received|refund(?:ed)?)\b/i.test(input.text) &&
    !/\b(debit(?:ed)?|paid|charged)\b/i.test(input.text);
  const merchant = inferMerchant(input.text);
  const accountSuffix = input.text.match(/(?:a\/c|acct|account|card)(?:\s+(?:ending|xx|no\.?))?\s*[x*]*(\d{4})/i)?.[1];
  const reference = input.text.match(/(?:ref(?:erence)?|txn)(?:\s+no\.?)?[:\s-]*([a-z0-9-]{6,})/i)?.[1];
  const merchantFound = merchant !== "Unknown merchant";

  return {
    id: input.id ?? `${input.sender}-${input.timestamp}-${amount}`,
    sender: input.sender,
    occurredAt: new Date(input.timestamp).toISOString(),
    amount,
    direction: isCredit ? "credit" : "debit",
    merchant,
    normalizedMerchant: merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    category: inferCategory(merchant, input.text),
    accountSuffix,
    reference,
    explicitRecurring: RECURRING_TERMS.test(input.text),
    sourceText: input.text,
    confidence: merchantFound ? 0.94 : 0.7,
  };
}

export function parseMessages(messages: MessageInput[]) {
  return messages.map(parseMessage).filter((item): item is Transaction => Boolean(item));
}

function daysBetween(a: Date, b: Date) {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function cadenceFor(days: number): Forecast["cadence"] | null {
  if (days >= 5 && days <= 10) return "weekly";
  if (days >= 24 && days <= 38) return "monthly";
  if (days >= 75 && days <= 105) return "quarterly";
  if (days >= 330 && days <= 400) return "annual";
  return null;
}

function addCadence(date: Date, cadence: Forecast["cadence"]) {
  const next = new Date(date);
  if (cadence === "weekly") next.setDate(next.getDate() + 7);
  if (cadence === "monthly") next.setMonth(next.getMonth() + 1);
  if (cadence === "quarterly") next.setMonth(next.getMonth() + 3);
  if (cadence === "annual") next.setFullYear(next.getFullYear() + 1);
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildForecasts(
  transactions: Transaction[],
  feedback: Record<string, FeedbackValue> = {},
  referenceDate = new Date(),
) {
  const debitGroups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (transaction.direction !== "debit" || transaction.normalizedMerchant === "unknown-merchant") continue;
    const group = debitGroups.get(transaction.normalizedMerchant) ?? [];
    group.push(transaction);
    debitGroups.set(transaction.normalizedMerchant, group);
  }

  const forecasts: Forecast[] = [];
  for (const [id, unsorted] of debitGroups.entries()) {
    if (feedback[id] === "not_recurring" || feedback[id] === "ended") continue;
    const history = [...unsorted].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    if (history.length < 2) continue;
    const intervals = history.slice(1).map((item, index) =>
      daysBetween(new Date(history[index].occurredAt), new Date(item.occurredAt)),
    );
    const medianInterval = median(intervals);
    const cadence = cadenceFor(medianInterval);
    if (!cadence) continue;

    const tolerance = cadence === "weekly" ? 3 : cadence === "monthly" ? 8 : cadence === "quarterly" ? 18 : 45;
    const consistent = intervals.filter((interval) => Math.abs(interval - medianInterval) <= tolerance).length;
    const intervalRatio = consistent / intervals.length;
    if (intervalRatio < 0.6) continue;

    let next = addCadence(new Date(history.at(-1)!.occurredAt), cadence);
    while (next < referenceDate) next = addCadence(next, cadence);
    const amounts = history.map((item) => item.amount);
    const recentAmounts = amounts.slice(-4);
    const expectedAmount = Math.round(median(recentAmounts) * 100) / 100;
    const explicit = history.some((item) => item.explicitRecurring);
    const high = (history.length >= 3 && intervalRatio >= 0.75) || explicit;
    const latest = amounts.at(-1)!;
    const previous = amounts.length > 1 ? median(amounts.slice(0, -1).slice(-3)) : latest;
    const priceChange = previous > 0 ? ((latest - previous) / previous) * 100 : 0;
    const windowDays = cadence === "weekly" ? 1 : cadence === "monthly" ? 2 : cadence === "quarterly" ? 4 : 7;
    const start = new Date(next);
    const end = new Date(next);
    start.setDate(start.getDate() - windowDays);
    end.setDate(end.getDate() + windowDays);
    const evidence = [
      `${history.length} matching debits found`,
      `${Math.round(intervalRatio * 100)}% interval consistency`,
    ];
    if (explicit) evidence.push("Mandate or recurring-payment language detected");
    if (Math.abs(priceChange) >= 5) evidence.push(`Latest amount changed ${priceChange > 0 ? "+" : ""}${Math.round(priceChange)}%`);

    forecasts.push({
      id,
      merchant: history.at(-1)!.merchant,
      category: history.at(-1)!.category,
      cadence,
      nextDebitAt: isoDate(next),
      windowStart: isoDate(start),
      windowEnd: isoDate(end),
      expectedAmount,
      amountMin: Math.min(...recentAmounts),
      amountMax: Math.max(...recentAmounts),
      confidence: high ? "high" : "medium",
      confidenceScore: clamp(0.52 + history.length * 0.09 + intervalRatio * 0.2 + (explicit ? 0.12 : 0), 0, 0.99),
      evidence,
      history,
      priceChangePercent: Math.abs(priceChange) >= 5 ? Math.round(priceChange) : null,
    });
  }

  return forecasts.sort((a, b) => a.nextDebitAt.localeCompare(b.nextDebitAt));
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function sampleMessages(referenceDate = new Date()): MessageInput[] {
  const nextDates = {
    netflix: addDays(referenceDate, 4),
    emi: addDays(referenceDate, 9),
    power: addDays(referenceDate, 15),
    airtel: addDays(referenceDate, 22),
  };
  const rows: Array<[string, Date, number, string]> = [];
  for (let index = 4; index >= 1; index--) {
    rows.push(["AD-HDFCBK", addMonths(nextDates.netflix, -index), index === 1 ? 699 : 649, `Rs.${index === 1 ? "699" : "649"} debited from A/c XX1842 for Netflix.com via standing instruction. Ref NF${index}4821`]);
    rows.push(["VM-AXISBK", addMonths(nextDates.emi, -index), 12500, `INR 12,500 debited from account XX1842 towards Bajaj Finance EMI. Txn EMI${index}813`]);
    rows.push(["JD-SBIBNK", addMonths(nextDates.power, -index), [2140, 2380, 2260, 2475][4 - index], `Rs ${[2140, 2380, 2260, 2475][4 - index]} paid to Tata Power using UPI from A/c XX1842. Ref TP${index}771`]);
  }
  for (let index = 3; index >= 1; index--) {
    rows.push(["AX-AIRTEL", addMonths(nextDates.airtel, -index), 1178.82, `₹1,178.82 charged to card XX9901 for Airtel Broadband autopay. Reference AB${index}443`]);
  }
  rows.push(["VK-HDFCBK", addDays(referenceDate, -8), 842, "Rs.842 paid to Swiggy using UPI from A/c XX1842. Ref SW88721"]);
  rows.push(["VK-HDFCBK", addDays(referenceDate, -3), 2199, "INR 2,199 debited from A/c XX1842 for Amazon purchase. Ref AM77831"]);
  return rows.map(([sender, timestamp, amount, text], index) => ({
    id: `sample-${index}-${amount}`,
    sender,
    timestamp: timestamp.toISOString(),
    text,
  }));
}

export function formatInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

