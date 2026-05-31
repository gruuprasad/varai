import Stripe from "stripe";

export async function POST(request: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const signature = request.headers.get("stripe-signature");
  return Response.json({ ok: true, webhook: Boolean(signature) });
}
