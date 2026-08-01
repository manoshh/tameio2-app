import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import PageNotFound from '@/lib/PageNotFound';
import ScrollToTop from '@/components/ScrollToTop';
import { PasswordAuthProvider } from '@/lib/passwordAuth';
import Gate from '@/components/auth/Gate';
import Layout from '@/components/Layout';
import Treasury from '@/pages/Treasury';
import Close from '@/pages/Close';
import ResetPassword from '@/pages/ResetPassword';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <PasswordAuthProvider>
        <Router>
          <PendingCloseRedirect />
          <ScrollToTop />
          <Routes>
            {/* Εκτός του Gate: ο χρήστης φτάνει εδώ ακριβώς επειδή δεν μπορεί
                να συνδεθεί. */}
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<Gate />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Treasury />} />
                <Route path="/close" element={<Close />} />
              </Route>
            </Route>
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
      </PasswordAuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

function PendingCloseRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.pathname === '/close' || location.pathname === '/reset-password') return;
    try {
      const pending = JSON.parse(localStorage.getItem('tameio.pendingClose') || 'null');
      if (pending?.open) navigate('/close', { replace: true });
    } catch {
      localStorage.removeItem('tameio.pendingClose');
    }
  }, [location.pathname, navigate]);
  return null;
}

export default App;
