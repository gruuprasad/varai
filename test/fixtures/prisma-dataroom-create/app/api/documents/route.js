// Negative path: exposes a documents API with no Prisma call.
// UI may invoke this; Varai must not invent a Document resource effect.
export async function POST() {
  return Response.json({ ok: true });
}
