import { CheckoutButton } from "../../components/CheckoutButton";

export default function PricingPage() {
  return (
    <main>
      <h1>Paid workspaces</h1>
      <p>Upgrade with Stripe Checkout.</p>
      <CheckoutButton />
    </main>
  );
}
