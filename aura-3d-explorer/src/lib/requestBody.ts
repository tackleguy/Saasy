/** Bound memory use before parsing untrusted JSON, including chunked requests. */
export async function readJsonObject(request: Request, limit: number): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new RequestBodyError('Send a JSON request.', 415);
  }
  const declared = Number(request.headers.get('content-length'));
  if (declared > limit) throw new RequestBodyError('The request is too large. Use a smaller file or message.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError('The request is empty.', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestBodyError('The request is too large. Use a smaller file or message.', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); }
  catch { throw new RequestBodyError('The request contains invalid JSON. Check the file and try again.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestBodyError('Send a JSON object.', 400);
  return body as Record<string, unknown>;
}

export class RequestBodyError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
