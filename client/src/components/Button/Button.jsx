import { memo } from "react";
import style from "./button.module.scss";

export default memo(({ children, ...rest }) => (
  // <button {...rest} className={style.inputBox}>
  //   {children}
  // </button>
  <div className={style.inputBox}>
    <input {...rest} value={children} />
  </div>

));
