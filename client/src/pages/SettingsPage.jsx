import { Navigate, Route, Routes } from "react-router-dom";
import { WarehouseSettings } from "../components/Configuration/WarehouseSettings";

export default function SettingsPage() {
  return (
    <Routes>
      <Route path="warehouses" element={<WarehouseSettings />} />
      <Route path="*" element={<Navigate to="warehouses" replace />} />
    </Routes>
  );
}
