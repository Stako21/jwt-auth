import { createAuthenticatedApi } from "./createAuthenticatedApi";

const api = createAuthenticatedApi("/balances");

export async function fetchBalanceFile(slug) {
  const response = await api.get(`/${slug}/file`, {
    responseType: "arraybuffer",
  });

  return response.data;
}
