import { memo } from "react";
import style from "./select.module.scss";
import cn from "classnames"

export default memo(({ options = [], ...rest }) => (
  <div className={style.inputBox}>
  <select {...rest}>
      {options.map(({ id, title }) => (
        <option key={id} value={id}>
          {title}
        </option>
      ))}
    </select>
  </div>
));
