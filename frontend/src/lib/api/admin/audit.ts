import { adminRequest, adminQuery } from "./transport";
import type { AdminAuditResponse } from "./types";

/** Lists recent administrative audit events. */
export function listAdminAudit(limit = 100): Promise<AdminAuditResponse> {
  return adminRequest(`/api/admin/audit${adminQuery({ limit })}`);
}
