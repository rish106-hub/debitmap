from datetime import datetime

from app.engine import forecast, parse_message


def test_otp_is_rejected():
    assert parse_message({"sender": "HDFC", "timestamp": "2026-06-01T00:00:00Z", "text": "OTP 123456 for Rs.649. Do not share."}) is None


def test_monthly_forecast_and_feedback():
    messages = [
        {"sender": "HDFC", "timestamp": f"2026-0{month}-12T00:00:00Z", "text": "Rs.649 debited from A/c XX1842 for Netflix via standing instruction."}
        for month in (3, 4, 5)
    ]
    transactions = [parse_message(item) for item in messages]
    result = forecast(transactions, {}, datetime(2026, 5, 20))
    assert len(result) == 1
    assert result[0]["next_debit_at"] == "2026-06-12"
    assert result[0]["confidence"] == "high"
    assert forecast(transactions, {"netflix": "ended"}, datetime(2026, 5, 20)) == []

