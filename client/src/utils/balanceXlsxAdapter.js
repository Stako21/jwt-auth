import { read, utils } from "xlsx";

export const balanceXlsxAdapter = {
  read,
  utils: {
    decode_range: utils.decode_range,
    encode_col: utils.encode_col,
    sheet_to_json: utils.sheet_to_json,
  },
};
