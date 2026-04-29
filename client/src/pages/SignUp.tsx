/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { SignUp as ClerkSignUp } from '@clerk/clerk-react';
import { useLocation, Link } from 'react-router-dom';
import { getProductConfig, ProductKey } from '../config/products';

// Product branding config for auth screens
const PRODUCT_BRANDING: Record<ProductKey, { icon: string; tagline: string; gradient: string }> = {
  contentcraft: {
    icon: '/icons/contentcraft-icon.png',
    tagline: 'Transform Your Ideas Into Compelling Content',
    gradient: 'from-blue-400 to-purple-500',
  },
  gamemastercraft: {
    icon: '/icons/gamemastercraft-icon.png',
    tagline: 'Epic Adventures Await Your Command',
    gradient: 'from-purple-400 to-pink-500',
  },
  sagacraft: {
    icon: '/icons/sagacraft-icon.png',
    tagline: 'Your Story, Perfectly Told',
    gradient: 'from-emerald-400 to-teal-500',
  },
};

const SignUp = () => {
  const location = useLocation();
  const product = getProductConfig();
  const branding = PRODUCT_BRANDING[product.key];
  
  // Get redirect URL from query params
  const searchParams = new URLSearchParams(location.search);
  const redirectUrl = searchParams.get('redirect_url') || '/';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-4">
      {/* Product branding */}
      <div className="text-center mb-8">
        <img 
          src={branding.icon} 
          alt={product.name}
          className="w-24 h-24 mx-auto mb-4 rounded-2xl shadow-lg"
        />
        <h1 className={`text-3xl font-bold bg-gradient-to-r ${branding.gradient} bg-clip-text text-transparent`}>
          {product.name}
        </h1>
        <p className="text-slate-400 mt-2">{branding.tagline}</p>
      </div>

      {/* Clerk SignUp component */}
      <div className="w-full max-w-md">
        <ClerkSignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          afterSignInUrl={redirectUrl}
          afterSignUpUrl={redirectUrl}
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'bg-slate-900 border border-slate-800 shadow-xl',
              headerTitle: 'text-slate-100',
              headerSubtitle: 'text-slate-400',
              socialButtonsBlockButton: 'border-slate-700 hover:bg-slate-800',
              socialButtonsBlockButtonText: 'text-slate-300',
              dividerLine: 'bg-slate-700',
              dividerText: 'text-slate-500',
              formFieldLabel: 'text-slate-300',
              formFieldInput: 'bg-slate-800 border-slate-700 text-slate-100',
              formButtonPrimary: 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700',
              footerActionText: 'text-slate-400',
              footerActionLink: 'text-blue-400 hover:text-blue-300',
            }
          }}
        />
      </div>

      {/* Back to home link */}
      <div className="mt-8 text-center">
        <Link 
          to="/" 
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          ← Back to home
        </Link>
      </div>

      {/* Footer links */}
      <div className="mt-8 flex gap-4 text-sm text-slate-500">
        <a href="https://www.sixsmithgames.com/pricing" className="hover:text-slate-300">
          View Plans →
        </a>
        <span>•</span>
        <a href="https://www.sixsmithgames.com" className="hover:text-slate-300">
          Sixsmith Games
        </a>
      </div>
    </div>
  );
};

export default SignUp;
