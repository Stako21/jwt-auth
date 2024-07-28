import { memo } from "react";
import style from "./select.module.scss";
import cn from "classnames"

export default memo(({ options = [], ...rest }) => (
  <div className={cn ("select is-fullwidth", style.select)}>
    <select {...rest}>
      {options.map(({ id, title }) => (
        <option key={id} value={id}>
          {title}
        </option>
      ))}
    </select>
  </div>
));
