# ProInspect Platform Architecture

Status: authoritative Cloudflare end-state architecture.

## Public entry

- `proinspect.systems` remains the separately deployed marketing website.
- The temporary Cloudflare-assigned `*.workers.dev` application root redirects to `https://proinspect.systems/`; it is not a customer-facing portal landing page.
- **Book Now** routes directly to `https://bookings.proinspect.systems/book`.
- **Portal Login** routes to `https://bookings.proinspect.systems/`.
- The application root is the gateway for Client, Tenant and Staff/Admin surfaces.
- Public `/book`, `/request-document` and `/manage/:token` remain unauthenticated service routes with abuse controls.

## Runtime

```text
Marketing website
  |-- Book Now -----> /book
  '-- Portal Login -> /
                       |-- Client Portal
                       |-- Tenant Portal
                       '-- Staff/Admin
                              |
                        Cloudflare Worker
                              |
       +----------------------+-------------------------+
       |                      |                         |
       v                      v                         v
      D1                     R2                  Durable Object
 canonical data      ordinary + sensitive        booking serialisation
       |
       |-- native scheduling + ICS
       |-- authentication/session/RBAC
       |-- audit + sensitive audit
       |-- email outbox -> Queue -> Cloudflare Email
       '-- integration outbox -> Queue -> Apps Script -> Google Sheet

Staff/Admin -> signed handoff -> Property Report Tool
Property Report Tool -> final PDF -> /api/integrations/reports
                                 -> R2 + propertyDocuments
                                 -> authorised Client/Tenant/Staff visibility
```

## Canonical system of record

D1 is the writable application system of record after accepted Cloudflare cutover. Canonical domain tables retain the reviewed Client -> Property -> Tenancy relationships and the Booking -> Work Order operational boundary.

R2 stores files. Restricted tenancy evidence is isolated from ordinary documents in its own binding and remains application-encrypted.

Google/Firebase resources are migration and rollback sources only during the rollback window. Google Calendar is not a runtime system of record; historical busy intervals are imported into native scheduling.

## Google Sheets / Apps Script

Google Sheets is an operational projection, never the source of truth.

Canonical actions create encrypted D1 integration-outbox events. Queue messages contain only an event ID. The Worker decrypts the event for delivery to the authenticated Apps Script Web App. Apps Script upserts by `eventId`, making retries idempotent.

Initial event vocabulary:

- `booking.created`
- `document_request.created`
- `client_request.created`
- `tenant_request.created`
- `work_order.created`
- `work_order.updated`
- `report.issued`

## Report Tool boundary

The Property Report Tool remains a separate Cloudflare application. Staff with report-management permission launch it using a five-minute signed handoff that carries canonical property and optional client/tenancy/booking/work-order context.

The Report Tool verifies that handoff inside its authenticated Worker boundary. A finalised immutable PDF is posted back with the Report Tool report ID as the idempotency key. ProInspect persists the file in R2 and the document metadata in canonical `propertyDocuments`.

## Release boundary

Repository source completion does not equal production acceptance. Custom-domain activation, production authentication checks, non-empty R2 verification, Report Tool round-trip and controlled live transactions remain protected operational gates.

Legacy GCP assets must not be retired until the rollback period is explicitly closed.
