"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  buildForecasts,
  formatInr,
  parseMessages,
  sampleMessages,
  type FeedbackValue,
  type MessageInput,
} from "../lib/debitmap";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

function dateLabel(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00`));
}

function categoryMark(category: string) {
  const marks: Record<string, string> = {
    Entertainment: "▶",
    Utilities: "⌁",
    EMI: "₹",
    Insurance: "+",
    Health: "♥",
  };
  return marks[category] ?? "•";
}

function parsePastedMessages(value: string): MessageInput[] {
  return value
    .split("\n")
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length < 3) return null;
      const [timestamp, sender, ...text] = parts;
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return null;
      return { id: `pasted-${index}`, timestamp: date.toISOString(), sender, text: text.join(" | ") };
    })
    .filter((item): item is MessageInput => Boolean(item));
}

function parseCsv(value: string): MessageInput[] {
  return value
    .split(/\r?\n/)
    .slice(1)
    .map((line, index) => {
      const first = line.indexOf(",");
      const second = line.indexOf(",", first + 1);
      if (first < 0 || second < 0) return null;
      const timestamp = line.slice(0, first).replace(/^"|"$/g, "").trim();
      const sender = line.slice(first + 1, second).replace(/^"|"$/g, "").trim();
      const text = line.slice(second + 1).replace(/^"|"$/g, "").replace(/""/g, '"').trim();
      const date = new Date(timestamp);
      if (!sender || !text || Number.isNaN(date.getTime())) return null;
      return { id: `csv-${index}`, timestamp: date.toISOString(), sender, text };
    })
    .filter((item): item is MessageInput => Boolean(item));
}

export function DebitMapDashboard() {
  const [referenceDate] = useState(() => new Date());
  const [messages, setMessages] = useState<MessageInput[]>(() => sampleMessages(new Date()));
  const [feedback, setFeedback] = useState<Record<string, FeedbackValue>>({});
  const [source, setSource] = useState<"sample" | "private">("sample");
  const [paste, setPaste] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const transactions = useMemo(() => parseMessages(messages), [messages]);
  const forecasts = useMemo(
    () => buildForecasts(transactions, feedback, referenceDate),
    [transactions, feedback, referenceDate],
  );
  const horizon = new Date(referenceDate);
  horizon.setDate(horizon.getDate() + 30);
  const upcoming = forecasts.filter((forecast) => new Date(forecast.nextDebitAt) <= horizon);
  const total = upcoming.reduce((sum, item) => sum + item.expectedAmount, 0);
  const next = upcoming[0];

  function applyFeedback(id: string, value: FeedbackValue) {
    setFeedback((current) => ({ ...current, [id]: value }));
  }

  function useSample() {
    setMessages(sampleMessages(new Date()));
    setFeedback({});
    setSource("sample");
    setNotice("Sample inbox restored.");
  }

  function analysePaste() {
    const parsed = parsePastedMessages(paste);
    if (!parsed.length) {
      setNotice("Use one message per line: YYYY-MM-DD | SENDER | MESSAGE");
      return;
    }
    setMessages(parsed);
    setFeedback({});
    setSource("private");
    setNotice(`${parsed.length} messages loaded. Nothing is saved.`);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed = parseCsv(await file.text());
    if (!parsed.length) {
      setNotice("CSV needs timestamp, sender, text columns.");
      return;
    }
    setMessages(parsed);
    setFeedback({});
    setSource("private");
    setNotice(`${parsed.length} CSV messages loaded. Nothing is saved.`);
    event.target.value = "";
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="DebitMap home">
          <span className="brand-mark">D</span>
          <span>DebitMap</span>
        </a>
        <div className="top-actions">
          <span className="private-note"><span className="status-dot" /> Stateless demo</span>
          <a className="text-link" href="#how">How it works</a>
          <a className="text-link" href="/debitmap-android.apk" download>Android APK</a>
          <a className="button button-small" href="#try">Try your data</a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">30-DAY DEBIT FORECAST</p>
          <h1>Know what will debit<br />before it does.</h1>
          <p className="hero-deck">DebitMap finds repeated payments hidden in transaction messages. Every prediction shows its evidence. No bank login needed.</p>
          <div className="hero-proof">
            <span>{transactions.length} financial messages read</span>
            <span>{forecasts.length} recurring patterns found</span>
            <span>Raw text not stored</span>
          </div>
        </div>

        <div className="forecast-summary" aria-label="30 day forecast summary">
          <div className="summary-heading">
            <div>
              <p>Likely in the next 30 days</p>
              <strong>{formatInr(total)}</strong>
            </div>
            <span className={`source-pill ${source}`}>{source === "sample" ? "SAMPLE INBOX" : "YOUR SESSION"}</span>
          </div>
          <div className="summary-rule" />
          <div className="summary-grid">
            <div><span>Commitments</span><b>{upcoming.length}</b></div>
            <div><span>Next debit</span><b>{next ? dateLabel(next.nextDebitAt) : "None"}</b></div>
            <div><span>High confidence</span><b>{upcoming.filter((item) => item.confidence === "high").length}</b></div>
          </div>
          {next && (
            <div className="next-card">
              <span className="category-icon">{categoryMark(next.category)}</span>
              <div><p>UP NEXT</p><strong>{next.merchant}</strong><span>{dateLabel(next.windowStart)} to {dateLabel(next.windowEnd)}</span></div>
              <b>{formatInr(next.expectedAmount)}</b>
            </div>
          )}
        </div>
      </section>

      <section className="timeline-section" aria-labelledby="timeline-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR COMMITMENT CALENDAR</p>
            <h2 id="timeline-title">What is likely to hit next</h2>
          </div>
          <button className="quiet-button" onClick={useSample}>Reset sample</button>
        </div>

        <div className="timeline">
          {upcoming.map((item) => (
            <article className="commitment" key={item.id}>
              <div className="date-column">
                <span>{new Date(`${item.nextDebitAt}T12:00:00`).toLocaleDateString("en-IN", { month: "short" }).toUpperCase()}</span>
                <strong>{new Date(`${item.nextDebitAt}T12:00:00`).getDate()}</strong>
                <i />
              </div>
              <div className="commitment-card">
                <div className="merchant-row">
                  <span className={`merchant-mark category-${item.category.toLowerCase()}`}>{categoryMark(item.category)}</span>
                  <div className="merchant-name">
                    <h3>{item.merchant}</h3>
                    <p>{item.category} · {item.cadence}</p>
                  </div>
                  <div className="amount">
                    <strong>{item.amountMin === item.amountMax ? formatInr(item.expectedAmount) : `${formatInr(item.amountMin)}–${formatInr(item.amountMax)}`}</strong>
                    <span>expected</span>
                  </div>
                </div>
                <div className="signal-row">
                  <span className={`confidence ${item.confidence}`}>{item.confidence === "high" ? "HIGH" : "MEDIUM"} · {Math.round(item.confidenceScore * 100)}%</span>
                  {item.priceChangePercent !== null && item.priceChangePercent > 0 && <span className="price-alert">↑ PRICE UP {item.priceChangePercent}%</span>}
                  <span className="window">Window: {dateLabel(item.windowStart)}–{dateLabel(item.windowEnd)}</span>
                </div>
                <details>
                  <summary>Why DebitMap thinks this is recurring <span>+</span></summary>
                  <ul>{item.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul>
                </details>
                <div className="feedback-row">
                  <span>Is this prediction useful?</span>
                  <button onClick={() => applyFeedback(item.id, "expected")}>Expected</button>
                  <button onClick={() => applyFeedback(item.id, "not_recurring")}>Not recurring</button>
                  <button onClick={() => applyFeedback(item.id, "ended")}>Ended</button>
                </div>
              </div>
            </article>
          ))}
          {!upcoming.length && (
            <div className="empty-state">
              <strong>No credible recurring debits found.</strong>
              <p>DebitMap needs at least two matching debit messages. Three are required before it sends an alert.</p>
            </div>
          )}
        </div>
      </section>

      <section className="try-section" id="try">
        <div className="try-copy">
          <p className="eyebrow">TEST THE ENGINE</p>
          <h2>Use messages you control.</h2>
          <p>Paste dated financial messages or upload a CSV. The browser sends nothing to storage. Closing the page clears the session.</p>
          <div className="privacy-list">
            <span><b>01</b> OTP and personal messages are rejected</span>
            <span><b>02</b> Only debit patterns enter the forecast</span>
            <span><b>03</b> Every result includes its evidence</span>
          </div>
        </div>
        <div className="input-card">
          <label htmlFor="messages">One message per line</label>
          <textarea
            id="messages"
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            placeholder={"2026-06-12 | AD-HDFCBK | Rs.649 debited from A/c XX1842 for Netflix via standing instruction.\n2026-05-12 | AD-HDFCBK | Rs.649 debited from A/c XX1842 for Netflix via standing instruction."}
          />
          <p className="format-note">FORMAT: YYYY-MM-DD | SENDER | MESSAGE</p>
          <div className="input-actions">
            <button className="button" onClick={analysePaste}>Build my forecast <span>→</span></button>
            <span>or</span>
            <button className="upload-button" onClick={() => fileInput.current?.click()}>Upload CSV</button>
            <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={handleFile} />
          </div>
          {notice && <p className="notice" role="status">{notice}</p>}
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="section-heading">
          <div><p className="eyebrow">NO BLACK BOX</p><h2>Three steps. Visible logic.</h2></div>
        </div>
        <div className="how-grid">
          <article><b>1</b><h3>Filter</h3><p>The phone keeps OTPs and conversations out. Only likely financial alerts move forward.</p></article>
          <article><b>2</b><h3>Extract</h3><p>Rules and a small financial language model identify amount, merchant, account, and payment type.</p></article>
          <article><b>3</b><h3>Forecast</h3><p>Calendar intervals, amount variation, and mandate language create an explainable confidence score.</p></article>
        </div>
        <div className="model-note">
          <span>DATASET</span>
          <p>Built around FinEE, an Apache 2.0 dataset with 152,000+ Indian banking messages. Most records are synthetic, so DebitMap does not present benchmark results as proof of production accuracy.</p>
          <a href="https://huggingface.co/datasets/Ranjit0034/finee-dataset" target="_blank" rel="noreferrer">View dataset ↗</a>
        </div>
      </section>

      <footer>
        <div className="brand"><span className="brand-mark">D</span><span>DebitMap</span></div>
        <p>A working consumer-finance prototype. Predictions are estimates, not payment instructions.</p>
        <div><a href="/debitmap-android.apk" download>APK</a><a href="https://github.com/rish106-hub/debitmap" target="_blank" rel="noreferrer">Source</a><a href="#top">Back to top ↑</a></div>
      </footer>
    </main>
  );
}
