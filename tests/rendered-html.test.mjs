import assert from "node:assert/strict";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

test("renders the DebitMap judge dashboard", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/"), env, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /DebitMap/);
  assert.match(html, /Know what will debit/);
  assert.match(html, /Likely in the next 30 days/);
  assert.match(html, /Raw text not stored/);
  assert.doesNotMatch(html, /codex-preview|Starter Project|react-loading-skeleton/);
});

test("parses a financial SMS and rejects an OTP", async () => {
  const app = await worker();
  const request = new Request("http://localhost/api/v1/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [
      { sender: "HDFC", timestamp: "2026-06-12T00:00:00Z", text: "Rs.649 debited from A/c XX1842 for Netflix via standing instruction." },
      { sender: "HDFC", timestamp: "2026-06-12T00:01:00Z", text: "OTP 481902 for transaction of Rs.649. Do not share." },
    ] }),
  });
  const response = await app.fetch(request, env, context);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.transactions.length, 1);
  assert.equal(body.transactions[0].merchant, "Netflix");
  assert.equal(body.transactions[0].amount, 649);
  assert.equal(body.transactions[0].explicit_recurring, true);
});

test("forecasts a consistent monthly debit with visible evidence", async () => {
  const app = await worker();
  const transactions = ["2026-03-12", "2026-04-12", "2026-05-12"].map((date, index) => ({
    id: `t-${index}`,
    sender: "HDFC",
    occurredAt: `${date}T00:00:00.000Z`,
    amount: index === 2 ? 699 : 649,
    direction: "debit",
    merchant: "Netflix",
    normalizedMerchant: "netflix",
    category: "Entertainment",
    explicitRecurring: true,
    sourceText: "Netflix standing instruction",
    confidence: 0.94,
  }));
  const request = new Request("http://localhost/api/v1/forecast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions, referenceDate: "2026-05-20T00:00:00Z" }),
  });
  const response = await app.fetch(request, env, context);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.forecasts.length, 1);
  assert.equal(body.forecasts[0].cadence, "monthly");
  assert.equal(body.forecasts[0].next_debit_at, "2026-06-12");
  assert.equal(body.forecasts[0].confidence, "high");
  assert.ok(body.forecasts[0].evidence.length >= 3);
});

test("suppresses commitments marked ended", async () => {
  const app = await worker();
  const transactions = ["2026-03-01", "2026-04-01", "2026-05-01"].map((date, index) => ({
    id: `emi-${index}`,
    sender: "AXIS",
    occurredAt: `${date}T00:00:00.000Z`,
    amount: 12500,
    direction: "debit",
    merchant: "Bajaj Finance EMI",
    normalizedMerchant: "bajaj-finance-emi",
    category: "EMI",
    explicitRecurring: true,
    sourceText: "EMI debit",
    confidence: 0.94,
  }));
  const response = await app.fetch(new Request("http://localhost/api/v1/forecast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions, feedback: { "bajaj-finance-emi": "ended" }, referenceDate: "2026-05-10T00:00:00Z" }),
  }), env, context);
  const body = await response.json();
  assert.deepEqual(body.forecasts, []);
});
