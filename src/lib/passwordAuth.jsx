import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth } from '@/api/client';

// Ο έλεγχος του κωδικού γίνεται εξ ολοκλήρου στον server (bcrypt) και το session
// είναι httpOnly cookie. Ο client δεν βλέπει ποτέ hash ούτε κωδικό.
const AuthContext = createContext(null);

export function PasswordAuthProvider({ children }) {
  const [state, setState] = useState({ initialized: false, authed: false, canReset: false, recoveryEmail: '' });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const status = await auth.status();
    setState(status);
    return status;
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => setState({ initialized: false, authed: false, canReset: false, recoveryEmail: '' }))
      .finally(() => setLoading(false));
  }, [refresh]);

  const setup = useCallback(async (password, recoveryEmail) => {
    await auth.setup(password, recoveryEmail);
    setState({ initialized: true, authed: true });
  }, []);

  const login = useCallback(async (password) => {
    await auth.login(password);
    setState((prev) => ({ ...prev, authed: true }));
  }, []);

  const logout = useCallback(async () => {
    await auth.logout().catch(() => {});
    setState((prev) => ({ ...prev, authed: false }));
  }, []);

  const updatePassword = useCallback(async (currentPassword, password, recoveryEmail) => {
    await auth.updatePassword(currentPassword, password, recoveryEmail);
    setState((prev) => ({ ...prev, recoveryEmail: recoveryEmail ?? prev.recoveryEmail }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authed: state.authed,
        initialized: state.initialized,
        canReset: state.canReset ?? false,
        recoveryEmail: state.recoveryEmail ?? '',
        loading,
        setup,
        login,
        logout,
        refresh,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function usePasswordAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('usePasswordAuth must be used within a PasswordAuthProvider');
  return context;
}
