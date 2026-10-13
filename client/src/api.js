export async function api(path, body, method = 'POST') {
  let response;
  try {
    response = await fetch(`/api/${path}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { method, body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error('The server is unavailable. Please try again in a moment.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The server is temporarily unavailable. Please retry. If you are using a shared link, ask the host to restart it.');
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The server returned an incomplete response. Please retry.'); }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('auth/')) globalThis.dispatchEvent?.(new Event('haven:unauthorized'));
    throw new Error(result.message || 'Unable to complete this request.');
  }
  return result;
}
