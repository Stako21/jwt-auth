import pool from "../db.cjs";
import { ROLE_IDS } from "../utils/roles.js";

const APPLY_FLAG = "--apply";
const ALLOW_NON_LOCAL_FLAG = "--allow-non-local";

function isLocalDatabaseHost(host) {
  const normalized = String(host || "").trim().toLowerCase();
  return ["localhost", "127.0.0.1", "::1"].includes(normalized);
}

async function loadPlannedRows(connection) {
  const [branchRows] = await connection.query(
    `
    SELECT
      u.id AS userId,
      u.branch_id AS branchId,
      u.name,
      u.user_name AS userName,
      u.role
    FROM users u
    WHERE u.is_active = 1
      AND u.role IN (?, ?)
      AND u.branch_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_branch_access uba
        WHERE uba.user_id = u.id
          AND uba.branch_id = u.branch_id
      )
    ORDER BY u.id
    `,
    [ROLE_IDS.Admin, ROLE_IDS.Director],
  );

  const [cityRows] = await connection.query(
    `
    SELECT
      u.id AS userId,
      u.city AS cityId,
      u.branch_id AS branchId,
      u.name,
      u.user_name AS userName,
      u.role
    FROM users u
    WHERE u.is_active = 1
      AND u.role IN (?, ?)
      AND u.city IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_city_access uca
        WHERE uca.user_id = u.id
          AND uca.city_id = u.city
      )
    ORDER BY u.id
    `,
    [ROLE_IDS.Accountant, ROLE_IDS.Warehouse],
  );

  return { branchRows, cityRows };
}

function printPlan({ branchRows, cityRows, apply }) {
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(
    `Database: ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || "auth"}`,
  );
  console.log("");
  console.log(`Primary branch-access rows to insert: ${branchRows.length}`);
  console.log(`Primary city-access rows to insert: ${cityRows.length}`);

  if (branchRows.length) {
    console.log("");
    console.log("Branch-access seed candidates:");
    console.table(
      branchRows.map((row) => ({
        userId: Number(row.userId),
        login: row.name,
        userName: row.userName,
        role: Number(row.role),
        branchId: Number(row.branchId),
      })),
    );
  }

  if (cityRows.length) {
    console.log("");
    console.log("City-access seed candidates:");
    console.table(
      cityRows.map((row) => ({
        userId: Number(row.userId),
        login: row.name,
        userName: row.userName,
        role: Number(row.role),
        branchId: Number(row.branchId),
        cityId: Number(row.cityId),
      })),
    );
  }
}

async function applySeed(connection, { branchRows, cityRows }) {
  await connection.beginTransaction();

  try {
    if (branchRows.length) {
      await connection.query(
        `
        INSERT IGNORE INTO user_branch_access (user_id, branch_id)
        VALUES ?
        `,
        [branchRows.map((row) => [Number(row.userId), Number(row.branchId)])],
      );
    }

    if (cityRows.length) {
      await connection.query(
        `
        INSERT IGNORE INTO user_city_access (user_id, city_id)
        VALUES ?
        `,
        [cityRows.map((row) => [Number(row.userId), Number(row.cityId)])],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has(APPLY_FLAG);
  const allowNonLocal = args.has(ALLOW_NON_LOCAL_FLAG);
  const host = process.env.DB_HOST || "localhost";

  if (apply && !allowNonLocal && !isLocalDatabaseHost(host)) {
    throw new Error(
      `Refusing to apply against non-local DB host "${host}". Re-run with ${ALLOW_NON_LOCAL_FLAG} only after explicit target-DB confirmation.`,
    );
  }

  const connection = await pool.getConnection();

  try {
    const plan = await loadPlannedRows(connection);
    printPlan({ ...plan, apply });

    if (!apply) {
      console.log("");
      console.log(
        `Dry run only. Re-run with ${APPLY_FLAG} to insert the primary access rows shown above.`,
      );
      return;
    }

    if (!plan.branchRows.length && !plan.cityRows.length) {
      console.log("");
      console.log("Nothing to apply.");
      return;
    }

    await applySeed(connection, plan);

    console.log("");
    console.log("Primary user access seed applied successfully.");
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("User access seed failed:", error);
  process.exit(1);
});
