-- Durable outbound integration events for Google Sheets / Apps Script.
-- Payloads are encrypted at application level; Queue messages carry only event IDs.
CREATE TABLE integration_outbox (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  lease_until INTEGER,
  provider_id TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX integration_outbox_pending ON integration_outbox(state,updated_at);
CREATE INDEX integration_outbox_entity ON integration_outbox(event_type,entity_id);
