import { getProductConfig } from '../config/products';

/**
 * Updates the document title and meta tags based on the current product configuration
 */
export function updateProductSEO(): void {
  const product = getProductConfig();
  
  // Update document title
  document.title = product.seoTitle;
  
  // Update or create meta description
  let metaDescription = document.querySelector('meta[name="description"]') as HTMLMetaElement;
  if (!metaDescription) {
    metaDescription = document.createElement('meta');
    metaDescription.name = 'description';
    document.head.appendChild(metaDescription);
  }
  metaDescription.content = product.seoDescription;
  
  // Update or create og:title
  let ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement;
  if (!ogTitle) {
    ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    document.head.appendChild(ogTitle);
  }
  ogTitle.content = product.seoTitle;
  
  // Update or create og:description
  let ogDescription = document.querySelector('meta[property="og:description"]') as HTMLMetaElement;
  if (!ogDescription) {
    ogDescription = document.createElement('meta');
    ogDescription.setAttribute('property', 'og:description');
    document.head.appendChild(ogDescription);
  }
  ogDescription.content = product.seoDescription;
  
  // Update or create og:url
  let ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement;
  if (!ogUrl) {
    ogUrl = document.createElement('meta');
    ogUrl.setAttribute('property', 'og:url');
    document.head.appendChild(ogUrl);
  }
  ogUrl.content = product.appUrl;
  
  // Update or create twitter:title
  let twitterTitle = document.querySelector('meta[name="twitter:title"]') as HTMLMetaElement;
  if (!twitterTitle) {
    twitterTitle = document.createElement('meta');
    twitterTitle.name = 'twitter:title';
    document.head.appendChild(twitterTitle);
  }
  twitterTitle.content = product.seoTitle;
  
  // Update or create twitter:description
  let twitterDescription = document.querySelector('meta[name="twitter:description"]') as HTMLMetaElement;
  if (!twitterDescription) {
    twitterDescription = document.createElement('meta');
    twitterDescription.name = 'twitter:description';
    document.head.appendChild(twitterDescription);
  }
  twitterDescription.content = product.seoDescription;
}
