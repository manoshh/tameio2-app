import { useLocation, useNavigate } from 'react-router-dom';

export default function PageNotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageName = location.pathname.substring(1);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-stone-50">
      <div className="max-w-md w-full">
        <div className="text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-7xl font-light text-stone-300">404</h1>
            <div className="h-0.5 w-16 bg-stone-200 mx-auto"></div>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-medium text-stone-800">Η σελίδα δεν βρέθηκε</h2>
            <p className="text-stone-600 leading-relaxed">
              Η σελίδα <span className="font-medium text-stone-700">&quot;{pageName}&quot;</span> δεν υπάρχει.
            </p>
          </div>

          <div className="pt-6">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 hover:border-stone-300 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-600"
            >
              Επιστροφή στην αρχική
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
