import { memo } from "react";
import FormSelect from "../FormControl/FormSelect.jsx";

export default memo(({ options = [], ...rest }) => (
  <FormSelect {...rest}>
      {options.map(({ id, title }) => (
        <option key={id} value={id}>
          {title}
        </option>
      ))}
  </FormSelect>
));
