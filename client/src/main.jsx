import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AuthProvider from "./context/AuthContext.jsx";
import "bulma/css/bulma.min.css";
import "./styles/bulma-dark-override.css";
import "./main.scss";
import { SnackbarProvider } from "notistack";

ReactDOM.createRoot(document.getElementById("root")).render(
  <SnackbarProvider maxSnack={3}>
    <AuthProvider>
      <App />
    </AuthProvider>
  </SnackbarProvider>
);
