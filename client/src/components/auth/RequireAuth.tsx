/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { setApiAuthToken, setApiAuthTokenProvider } from '../../services/api';
import { isLocalMode } from '../../utils/localMode';

function LocalAuthOutlet() {
  useEffect(() => {
    setApiAuthToken(null);
    setApiAuthTokenProvider(null);
  }, []);

  return <Outlet />;
}

function ClerkAuthOutlet() {
  const location = useLocation();
  const [tokenReady, setTokenReady] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (!isLoaded) {
      setTokenReady(false);
      setTokenError(null);
      return;
    }
    if (!isSignedIn) {
      setApiAuthToken(null);
      setApiAuthTokenProvider(null);
      setTokenReady(true);
      setTokenError(null);
      return;
    }

    let active = true;
    setTokenReady(false);
    setTokenError(null);
    setApiAuthTokenProvider(getToken);
    getToken()
      .then((token) => {
        if (!active) return;
        if (!token) {
          setApiAuthToken(null);
          setApiAuthTokenProvider(null);
          setTokenError('Clerk loaded the signed-in session, but no API token was returned.');
          setTokenReady(true);
          return;
        }
        setApiAuthToken(token);
        setTokenReady(true);
      })
      .catch((error) => {
        if (!active) return;
        console.error('[RequireAuth] Failed to load Clerk token:', error);
        setApiAuthToken(null);
        setApiAuthTokenProvider(null);
        setTokenError('Failed to load the Clerk API token for this session.');
        setTokenReady(true);
      });

    return () => {
      active = false;
      setApiAuthTokenProvider(null);
    };
  }, [getToken, isLoaded, isSignedIn]);

  if (!isLoaded || (isSignedIn && !tokenReady)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (isSignedIn && tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="max-w-md rounded-lg border border-red-800 bg-red-950/40 p-6 text-center">
          <h1 className="text-lg font-semibold text-red-100">Authentication token unavailable</h1>
          <p className="mt-2 text-sm text-red-200">{tokenError}</p>
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
}

const RequireAuth = () => {
  if (isLocalMode()) {
    return <LocalAuthOutlet />;
  }

  return <ClerkAuthOutlet />;
};

export default RequireAuth;
