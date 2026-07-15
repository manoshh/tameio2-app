import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import ScrollToTop from '@/components/ScrollToTop';
import { PasswordAuthProvider } from '@/lib/passwordAuth';
import Gate from '@/components/auth/Gate';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import PersonLedger from '@/pages/PersonLedger';
import BotanicosLedger from '@/pages/BotanicosLedger';
import MonthlyClose from '@/pages/MonthlyClose';
import Settlements from '@/pages/Settlements';
import BotanicosSettlements from '@/pages/BotanicosSettlements';
import SettingsPage from '@/pages/SettingsPage';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <PasswordAuthProvider>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route element={<Gate />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/ledger/person" element={<PersonLedger />} />
                <Route path="/ledger/botanicos" element={<BotanicosLedger />} />
                <Route path="/monthly-close" element={<MonthlyClose />} />
                <Route path="/settlements" element={<Settlements />} />
                <Route path="/botanicos-settlements" element={<BotanicosSettlements />} />
                <Route path="/settings" element={<SettingsPage />} />
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
