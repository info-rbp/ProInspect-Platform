# Production Status

Updated 4 October 2026.

This file is the authoritative concise status for the Cloudflare end state. Older Stage 3/Stage 4 GCP documents are retained only as rollback history until the rollback window closes.

## Source state

- `main` contains the reconciled Cloudflare platform source.
- Final end-state additions are developed on `finalise/platform-end-state` and must pass the normal Cloudflare verification gate before merge.
- The separately deployed Property Report Tool uses `finalise/proinspect-platform-v2` for the restored signed handoff/publication contract.
- The marketing website uses `finalise/portal-navigation` for Book Now / Portal Login completion.

## Implemented in source

- Public, Client, Tenant and Staff/Admin surfaces.
- D1 canonical data model.
- ordinary/sensitive R2 storage.
- native scheduling and booking concurrency.
- Cloudflare sessions/authentication and staff RBAC.
- email outbox and Queue delivery.
- Report Tool ingest endpoint and Staff handoff.
- Google Sheets / Apps Script integration outbox and idempotent event projection.
- website navigation contract for direct booking and portal login.

## Current finalisation control sequence

The merged end-state source passed permanent Cloudflare CI. A bootstrap attempt was correctly blocked because the exact source had not yet received the required isolated staging-rehearsal status. The controlled order remains: exact-source verification -> staging rehearsal -> production readiness -> protected bootstrap -> final migration -> pre-traffic acceptance -> domain cutover -> live acceptance -> close.

## Still requires observed operational evidence

The following must not be marked complete merely from source code:

1. exact-source Cloudflare CI success;
2. protected production deployment approval;
3. production Client, Tenant and Staff authentication;
4. non-empty ordinary and sensitive R2 upload/download checks;
5. restricted Form 2 isolation on production resources;
6. real Admin -> Report Tool -> final PDF -> ProInspect -> authorised audience round-trip;
7. Apps Script Web App deployment plus staging/production token and endpoint configuration;
8. custom-domain activation for `bookings.proinspect.systems`;
9. controlled live booking/document/portal/report transactions;
10. initial observation with no unresolved severity-1/2 issue.

Transactional-email acceptance may remain explicitly deferred only while the production acceptance record states that deferral.

## Rollback

Do not retire Google Cloud / Firebase resources yet. They remain read-only rollback evidence until the accepted Cloudflare runtime has completed its agreed observation and rollback period.
