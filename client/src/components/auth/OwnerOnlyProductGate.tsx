/**
 * Browser-side companion to the SagaCraft server guard.
 *
 * This prevents the private application shell from rendering for another Clerk
 * account. The API repeats the same rule with server-verified identity because
 * a browser check alone is never an authorization boundary.
 */

import { useUser } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';

import { getProductConfig } from '../../config/products';
import { isLocalMode } from '../../utils/localMode';
import { updateProductSEO } from '../../utils/seo';

const SAGACRAFT_OWNER_EMAIL = 'sexsmith2005@gmail.com';

function isOwnerEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === SAGACRAFT_OWNER_EMAIL;
}

function ClerkOwnerGate() {
  const { isLoaded, user } = useUser();
  const primaryEmail = user?.primaryEmailAddress;
  const verifiedOwner =
    primaryEmail?.verification.status === 'verified'
    && isOwnerEmail(primaryEmail.emailAddress);

  useEffect(() => {
    /*
     * SagaCraft metadata starts neutral so an anonymous visitor cannot learn
     * the private product name. Restore the product title only after Clerk has
     * proved the owner identity.
     */
    updateProductSEO(verifiedOwner);
  }, [verifiedOwner]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
        <p>Checking access...</p>
      </div>
    );
  }

  if (!verifiedOwner) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-white">Page not found</h1>
          <p className="mt-3 text-slate-400">
            This page is not available for this account.
          </p>
          <a
            className="mt-6 inline-flex min-h-11 items-center rounded-full border border-slate-700 px-5 font-semibold text-slate-200"
            href="https://sixsmithgames.com"
          >
            Return to Sixsmith Games
          </a>
        </div>
      </main>
    );
  }

  return <Outlet />;
}

export default function OwnerOnlyProductGate() {
  const product = getProductConfig();

  if (product.key !== 'sagacraft' || isLocalMode()) {
    return <Outlet />;
  }

  return <ClerkOwnerGate />;
}
