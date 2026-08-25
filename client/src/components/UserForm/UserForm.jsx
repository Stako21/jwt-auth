import { ROLE_OPTIONS } from "../../utils/roles";
import FormSelect from "../FormControl/FormSelect.jsx";

<FormSelect
  name="role"
  value={form.role ?? ROLE_OPTIONS[0].value}
  onChange={(e) => setForm({ ...form, role: Number(e.target.value) })}
>
  {ROLE_OPTIONS.map((opt) => (
    <option key={opt.value} value={opt.value}>
      {opt.label}
    </option>
  ))}
</FormSelect>

// При отправке: убедитесь, что тело содержит role: Number(form.role)
