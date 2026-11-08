// A small helper for asking Gemini for JSON that matches a schema. Server-side only.
//
// Models: GEMINI_MODEL is tried first. If Google says it is overloaded (or the model is gone), each
// model in GEMINI_FALLBACK_MODELS (comma separated) is tried next. Set both in .env.local.

const MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  ...(process.env.GEMINI_FALLBACK_MODELS ?? '').split(',').map((m) => m.trim()),
].filter((m, i, all) => m && all.indexOf(m) === i);

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 2500];
// Problems with our own request or key: another model will not help.
const GIVE_UP_STATUSES = new Set([400, 401, 403]);

/** fetch, but tries again a couple of times when Google is briefly overloaded or the network blips. */
export async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= RETRY_DELAYS_MS.length;
    try {
      const res = await fetch(url, init);
      if (res.ok || last || !RETRY_STATUSES.has(res.status)) return res;
    } catch (e) {
      if (last) throw e;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
}

export async function generateJson<T>(
  instructions: string,
  text: string,
  schema: object,
  { temperature = 0.4 }: { temperature?: number } = {},
): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set (see .env.local).');

  let failure = 'No AI model is configured.';
  for (const model of MODELS) {
    let res: Response;
    try {
      res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature },
        }),
        cache: 'no-store',
      });
    } catch (e) {
      failure = `Could not reach the AI service (${model}): ${String(e)}`;
      continue;
    }

    if (!res.ok) {
      failure = `The AI service returned ${res.status} (${model}). ${(await res.text()).slice(0, 300)}`;
      if (GIVE_UP_STATUSES.has(res.status)) throw new Error(failure);
      continue;
    }

    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    try {
      return JSON.parse(raw) as T;
    } catch {
      failure = `The AI answer was not readable (${model}).`;
    }
  }
  throw new Error(failure);
}
