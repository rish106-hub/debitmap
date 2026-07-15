from __future__ import annotations

import math
import re
import statistics
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

try:
    import joblib
except ImportError:  # Keeps the rule engine runnable before optional model installation.
    joblib = None

MONEY = re.compile(r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)", re.I)
FINANCIAL = re.compile(r"\b(debit(?:ed)?|paid|spent|purchase|charged|autopay|mandate|nach|standing instruction|emi|bill|withdrawn|credit(?:ed)?|refund(?:ed)?|received)\b", re.I)
OTP = re.compile(r"\b(otp|one[ -]?time password|verification code|do not share)\b", re.I)
RECURRING = re.compile(r"\b(autopay|auto pay|mandate|nach|standing instruction|recurring|subscription|emi)\b", re.I)

ALIASES = {
    "netflix": "Netflix", "netflix com": "Netflix", "youtube": "YouTube Premium",
    "google youtube": "YouTube Premium", "bajaj finance": "Bajaj Finance EMI",
    "bajajfinserv": "Bajaj Finance EMI", "hdfc ergo": "HDFC ERGO",
    "airtel broadband": "Airtel Broadband", "airtel": "Airtel", "tata power": "Tata Power",
    "tatapower": "Tata Power", "spotify": "Spotify", "hotstar": "Disney+ Hotstar",
}

CATEGORY_RULES = [
    (re.compile(r"netflix|youtube|spotify|hotstar|jiocinema|prime|subscription", re.I), "entertainment"),
    (re.compile(r"airtel|jio|broadband|electric|power|gas|water|utility", re.I), "bills"),
    (re.compile(r"emi|loan|bajaj|finance", re.I), "emi"),
    (re.compile(r"insurance|ergo|lic|premium", re.I), "insurance"),
    (re.compile(r"gym|cultfit|fitness", re.I), "healthcare"),
    (re.compile(r"swiggy|zomato|restaurant|food", re.I), "food"),
]

MERCHANT_PATTERNS = [
    re.compile(r"(?:paid|debited|payment of|purchase of|charged|spent)\s+(?:₹|rs\.?|inr)?\s*[\d,.]+\s+(?:to|at|for)\s+(.+?)(?:\s+(?:via|using|on|ref|reference|txn|from|a/c)\b|[.;]|$)", re.I),
    re.compile(r"(?:autopay|mandate|nach|standing instruction|emi)(?:\s+debit)?\s+(?:of\s+)?(?:₹|rs\.?|inr)?\s*[\d,.]+\s+(?:for|to|towards|by)\s+(.+?)(?:\s+(?:on|ref|reference|txn|from|a/c)\b|[.;]|$)", re.I),
    re.compile(r"(?:to|at|for|towards|by)\s+([a-z][a-z0-9 &+._-]{2,40}?)(?:\s+(?:via|using|on|ref|reference|txn|from|a/c)\b|[.;]|$)", re.I),
]


class CategoryModel:
    def __init__(self, path: Path):
        self.pipeline = joblib.load(path) if joblib and path.exists() else None

    def predict(self, text: str, merchant: str) -> tuple[str, float]:
        combined = f"{merchant} {text}"
        for pattern, category in CATEGORY_RULES:
            if pattern.search(combined):
                return category, 0.97
        if self.pipeline is None:
            return "other", 0.55
        category = str(self.pipeline.predict([combined])[0])
        score = 0.75
        if hasattr(self.pipeline, "predict_proba"):
            score = float(max(self.pipeline.predict_proba([combined])[0]))
        return category, score


MODEL = CategoryModel(Path(__file__).parents[1] / "models" / "category.joblib")


def likely_financial(text: str) -> bool:
    return not OTP.search(text) and bool(MONEY.search(text) and FINANCIAL.search(text))


def normalize_merchant(value: str) -> str:
    cleaned = re.sub(r"\b(upi|card|credit card|debit card|e-?mandate)\b", " ", value, flags=re.I)
    cleaned = re.sub(r"[^a-z0-9 &+._-]", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    key = re.sub(r"[^a-z0-9]+", " ", cleaned.lower()).strip()
    for alias, canonical in ALIASES.items():
        if key == alias or alias in key:
            return canonical
    return cleaned.title()


def merchant_from(text: str) -> str:
    for pattern in MERCHANT_PATTERNS:
        match = pattern.search(text)
        if match:
            return normalize_merchant(match.group(1))
    lower = text.lower()
    for alias, canonical in ALIASES.items():
        if alias in lower:
            return canonical
    return "Unknown merchant"


def parse_message(message: dict[str, Any]) -> dict[str, Any] | None:
    text = str(message.get("text", ""))
    if not likely_financial(text):
        return None
    amount_match = MONEY.search(text)
    if not amount_match:
        return None
    amount = float(amount_match.group(1).replace(",", ""))
    is_credit = bool(re.search(r"\b(credited|received|refund(?:ed)?)\b", text, re.I)) and not bool(re.search(r"\b(debit(?:ed)?|paid|charged|spent)\b", text, re.I))
    merchant = merchant_from(text)
    category, category_confidence = MODEL.predict(text, merchant)
    account = re.search(r"(?:a/c|acct|account|card)(?:\s+(?:ending|xx|no\.?))?\s*[x*]*(\d{4})", text, re.I)
    reference = re.search(r"(?:ref(?:erence)?|txn)(?:\s+no\.?)?[:\s-]*([a-z0-9-]{6,})", text, re.I)
    occurred_at = datetime.fromisoformat(str(message["timestamp"]).replace("Z", "+00:00"))
    normalized = re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", merchant.lower()))
    return {
        "id": message.get("id") or f"{message.get('sender', 'unknown')}-{message['timestamp']}-{amount}",
        "sender": message.get("sender", "unknown"),
        "occurred_at": occurred_at.isoformat().replace("+00:00", "Z"),
        "amount": amount,
        "direction": "credit" if is_credit else "debit",
        "merchant": merchant,
        "normalized_merchant": normalized,
        "category": category,
        "account_suffix": account.group(1) if account else None,
        "reference": reference.group(1) if reference else None,
        "explicit_recurring": bool(RECURRING.search(text)),
        "confidence": round(0.65 + (0.2 if merchant != "Unknown merchant" else 0) + category_confidence * 0.1, 3),
    }


def _cadence(days: float) -> str | None:
    if 5 <= days <= 10: return "weekly"
    if 24 <= days <= 38: return "monthly"
    if 75 <= days <= 105: return "quarterly"
    if 330 <= days <= 400: return "annual"
    return None


def _add_cadence(value: datetime, cadence: str) -> datetime:
    if cadence == "weekly": return value + timedelta(days=7)
    months = {"monthly": 1, "quarterly": 3, "annual": 12}[cadence]
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    days = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return value.replace(year=year, month=month, day=min(value.day, days[month - 1]))


def forecast(transactions: list[dict[str, Any]], feedback: dict[str, str], reference: datetime) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in transactions:
        if item.get("direction") == "debit" and item.get("normalized_merchant") not in (None, "unknown-merchant"):
            groups[item["normalized_merchant"]].append(item)
    results = []
    for identifier, history in groups.items():
        if feedback.get(identifier) in {"ended", "not_recurring"} or len(history) < 2:
            continue
        history.sort(key=lambda item: item["occurred_at"])
        dates = [datetime.fromisoformat(item["occurred_at"].replace("Z", "+00:00")).replace(tzinfo=None) for item in history]
        intervals = [(dates[index] - dates[index - 1]).days for index in range(1, len(dates))]
        median_interval = statistics.median(intervals)
        cadence = _cadence(median_interval)
        if not cadence:
            continue
        tolerance = {"weekly": 3, "monthly": 8, "quarterly": 18, "annual": 45}[cadence]
        ratio = sum(abs(value - median_interval) <= tolerance for value in intervals) / len(intervals)
        if ratio < 0.6:
            continue
        next_date = _add_cadence(dates[-1], cadence)
        while next_date < reference:
            next_date = _add_cadence(next_date, cadence)
        amounts = [float(item["amount"]) for item in history]
        recent = amounts[-4:]
        explicit = any(bool(item.get("explicit_recurring")) for item in history)
        high = (len(history) >= 3 and ratio >= 0.75) or explicit
        previous = statistics.median(amounts[:-1][-3:]) if len(amounts) > 1 else amounts[-1]
        price_change = ((amounts[-1] - previous) / previous * 100) if previous else 0
        window_days = {"weekly": 1, "monthly": 2, "quarterly": 4, "annual": 7}[cadence]
        evidence = [f"{len(history)} matching debits found", f"{round(ratio * 100)}% interval consistency"]
        if explicit: evidence.append("Mandate or recurring-payment language detected")
        if abs(price_change) >= 5: evidence.append(f"Latest amount changed {price_change:+.0f}%")
        results.append({
            "id": identifier, "merchant": history[-1]["merchant"], "category": history[-1]["category"],
            "cadence": cadence, "next_debit_at": next_date.date().isoformat(),
            "window_start": (next_date - timedelta(days=window_days)).date().isoformat(),
            "window_end": (next_date + timedelta(days=window_days)).date().isoformat(),
            "expected_amount": round(statistics.median(recent), 2), "amount_min": min(recent), "amount_max": max(recent),
            "confidence": "high" if high else "medium",
            "confidence_score": round(min(0.99, 0.52 + len(history) * 0.09 + ratio * 0.2 + (0.12 if explicit else 0)), 3),
            "evidence": evidence, "price_change_percent": round(price_change) if abs(price_change) >= 5 else None,
        })
    return sorted(results, key=lambda item: item["next_debit_at"])

