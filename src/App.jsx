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
import { settlements } from '@/api/client';

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
    let active = true;
    const check = async () => {
      try {
        let { draft } = await settlements.getCloseDraft();
        // Μία φορά migration για πρόχειρο που είχε αποθηκευτεί μόνο στον browser.
        const localDraft = JSON.parse(localStorage.getItem('tameio.pendingClose') || 'null');
        if (!draft && localDraft?.open) {
          await settlements.saveCloseDraft(localDraft);
          draft = localDraft;
        }
        localStorage.removeItem('tameio.pendingClose');
        if (active && draft?.open) navigate('/close', { replace: true });
      } catch {
        // Πιθανό 401 πριν ολοκληρωθεί το login· η επόμενη δοκιμή θα το βρει.
      }
    };
    check();
    const timer = window.setInterval(check, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [location.pathname, navigate]);
  return null;
}

export default App;
