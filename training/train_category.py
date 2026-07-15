"""Train the small runtime classifier on FinEE's validation split.

FinEE publishes a held-out test split separately. The larger training split can be
used with --input when resources allow. We default to validation because it is a
10 MB reproducible subset that keeps the prototype build cheap.
"""

import argparse
import json
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


def records(path: Path):
    with path.open() as handle:
        for line in handle:
            row = json.loads(line)
            messages = row["messages"]
            user = next(item["content"] for item in messages if item["role"] == "user")
            answer = json.loads(next(item["content"] for item in messages if item["role"] == "assistant"))
            category = answer.get("category")
            if category:
                yield user.split("\n\n", 1)[-1], category


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path("work/data/finee-valid.jsonl"))
    parser.add_argument("--output", type=Path, default=Path("backend/models/category.joblib"))
    args = parser.parse_args()
    data = list(records(args.input))
    texts, labels = zip(*data)
    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=2, max_features=45_000)),
        ("classifier", LogisticRegression(max_iter=500, class_weight="balanced", n_jobs=-1)),
    ])
    pipeline.fit(texts, labels)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, args.output, compress=3)
    print(json.dumps({"training_records": len(data), "classes": list(pipeline.classes_), "output": str(args.output)}))


if __name__ == "__main__":
    main()

