from datetime import datetime
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from .engine import forecast, parse_message

app = FastAPI(
    title="DebitMap API",
    version="0.1.0",
    description="Stateless parsing and recurring-debit forecasting. Raw message text is never persisted.",
    docs_url="/docs",
    redoc_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["content-type"],
)


class Message(BaseModel):
    id: str | None = None
    sender: str = Field(min_length=1, max_length=80)
    timestamp: datetime
    text: str = Field(min_length=1, max_length=1000)


class ParseRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=500)


class Transaction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    sender: str
    occurred_at: str
    amount: float
    direction: Literal["debit", "credit"]
    merchant: str
    normalized_merchant: str
    category: str
    account_suffix: str | None = None
    reference: str | None = None
    explicit_recurring: bool
    confidence: float


class ForecastRequest(BaseModel):
    transactions: list[Transaction] = Field(min_length=1, max_length=2000)
    feedback: dict[str, Literal["expected", "not_recurring", "ended"]] = {}
    reference_date: datetime | None = None


@app.get("/health")
def health():
    return {"status": "ok", "storage": "none"}


@app.post("/v1/parse")
def parse(request: ParseRequest):
    transactions = []
    for message in request.messages:
        item = parse_message(message.model_dump(mode="json"))
        if item:
            transactions.append(item)
    return {"transactions": transactions, "privacy": "Raw message text discarded after this response."}


@app.post("/v1/forecast")
def create_forecast(request: ForecastRequest):
    reference = (request.reference_date or datetime.now()).replace(tzinfo=None)
    return {"forecasts": forecast([item.model_dump() for item in request.transactions], request.feedback, reference)}

