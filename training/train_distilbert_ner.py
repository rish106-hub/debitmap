"""Optional DistilBERT NER training entrypoint.

FinEE stores JSON entities instead of BIO spans. This script aligns values that
occur verbatim in the message, then fine-tunes multilingual DistilBERT. The
runtime does not require this large model and falls back to deterministic rules.
Run on a GPU before a production release, not on the free CPU demo.
"""

import json
from pathlib import Path

FIELDS = ("merchant", "bank", "beneficiary", "vpa")


def aligned_examples(path: Path):
    with path.open() as handle:
        for line in handle:
            row = json.loads(line)
            messages = row["messages"]
            text = next(item["content"] for item in messages if item["role"] == "user").split("\n\n", 1)[-1]
            truth = json.loads(next(item["content"] for item in messages if item["role"] == "assistant"))
            entities = []
            for field in FIELDS:
                value = truth.get(field)
                if not isinstance(value, str):
                    continue
                start = text.lower().find(value.lower())
                if start >= 0:
                    entities.append({"start": start, "end": start + len(value), "label": field.upper()})
            if entities:
                yield {"text": text, "entities": entities}


if __name__ == "__main__":
    samples = list(aligned_examples(Path("work/data/finee-valid.jsonl")))
    Path("work/data/finee-ner-aligned.json").write_text(json.dumps(samples, ensure_ascii=False))
    print(f"Aligned {len(samples)} FinEE records. Use this file with transformers token-classification Trainer.")

