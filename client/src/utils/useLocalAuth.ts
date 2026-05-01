/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useAuth } from '@clerk/clerk-react';
import { isLocalMode } from './localMode';

type AppAuthResult = {
  isLoaded: boolean;
  isSignedIn: boolean | null | undefined;
  getToken: () => Promise<string | null>;
};

const LOCAL_STUB: AppAuthResult = {
  isLoaded: true,
  isSignedIn: true,
  getToken: async () => null,
};

/**
 * Auth hook that bypasses Clerk entirely in local mode.
 * In local mode, ClerkProvider is not rendered so useAuth() cannot be called.
 * This hook always calls useAuth() at the module level but the entire module
 * is replaced with a no-op stub at build time when LOCAL_MODE=true.
 */
export function useAppAuth(): AppAuthResult {
  if (isLocalMode()) {
    return LOCAL_STUB;
  }
  const { isLoaded, isSignedIn, getToken } = useAuth();
  return { isLoaded, isSignedIn, getToken };
}
