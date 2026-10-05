export const MARKETING_SITE_URL = 'https://proinspect.systems/';

export function shouldRedirectWorkersDevRoot(requestUrl: string, method: string, path: string): boolean {
  if (!['GET', 'HEAD'].includes(method.toUpperCase()) || path !== '/') return false;
  const hostname = new URL(requestUrl).hostname.toLowerCase();
  return hostname === 'workers.dev' || hostname.endsWith('.workers.dev');
}
