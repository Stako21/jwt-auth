import React, { createContext, useContext } from 'react';
import { useSnackbar } from 'notistack';

const SnackbarContext = createContext(null);

export const SnackbarProvider = ({ children }) => {
  const snackbar = useSnackbar();
  return (
    <SnackbarContext.Provider value={snackbar}>
      {children}
    </SnackbarContext.Provider>
  );
};

export const useSnackbarContext = () => {
  return useContext(SnackbarContext);
};
