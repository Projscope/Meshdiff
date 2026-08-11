import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { getSupabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/requireAuth.js";
import { getStripe, getFrontendUrl } from "../lib/stripe.js";
import { getUserTier } from "../lib/subscription.js";

async function getOrCreateStripeCustomer(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  stripe: Stripe,
  userId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing.stripe_customer_id;

  const { data: userResult } = await supabase.auth.admin.getUserById(userId);
  const customer = await stripe.customers.create({
    email: userResult?.user?.email ?? undefined,
    metadata: { supabase_user_id: userId },
  });

  const { error } = await supabase
    .from("stripe_customers")
    .insert({ user_id: userId, stripe_customer_id: customer.id });
  if (error) throw error;

  return customer.id;
}

// Upserts the subscriptions row from a Stripe Subscription object — shared
// by checkout.session.completed (first subscribe) and
// customer.subscription.updated (every later change), so both paths stay
// in exact agreement about what a row looks like.
async function upsertSubscriptionRow(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const item = subscription.items.data[0];
  if (!item) throw new Error(`Stripe subscription ${subscription.id} has no items`);

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: item.price.id,
      status: subscription.status,
      tier: "pro",
      current_period_start: new Date(item.current_period_start * 1000).toISOString(),
      current_period_end: new Date(item.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export default async function billingRoute(app: FastifyInstance): Promise<void> {
  app.get("/billing/subscription", { preHandler: requireAuth }, async (request, reply) => {
    const supabase = getSupabase();
    if (!supabase) {
      reply.code(500);
      return { success: false, error: "Billing is not configured" };
    }

    try {
      const { tier, row } = await getUserTier(supabase, request.userId!);
      return {
        success: true,
        data: {
          tier,
          status: row?.status ?? null,
          currentPeriodEnd: row?.current_period_end ?? null,
          cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
        },
      };
    } catch (err) {
      app.log.error(err, "Failed to load subscription");
      reply.code(502);
      return { success: false, error: "Failed to load subscription" };
    }
  });

  app.post("/billing/checkout", { preHandler: requireAuth }, async (request, reply) => {
    const supabase = getSupabase();
    const stripe = getStripe();
    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!supabase || !stripe || !priceId) {
      reply.code(500);
      return { success: false, error: "Billing is not configured" };
    }

    try {
      const customerId = await getOrCreateStripeCustomer(supabase, stripe, request.userId!);
      const frontendUrl = getFrontendUrl();
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${frontendUrl}/projects?checkout=success`,
        cancel_url: `${frontendUrl}/projects?checkout=cancelled`,
      });

      if (!session.url) {
        reply.code(502);
        return { success: false, error: "Failed to start checkout, please try again" };
      }
      return { success: true, data: { url: session.url } };
    } catch (err) {
      app.log.error(err, "Failed to create checkout session");
      reply.code(502);
      return { success: false, error: "Failed to start checkout, please try again" };
    }
  });

  app.post("/billing/portal", { preHandler: requireAuth }, async (request, reply) => {
    const supabase = getSupabase();
    const stripe = getStripe();
    if (!supabase || !stripe) {
      reply.code(500);
      return { success: false, error: "Billing is not configured" };
    }

    try {
      const { data: customer } = await supabase
        .from("stripe_customers")
        .select("stripe_customer_id")
        .eq("user_id", request.userId)
        .maybeSingle();
      if (!customer) {
        reply.code(404);
        return { success: false, error: "No billing account yet" };
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: customer.stripe_customer_id,
        return_url: `${getFrontendUrl()}/projects`,
      });
      return { success: true, data: { url: session.url } };
    } catch (err) {
      app.log.error(err, "Failed to create billing portal session");
      reply.code(502);
      return { success: false, error: "Failed to open billing portal, please try again" };
    }
  });

  // Stripe calls this directly (no bearer token) — authenticity comes from
  // the signature check below, not requireAuth. Registered in its own
  // encapsulated scope so only this route's content-type parser is
  // replaced with a raw-buffer one; every other route keeps Fastify's
  // normal JSON parsing untouched. Signature verification needs the exact
  // raw bytes Stripe signed — a body that's already been JSON-parsed and
  // re-serialized won't match.
  app.register(async (scoped) => {
    scoped.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });

    scoped.post("/billing/webhook", async (request, reply) => {
      const stripe = getStripe();
      const supabase = getSupabase();
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!stripe || !supabase || !webhookSecret) {
        reply.code(500);
        return { success: false, error: "Billing is not configured" };
      }

      const signature = request.headers["stripe-signature"];
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(request.body as Buffer, signature as string, webhookSecret);
      } catch (err) {
        app.log.warn(err, "Stripe webhook signature verification failed");
        reply.code(400);
        return { success: false, error: "Invalid signature" };
      }

      try {
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            if (session.mode === "subscription" && session.subscription && session.customer) {
              const { data: customerRow } = await supabase
                .from("stripe_customers")
                .select("user_id")
                .eq("stripe_customer_id", session.customer as string)
                .maybeSingle();
              if (customerRow) {
                const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
                await upsertSubscriptionRow(supabase, customerRow.user_id, subscription);
              } else {
                app.log.warn({ customer: session.customer }, "No stripe_customers row for completed checkout");
              }
            }
            break;
          }
          case "customer.subscription.updated": {
            const subscription = event.data.object as Stripe.Subscription;
            const { data: customerRow } = await supabase
              .from("stripe_customers")
              .select("user_id")
              .eq("stripe_customer_id", subscription.customer as string)
              .maybeSingle();
            if (customerRow) {
              await upsertSubscriptionRow(supabase, customerRow.user_id, subscription);
            }
            break;
          }
          case "customer.subscription.deleted": {
            const subscription = event.data.object as Stripe.Subscription;
            const { error } = await supabase
              .from("subscriptions")
              .update({ status: "canceled", updated_at: new Date().toISOString() })
              .eq("stripe_subscription_id", subscription.id);
            if (error) throw error;
            break;
          }
          default:
            break; // unhandled event types are a no-op, not an error
        }
        return { success: true, data: true };
      } catch (err) {
        app.log.error(err, "Failed to process Stripe webhook event");
        reply.code(500);
        return { success: false, error: "Failed to process webhook" };
      }
    });
  });
}
