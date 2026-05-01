/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { updateProductSEO } from './utils/seo'
import { isLocalMode } from './utils/localMode'

const clerkPublishableKey = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!isLocalMode() && !clerkPublishableKey) {
  throw new Error("Missing VITE_PUBLIC_CLERK_PUBLISHABLE_KEY");
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const appTree = (
  <ThemeProvider>
    <App />
  </ThemeProvider>
);

createRoot(rootElement).render(
  <StrictMode>
    {isLocalMode() ? (
      appTree
    ) : (
      <ClerkProvider publishableKey={clerkPublishableKey!}>
        {appTree}
      </ClerkProvider>
    )}
  </StrictMode>,
)

// Update SEO metadata based on product configuration after DOM is ready
updateProductSEO()
