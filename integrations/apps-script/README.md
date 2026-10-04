# Google Sheets / Apps Script integration

The Cloudflare platform remains the system of record. This Apps Script project is an idempotent operational projection of canonical platform events.

## Deploy

1. Create or choose the operational Google Sheet.
2. Create an Apps Script project owned by the ProInspect Workspace account and copy `Code.gs`.
3. Run `configureProInspect('<spreadsheet-id>', '<high-entropy-token>')` once from the editor.
4. Deploy as a Web App, executing as the owner. The script performs its own shared-token authentication.
5. Store the Web App `/exec` URL as the Worker secret/variable `APPS_SCRIPT_WEBHOOK_URL`.
6. Store the same token as Worker secret `APPS_SCRIPT_WEBHOOK_TOKEN`.

Never put the token in the Sheet or repository.

## Delivery contract

Cloudflare D1 stores an encrypted integration outbox record and sends only its event ID through the existing Queue. The Worker decrypts the event only when delivering it to Apps Script. Apps Script upserts by `eventId`, so Queue retries do not duplicate rows.

Initial event types:

- `booking.created`
- `document_request.created`
- `client_request.created`
- `tenant_request.created`
- `work_order.created`
- `work_order.updated`
- `report.issued`

Tabs are Bookings, Requests, Work Orders, Reports and Events.
