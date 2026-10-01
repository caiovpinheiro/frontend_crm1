/**
 * Normalização de status de entrega (sendStatus / MessageStatus) para o enum
 * usado pelos ticks do WhatsApp. Separado em arquivo puro (.ts) para não
 * arrastar componentes TSX em testes de helpers.
 */

export type DeliveryTickStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export function normalizeDeliveryStatus(
  raw: string | null | undefined,
): DeliveryTickStatus | undefined {
  switch ((raw ?? "").toLowerCase()) {
    case "pending":
      return "pending";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "failed";
    default:
      return undefined;
  }
}
