import bcrypt from "bcryptjs";
import WarehouseDashboardRepository from "../repositories/WarehouseDashboard.js";
import { Conflict, Forbidden, NotFound, Unprocessable } from "../utils/Errors.js";

const LOGIN_PATTERN = /^[a-z0-9._@-]+$/i;

function requiredText(value, label, maxLength) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Unprocessable(`Поле «${label}» є обов'язковим`);
  if (normalized.length > maxLength) {
    throw new Unprocessable(`Поле «${label}» не може перевищувати ${maxLength} символів`);
  }
  return normalized;
}

function normalizeWarehouseIds(value) {
  if (!Array.isArray(value)) {
    throw new Unprocessable("Оберіть щонайменше один склад");
  }
  const result = [...new Set(value.map(Number))].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (!result.length || result.length !== value.length) {
    throw new Unprocessable("Список складів некоректний або порожній");
  }
  return result;
}

function kyivParts(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function shiftDate(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function getCurrentShiftReportDate(now = new Date()) {
  const parts = kyivParts(now);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return Number(parts.hour) < 8 ? shiftDate(date, -1) : date;
}

export function buildWarehouseRanking(rows) {
  const normalized = (rows || []).map((row) => ({
    pickerGuid: row.pickerGuid,
    picker: String(row.picker || "Без імені").trim() || "Без імені",
    documentsCount: Number(row.documentsCount || 0),
    rowsCount: Number(row.rowsCount || 0),
    weight: Number(row.weight || 0),
  }));
  normalized.sort(
    (left, right) =>
      right.documentsCount - left.documentsCount ||
      right.rowsCount - left.rowsCount ||
      right.weight - left.weight ||
      left.picker.localeCompare(right.picker, "uk-UA"),
  );
  let previousDocuments = null;
  let previousRank = 0;
  return normalized.map((row, index) => {
    if (row.documentsCount !== previousDocuments) {
      previousRank = index + 1;
      previousDocuments = row.documentsCount;
    }
    return { ...row, rank: previousRank };
  });
}

function mapAccounts({ accounts, access }) {
  const byUser = new Map();
  for (const warehouse of access) {
    const userId = Number(warehouse.userId);
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId).push({
      id: Number(warehouse.id),
      warehouseGuid: warehouse.warehouseGuid,
      warehouseName: warehouse.warehouseName,
      isActive: Boolean(warehouse.isActive),
    });
  }
  return accounts.map((account) => ({
    id: Number(account.id),
    login: account.login,
    displayName: account.displayName,
    isActive: Boolean(account.isActive),
    warehouses: byUser.get(Number(account.id)) || [],
  }));
}

export function createWarehouseDashboardService(
  repository = WarehouseDashboardRepository,
) {
  return {
    async listAccounts(branchId) {
      const [data, warehouses] = await Promise.all([
        repository.listAccounts(branchId),
        repository.warehouseOptions(branchId),
      ]);
      return {
        accounts: mapAccounts(data),
        warehouses: warehouses.map((warehouse) => ({
          id: Number(warehouse.id),
          warehouseGuid: warehouse.warehouseGuid,
          warehouseName: warehouse.warehouseName,
        })),
      };
    },

    async saveAccount(id, payload, branchId) {
      const accountId = id === null ? null : Number(id);
      if (id !== null && (!Number.isInteger(accountId) || accountId <= 0)) {
        throw new Unprocessable("Некоректний ID облікового запису");
      }
      const login = requiredText(payload?.login, "Логін", 25).toLowerCase();
      if (!LOGIN_PATTERN.test(login)) {
        throw new Unprocessable("Логін містить неприпустимі символи");
      }
      const displayName = requiredText(payload?.displayName, "Назва", 150);
      const warehouseIds = normalizeWarehouseIds(payload?.warehouseIds);
      const allowedIds = new Set(
        (await repository.warehouseOptions(branchId)).map((item) => Number(item.id)),
      );
      if (warehouseIds.some((warehouseId) => !allowedIds.has(warehouseId))) {
        throw new Unprocessable("Вибрано неактивний або невідомий склад");
      }

      const existing = await repository.findLogin(login);
      if (existing && Number(existing.id) !== Number(accountId)) {
        throw new Conflict("Такий логін вже існує");
      }

      const password = String(payload?.password ?? "");
      let passwordHash = null;
      if (!accountId || password) {
        if (password.length < 8 || password.length > 50) {
          throw new Unprocessable("Пароль має містити від 8 до 50 символів");
        }
        passwordHash = await bcrypt.hash(password, 10);
      }

      try {
        return {
          id: await repository.saveAccount({
            id: accountId,
            branchId,
            login,
            displayName,
            passwordHash,
            isActive: payload?.isActive !== false,
            warehouseIds,
          }),
        };
      } catch (error) {
        if (error?.code === "ER_DUP_ENTRY") {
          throw new Conflict("Такий логін вже існує");
        }
        if (error?.code === "ACCOUNT_NOT_FOUND") {
          throw new NotFound("Обліковий запис не знайдено");
        }
        throw error;
      }
    },

    async getDashboard({ userId, branchId, warehouseId, now = new Date() }) {
      const warehouses = await repository.getAllowedWarehouses(userId, branchId);
      if (!warehouses.length) {
        throw new Forbidden("Для цього екрана не налаштовано доступні склади");
      }
      const requestedId = warehouseId ? Number(warehouseId) : null;
      if (warehouseId && (!Number.isInteger(requestedId) || requestedId <= 0)) {
        throw new Unprocessable("Некоректний ID складу");
      }
      const warehouse = requestedId
        ? warehouses.find((item) => Number(item.id) === requestedId)
        : warehouses[0];
      if (!warehouse) throw new Forbidden("Немає доступу до вибраного складу");

      const reportDate = getCurrentShiftReportDate(now);
      const snapshot = await repository.getShiftRows(
        branchId,
        warehouse.warehouseGuid,
        reportDate,
      );
      const ranking = buildWarehouseRanking(snapshot.rows);
      return {
        reportDate,
        shift: {
          startDate: reportDate,
          endDate: shiftDate(reportDate, 1),
          startTime: "08:00",
          endTime: "08:00",
        },
        warehouse: {
          id: Number(warehouse.id),
          warehouseGuid: warehouse.warehouseGuid,
          warehouseName: warehouse.warehouseName,
        },
        warehouses: warehouses.map((item) => ({
          id: Number(item.id),
          warehouseName: item.warehouseName,
        })),
        summary: ranking.reduce(
          (total, row) => ({
            workersCount: total.workersCount + 1,
            documentsCount: total.documentsCount + row.documentsCount,
            rowsCount: total.rowsCount + row.rowsCount,
            weight: total.weight + row.weight,
          }),
          { workersCount: 0, documentsCount: 0, rowsCount: 0, weight: 0 },
        ),
        ranking,
        dataUpdatedAt: snapshot.dataUpdatedAt,
        generatedAt: now.toISOString(),
      };
    },
  };
}

export default createWarehouseDashboardService();
