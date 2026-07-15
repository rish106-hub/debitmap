# DebitMap privacy note

DebitMap is a prototype. Do not use it as your only record of financial obligations.

## Android app

The app requests `READ_SMS` and `RECEIVE_SMS` because its core function is detecting recurring payments from financial messages.

Before network processing, the phone requires both a currency amount and financial transaction language. Messages containing OTP or verification language are rejected.

Only likely financial messages are sent to the configured parsing API. The API is stateless. It does not write raw message text to a database, logs, analytics, or its response. Normalized transactions, forecasts, and feedback are stored locally in Room.

Users can revoke SMS access through Android settings. Removing the app deletes its local database.

## Web demo

Pasted messages and CSV files remain in the active browser session. The demo has no user account, analytics, advertising, or server-side persistence. Closing or refreshing the page removes imported data.

## Not included

- bank credentials
- UPI PINs
- payment initiation
- mandate cancellation
- Account Aggregator access
- sale or sharing of financial data

