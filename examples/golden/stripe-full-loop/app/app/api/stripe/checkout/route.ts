import Stripe from "stripe";

export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return Response.json({ ok: true, provider: "stripe" });
}
