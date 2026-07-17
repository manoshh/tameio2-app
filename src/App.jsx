import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
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

export default App;
