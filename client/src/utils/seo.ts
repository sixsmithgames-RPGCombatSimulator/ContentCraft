import type { ProductConfig } from '../config/products';
import { getProductConfig } from '../config/products';

interface ProductSeo {
  title: string;
  description: string;
  url: string;
}

/**
 * Keep SagaCraft's identity private until Clerk verifies the owner.
 *
 * Other ContentCraft-family products remain publicly discoverable and retain
 * their normal search metadata.
 */
export function resolveProductSEO(
  product: ProductConfig,
  allowPrivateProductName = false,
): ProductSeo {
  if (product.key === 'sagacraft' && !allowPrivateProductName) {
    return {
      title: 'Private workspace | Sixsmith Games',
      description: 'This private workspace is not publicly available.',
      url: 'https://sixsmithgames.com',
    };
  }

  return {
    title: product.seoTitle,
    description: product.seoDescription,
    url: product.appUrl,
  };
}

/**
 * Updates the document title and meta tags based on the current product configuration
 */
export function updateProductSEO(allowPrivateProductName = false): void {
  const product = getProductConfig();
  const seo = resolveProductSEO(product, allowPrivateProductName);
  
  // Update document title
  document.title = seo.title;
  
  // Update or create meta description
  let metaDescription = document.querySelector('meta[name="description"]') as HTMLMetaElement;
  if (!metaDescription) {
    metaDescription = document.createElement('meta');
    metaDescription.name = 'description';
    document.head.appendChild(metaDescription);
  }
  metaDescription.content = seo.description;
  
  // Update or create og:title
  let ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement;
  if (!ogTitle) {
    ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    document.head.appendChild(ogTitle);
  }
  ogTitle.content = seo.title;
  
  // Update or create og:description
  let ogDescription = document.querySelector('meta[property="og:description"]') as HTMLMetaElement;
  if (!ogDescription) {
    ogDescription = document.createElement('meta');
    ogDescription.setAttribute('property', 'og:description');
    document.head.appendChild(ogDescription);
  }
  ogDescription.content = seo.description;
  
  // Update or create og:url
  let ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement;
  if (!ogUrl) {
    ogUrl = document.createElement('meta');
    ogUrl.setAttribute('property', 'og:url');
    document.head.appendChild(ogUrl);
  }
  ogUrl.content = seo.url;
  
  // Update or create twitter:title
  let twitterTitle = document.querySelector('meta[name="twitter:title"]') as HTMLMetaElement;
  if (!twitterTitle) {
    twitterTitle = document.createElement('meta');
    twitterTitle.name = 'twitter:title';
    document.head.appendChild(twitterTitle);
  }
  twitterTitle.content = seo.title;
  
  // Update or create twitter:description
  let twitterDescription = document.querySelector('meta[name="twitter:description"]') as HTMLMetaElement;
  if (!twitterDescription) {
    twitterDescription = document.createElement('meta');
    twitterDescription.name = 'twitter:description';
    document.head.appendChild(twitterDescription);
  }
  twitterDescription.content = seo.description;
}
