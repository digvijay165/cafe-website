// Thin fetch wrapper. Every failure becomes an ApiError with a message that is safe to show as-is.
export class ApiError extends Error {
  constructor(message, { status = 0, fields = {}, code, data } = {}) {
    super(message);
    this.status = status;
    this.fields = fields || {};
    this.code = code;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('We could not reach the café. Check your internet connection and try again.');
  }
  if (response.status === 204) return null;
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const fallback = response.status >= 500 ? 'Something went wrong on our side. Please try again in a moment.' : 'That did not work. Please try again.';
    throw new ApiError(data?.error || fallback, { status: response.status, fields: data?.fields, code: data?.code, data });
  }
  return data;
}
