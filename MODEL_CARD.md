# DebitMap model card

## Purpose

DebitMap uses a lightweight text classifier to assign transaction categories. Exact amounts, debit direction, dates, references, and account suffixes use deterministic extraction rules. Recurring-payment forecasting is also deterministic and explainable.

No general-purpose LLM is used in the prediction path.

## Dataset

- Source: `Ranjit0034/finee-dataset`
- License: Apache 2.0
- Training subset: 7,157 labeled records from the published validation split
- Evaluation subset: 7,627 records from the separate published test split, including 7,108 records with category labels
- Languages: English, Hindi, Tamil, Telugu, Bengali, and Kannada
- Important limitation: most records are synthetic

The smaller validation split is used as the prototype training set to keep training reproducible on a laptop. The larger published training split can be supplied to `training/train_category.py --input` later.

## Model

- character n-gram TF-IDF features
- balanced logistic regression classifier
- maximum 45,000 features
- 13 output categories
- serialized artifact: `backend/models/category.joblib`

The API also contains high-precision merchant and category rules for common recurring Indian payments. The learned classifier handles messages not covered by those rules.

## Evaluation

| Metric | Result |
| --- | ---: |
| Category accuracy | 0.9216 |
| Amount exact match | 0.8753 |
| Direction accuracy | 0.9132 |

The amount metric compares message extraction with FinEE labels. Inspection found systematic decimal mismatches between message text and labels. DebitMap keeps the published labels unchanged and reports the resulting lower score.

Full per-category precision, recall, and F1 are stored in `evaluation/results.json`.

## Recurrence confidence

High confidence requires one of:

- at least three matching debits with at least 75% interval consistency
- explicit recurring language such as `autopay`, `mandate`, `NACH`, `standing instruction`, or `EMI`

Two matching debits may appear as medium confidence. Medium-confidence items do not schedule notifications.

## Risks

- Synthetic templates may exaggerate performance.
- Bank message formats change.
- Merchant normalization can merge unrelated merchants or split the same merchant.
- Family plans, partial payments, and irregular utilities can confuse amount forecasts.
- A prediction is not proof that a valid mandate exists.

The interface always labels results as predictions and displays the evidence used.

