import { parseBalanceWorkbookData } from "./balanceWorkbookParser";

export const loadData = async (fileName) => {
  try {
    const response = await fetch(`/Sorce/${fileName}`);
    if (!response.ok) {
      throw new Error("Failed to fetch file");
    }

    const buffer = await response.arrayBuffer();
    const { hierarchy } = parseBalanceWorkbookData(buffer);
    return hierarchy;
  } catch (error) {
    console.error("Error loading data:", error);
    return [];
  }
};
