// Keep the natural queue unchanged; explicit administrator requests only extend it.
export const TRO_NATURAL_STATUS_PENDING_SQL = `(d.status <> 'REJECTED' AND (
  td.one_c_stage IS NULL OR td.one_c_stage IN ('NEW', 'IN_PROGRESS')
  OR (td.one_c_stage = 'CANCELLED' AND (d.status = 'PLANNED' OR EXISTS (
    SELECT 1 FROM tro_1c_execution_documents te WHERE te.portal_document_id = d.id
  )))
))`;

export const TRO_STATUS_PENDING_SQL = `(${TRO_NATURAL_STATUS_PENDING_SQL}
  OR td.status_sync_requested_at IS NOT NULL)`;

export function isTroNaturallyStatusPending(doc, hasExecutions = false) {
  return doc.status !== "REJECTED" && (
    doc.one_c_stage == null || ["NEW", "IN_PROGRESS"].includes(doc.one_c_stage)
    || (doc.one_c_stage === "CANCELLED" && (doc.status === "PLANNED" || hasExecutions))
  );
}
