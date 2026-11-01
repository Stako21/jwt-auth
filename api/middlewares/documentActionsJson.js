import express from "express";

// A 1000-document selection includes a status and registration timestamp per row.
// Keep the larger JSON allowance confined to this administrative endpoint.
export const documentActionsJson = express.json({ limit: "256kb" });
