import argparse
import json
import re
from pathlib import Path

import joblib
from sklearn.metrics import accuracy_score, classification_report

MONEY = re.compile(r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)", re.I)
DEBIT = re.compile(r"\b(debit(?:ed)?|spent|paid|charged)\b", re.I)
CREDIT = re.compile(r"\b(credited|received|refund(?:ed)?)\b", re.I)


def records(path: Path):
    with path.open() as handle:
        for line in handle:
            row = json.loads(line)
            messages = row["messages"]
            text = next(item["content"] for item in messages if item["role"] == "user").split("\n\n", 1)[-1]
            truth = json.loads(next(item["content"] for item in messages if item["role"] == "assistant"))
            yield text, truth


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", type=Path, default=Path("work/data/finee-test.jsonl"))
    parser.add_argument("--model", type=Path, default=Path("backend/models/category.joblib"))
    parser.add_argument("--output", type=Path, default=Path("evaluation/results.json"))
    args = parser.parse_args()
    model = joblib.load(args.model)
    category_texts, category_true = [], []
    amount_total = amount_correct = direction_total = direction_correct = 0
    for text, truth in records(args.test):
        if truth.get("category"):
            category_texts.append(text)
            category_true.append(truth["category"])
        if truth.get("amount") is not None:
            match = MONEY.search(text)
            if match:
                amount_total += 1
                predicted = float(match.group(1).replace(",", ""))
                amount_correct += abs(predicted - float(truth["amount"])) < 0.01
        if truth.get("type"):
            predicted_type = "credit" if CREDIT.search(text) and not DEBIT.search(text) else "debit"
            direction_total += 1
            direction_correct += predicted_type == truth["type"]
    category_pred = model.predict(category_texts)
    result = {
        "dataset": "Ranjit0034/finee-dataset test split",
        "category_records": len(category_true),
        "category_accuracy": round(float(accuracy_score(category_true, category_pred)), 4),
        "category_report": classification_report(category_true, category_pred, output_dict=True, zero_division=0),
        "amount_exact_match": round(amount_correct / amount_total, 4),
        "direction_accuracy": round(direction_correct / direction_total, 4),
        "warning": "FinEE is mostly synthetic. These metrics are not production accuracy claims.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2))
    print(json.dumps({key: value for key, value in result.items() if key != "category_report"}, indent=2))


if __name__ == "__main__":
    main()

