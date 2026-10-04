export type IntegrationEventType =
  | 'booking.created'
  | 'document_request.created'
  | 'client_request.created'
  | 'tenant_request.created'
  | 'work_order.created'
  | 'work_order.updated'
  | 'report.issued';

export interface IntegrationEventInput {
  eventType: IntegrationEventType;
  entityId: string;
  propertyId?: string;
  clientId?: string;
  tenancyId?: string;
  payload: Record<string, unknown>;
}

/**
 * Legacy/local runtime adapter.
 *
 * The production Cloudflare bundle replaces this module with
 * src/cloudflare/integrationEvents.ts. Keeping the Node implementation as a
 * no-op prevents local development or rollback tooling from accidentally
 * calling an external Apps Script endpoint.
 */
export async function emitIntegrationEvent(_input: IntegrationEventInput): Promise<string | undefined> {
  return undefined;
}
