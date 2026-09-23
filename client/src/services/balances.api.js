import { createAuthenticatedApi } from "./createAuthenticatedApi";

const api = createAuthenticatedApi("/balances");

export async function fetchBalanceFile(slug) {
  const response = await api.get(`/${slug}/file`, {
    responseType: "arraybuffer",
  });

  return response.data;
}

export async function downloadBalancePdf(slug) {
  let response;
  try {
    response = await api.get(`/${slug}/pdf`, { responseType: "blob" });
  } catch (error) {
    if (error?.response?.data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await error.response.data.text());
      } catch {
        // Keep the original response when it is not a JSON error payload.
      }
    }
    throw error;
  }
  const contentDisposition = String(response.headers["content-disposition"] || "");
  const encodedName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let fileName = `zalyshky-${slug}.pdf`;
  if (encodedName) {
    try {
      fileName = decodeURIComponent(encodedName);
    } catch {
      // Use the safe fallback name.
    }
  }

  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}
