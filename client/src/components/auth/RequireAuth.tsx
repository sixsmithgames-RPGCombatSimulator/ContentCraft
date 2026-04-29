/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useAuth } from '@clerk/clerk-react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';

const RequireAuth = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    // Redirect to sign-in with current URL as redirect target
    const redirectUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?redirect_url=${redirectUrl}`} replace />;
  }

  return <Outlet />;
};

export default RequireAuth;
