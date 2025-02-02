import { memo } from "react";
import style from "./button.module.scss";

export default memo(({ children, ...rest }) => (
  <div className={style.inputBox}>
    <input {...rest} value={children} />
  </div>
));
