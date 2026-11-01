import { documentActionsService } from "../services/documentActions.service.js";

function handle(method) {
  return async (req, res) => {
    try {
      res.json(await documentActionsService[method](req.user, method === "list" ? req.query : req.body));
    } catch (error) {
      const migrationRequired = error.code === "ER_BAD_FIELD_ERROR" || error.code === "ER_NO_SUCH_TABLE";
      res.status(error.status || (migrationRequired ? 503 : 500)).json({
        code: error.status ? error.code : migrationRequired ? "MIGRATION_REQUIRED" : "DOCUMENT_ACTIONS_FAILED",
        message: error.status ? error.message : migrationRequired
          ? "Потрібно застосувати міграції бази даних (033)"
          : "Не вдалося виконати дію з документами",
      });
    }
  };
}

export const listDocumentActions = handle("list");
export const executeDocumentActions = handle("execute");
