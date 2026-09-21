import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import IntegrationAccountsRepository from "../repositories/IntegrationAccounts.js";

export class IntegrationAccountError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function text(value, field, maxLength, required = true) {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) throw new IntegrationAccountError(422, "VALIDATION_ERROR", `Поле ${field} є обов'язковим`);
  if (normalized.length > maxLength) throw new IntegrationAccountError(422, "VALIDATION_ERROR", `Поле ${field} не може перевищувати ${maxLength} символів`);
  return normalized || null;
}

const flag = (value) => value === true || value === 1 || value === "1";

function normalizeCityIds(value) {
  if (!Array.isArray(value)) throw new IntegrationAccountError(422, "VALIDATION_ERROR", "Оберіть щонайменше одне місто");
  const result = [...new Set(value.map(Number))].filter((id) => Number.isInteger(id) && id > 0);
  if (!result.length || result.length !== value.length) throw new IntegrationAccountError(422, "VALIDATION_ERROR", "Список міст некоректний або порожній");
  return result;
}

function mapList({ accounts, cities }) {
  const byAccount = new Map();
  for (const city of cities) {
    const id = Number(city.integration_account_id);
    if (!byAccount.has(id)) byAccount.set(id, []);
    byAccount.get(id).push({ id: Number(city.id), name: city.name, branch_id: Number(city.branch_id), branch_name: city.branch_name });
  }
  return accounts.map((account) => ({
    id: Number(account.id), login: account.login, display_name: account.display_name,
    issued_to_name: account.issued_to_name, is_active: Boolean(account.is_active),
    can_process_requests: Boolean(account.can_process_requests), can_sync_statuses: Boolean(account.can_sync_statuses),
    last_login_at: account.last_login_at, last_used_at: account.last_used_at,
    created_at: account.created_at, updated_at: account.updated_at,
    cities: byAccount.get(Number(account.id)) || [],
  }));
}

export function createIntegrationAccountsService(repository = IntegrationAccountsRepository) {
  return {
    async signIn(payload) {
      const login = text(payload?.login, "login", 100)?.toLowerCase();
      const password = text(payload?.password, "password", 72);
      const account = await repository.findByLogin(login);
      const accepted = account?.is_active && await bcrypt.compare(password, account.password_hash);
      if (!accepted) throw new IntegrationAccountError(401, "INVALID_CREDENTIALS", "Невірний логін або пароль");
      const scoped = await repository.findActiveWithScope(account.id);
      if (!scoped?.cities.length) throw new IntegrationAccountError(403, "INTEGRATION_SCOPE_EMPTY", "Для облікового запису не налаштовано доступні міста");
      const accessToken = jwt.sign({ principalType: "integration", integrationAccountId: Number(account.id), userName: account.login, displayName: account.display_name }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "30m" });
      await repository.touchLogin(account.id);
      return { accessToken, accessTokenExpiration: 30 * 60 * 1000, account: {
        id: Number(account.id), login: account.login, display_name: account.display_name,
        can_process_requests: Boolean(account.can_process_requests), can_sync_statuses: Boolean(account.can_sync_statuses),
        city_ids: scoped.cities.map((city) => Number(city.city_id)),
      } };
    },

    async list() {
      return {
        accounts: mapList(await repository.list()),
        cities: (await repository.cityOptions()).map((city) => ({ id: Number(city.id), name: city.name, branch_id: Number(city.branch_id), branch_name: city.branch_name })),
      };
    },

    async save(id, payload, actorUserId) {
      const accountId = id === null ? null : Number(id);
      if (id !== null && (!Number.isInteger(accountId) || accountId < 1)) throw new IntegrationAccountError(422, "VALIDATION_ERROR", "Некоректний ID облікового запису");
      const login = text(payload?.login, "login", 100)?.toLowerCase();
      if (!/^[a-z0-9._@-]+$/i.test(login)) throw new IntegrationAccountError(422, "VALIDATION_ERROR", "Логін містить неприпустимі символи");
      const displayName = text(payload?.display_name, "Назва", 150);
      const issuedToName = text(payload?.issued_to_name, "Кому видано", 150, false);
      const canProcessRequests = flag(payload?.can_process_requests);
      const canSyncStatuses = flag(payload?.can_sync_statuses);
      if (!canProcessRequests && !canSyncStatuses) throw new IntegrationAccountError(422, "VALIDATION_ERROR", "Оберіть щонайменше одне право інтеграції");
      const cityIds = normalizeCityIds(payload?.city_ids);
      const allowedCities = new Set((await repository.cityOptions()).map((city) => Number(city.id)));
      if (cityIds.some((cityId) => !allowedCities.has(cityId))) throw new IntegrationAccountError(422, "VALIDATION_ERROR", "Вибрано неактивне або невідоме місто");
      let passwordHash = null;
      const password = String(payload?.password ?? "");
      if (!accountId || password) {
        if (password.length < 8 || password.length > 72) throw new IntegrationAccountError(422, "VALIDATION_ERROR", "Пароль має містити від 8 до 72 символів");
        passwordHash = await bcrypt.hash(password, 10);
      }
      try {
        const savedId = await repository.save({ id: accountId, login, passwordHash, displayName, issuedToName, isActive: flag(payload?.is_active), canProcessRequests, canSyncStatuses, cityIds, actorUserId: Number(actorUserId) });
        return { id: savedId };
      } catch (error) {
        if (error?.code === "ER_DUP_ENTRY") throw new IntegrationAccountError(409, "LOGIN_ALREADY_EXISTS", "Такий логін вже існує");
        if (error?.code === "NOT_FOUND") throw new IntegrationAccountError(404, "ACCOUNT_NOT_FOUND", "Обліковий запис не знайдено");
        throw error;
      }
    },
  };
}

export default createIntegrationAccountsService();
