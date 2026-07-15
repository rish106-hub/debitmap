# Razorpay AI Builders submission

## What I built

DebitMap is a 30-day recurring debit watcher for ordinary consumers. It reads financial SMS, rejects OTPs locally, extracts normalized transactions, and finds weekly, monthly, quarterly, or annual payment patterns. The result is a commitment calendar showing likely debit dates, amount ranges, confidence, price changes, and the evidence behind every prediction.

The public web demo works immediately with a realistic sample inbox and also accepts pasted messages or CSV. The Android app handles consent, SMS scanning, local Room storage, background updates, feedback, and alerts three days before high-confidence predicted debits.

## Why I built it

Mandates are scattered across UPI apps, cards, NACH, and merchants. More importantly, not every repeating charge appears as a formal mandate. Consumers need one answer: what is likely to leave my accounts next month?

DebitMap focuses on actual debit history rather than pretending it can cancel every payment rail.

## What I cut

I cut bank logins, Account Aggregator integration, automatic cancellation, cloud accounts, and a general-purpose LLM. Those features add compliance and trust problems before the core prediction is proven.

I also did not hide weak dataset results. FinEE is mostly synthetic and contains amount-label inconsistencies. The repository includes the full held-out evaluation.

## Next 10 hours

I would label 300 real, consented, anonymized financial messages across five banks, improve merchant aliasing, calibrate confidence against false-alert cost, test on two physical Android devices, and add a notification audit screen showing exactly why each alert was scheduled.

