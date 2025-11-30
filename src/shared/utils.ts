/**
 * Generates a unique ID for routes.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Normalizes headers to lowercase keys.
 */
export function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value
  }
  return normalized
}

/**
 * Converts Headers object to plain object.
 */
export function headersToObject(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {}
  headers.forEach((value, key) => {
    obj[key.toLowerCase()] = value
  })
  return obj
}

/**
 * Checks if request headers match the required headers.
 * Request must contain all required headers (case-insensitive).
 */
export function headersMatch(requestHeaders: Record<string, string>, requiredHeaders: Record<string, string>): boolean {
  const normalizedRequest = normalizeHeaders(requestHeaders)
  const normalizedRequired = normalizeHeaders(requiredHeaders)

  for (const [key, value] of Object.entries(normalizedRequired)) {
    if (normalizedRequest[key] !== value) {
      return false
    }
  }
  return true
}

/**
 * Waits for a promise with a timeout.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ])
}

/**
 * Reads request body as text or ArrayBuffer.
 */
export async function readRequestBody(request: Request): Promise<string | ArrayBuffer | null> {
  // Some browsers (Firefox) may report `request.body` as null even when a body exists.
  // Always operate on a cloned request to avoid locking the original stream.
  const req = request.clone()

  const contentType = req.headers.get('content-type') || ''

  try {
    // Binary content types
    if (
      contentType.includes('application/octet-stream') ||
      contentType.includes('image/') ||
      contentType.includes('audio/') ||
      contentType.includes('video/') ||
      contentType.includes('application/pdf')
    ) {
      return await req.arrayBuffer()
    }

    // JSON explicitly as text (we don't parse here to keep body as-is)
    if (contentType.includes('application/json')) {
      return await req.text()
    }

    // Form data
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return await req.text()
    }

    // Default: try text, fall back to ArrayBuffer
    const text = await req.text()
    // If empty string but content-length indicates data, try arrayBuffer
    if (text === '') {
      const cl = req.headers.get('content-length')
      if (cl && parseInt(cl, 10) > 0) {
        return await req.arrayBuffer()
      }
    }
    return text
  } catch {
    // As a last resort, try arrayBuffer; if that fails, return null
    try {
      return await req.arrayBuffer()
    } catch {
      return null
    }
  }
}
