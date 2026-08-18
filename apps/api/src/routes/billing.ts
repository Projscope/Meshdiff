import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type Stripe from "stripe";
import { getSupabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/requireAuth.js";
import { getStripe, getFrontendUrl } from "../lib/stripe.js";
import { getUserTier, getAccountAccess } from "../lib/subscription.js";
import { priceIdForTier, tierForPriceId } from "../lib/priceCatalog.js";

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

  const tier = tierForPriceId(item.price.id);
  if (!tier) {
    // Unknown price ID — refuse to write a row rather than guessing a
    // tier. Throwing surfaces as a 500 from the webhook handler, which
    // Stripe retries; that's the right behavior for a real
    // misconfiguration (e.g. a stale/test price ID leaking into prod).
    throw new Error(`Unrecognized Stripe price ${item.price.id} on subscription ${subscription.id} — not in the price catalog`);
  }

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: item.price.id,
      status: subscription.status,
      tier,
      quantity: item.quantity ?? 1,
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
      const access = await getAccountAccess(supabase, request.userId!);

      // Seat usage is only meaningful for the team's owner (teams.owner_user_id
      // is unique post-migration, so this is at most one team) — a team
      // member riding the owner's seats has no purchased/used figure of
      // their own to show.
      let seats: { purchased: number; used: number } | null = null;
      if (tier === "team" && row) {
        const { data: team } = await supabase
          .from("teams")
          .select("id")
          .eq("owner_user_id", request.userId)
          .maybeSingle();
        if (team) {
          const { count } = await supabase
            .from("team_members")
            .select("id", { count: "exact", head: true })
            .eq("team_id", team.id);
          seats = { purchased: row.quantity, used: count ?? 0 };
        }
      }

      return {
        success: true,
        data: {
          tier,
          status: row?.status ?? null,
          currentPeriodEnd: row?.current_period_end ?? null,
          cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
          accountStatus: access.status,
          seats,
        },
      };
    } catch (err) {
      app.log.error(err, "Failed to load subscription");
      reply.code(502);
      return { success: false, error: "Failed to load subscription" };
    }
  });

  // Coupons are applied via Stripe Promotion Codes (the customer-facing
  // "code" a user types), not raw coupon IDs — see billing/coupons below
  // for why: a coupon's `id` is an opaque token, its `name` isn't
  // guaranteed unique/lookup-able, but a promotion code's `code` field is
  // exactly the human-readable string we email to selected users (e.g.
  // "LAUNCH_503M" for the 50%-off-3-months group) and show in the UI (e.g.
  // "LAUNCH_501M" for everyone else). Returns null (not an error) when
  // `code` is undefined, so the STRIPE_DEFAULT_PROMO_CODE fallback in
  // /billing/checkout can silently no-op if that env var is unset.
  async function findActivePromotionCode(stripe: Stripe, code: string | undefined) {
    if (!code) return null;
    const list = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
    return list.data[0] ?? null;
  }

  app.post<{ Body: { tier?: "pro" | "team"; couponCode?: string } }>(
    "/billing/checkout",
    { preHandler: requireAuth },
    async (request, reply) => {
      const supabase = getSupabase();
      const stripe = getStripe();
      const tier = request.body?.tier === "team" ? "team" : "pro";
      const priceId = priceIdForTier(tier);
      if (!supabase || !stripe || !priceId) {
        reply.code(500);
        return { success: false, error: "Billing is not configured" };
      }

      try {
        const customerId = await getOrCreateStripeCustomer(supabase, stripe, request.userId!);
        const frontendUrl = getFrontendUrl();
        const { couponCode } = request.body ?? {};

        const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];

        if (couponCode) {
          // User (or the pre-selected 50%-off-3-months group) typed a code
          // — this must resolve, since silently ignoring a bad code the
          // user explicitly entered would be surprising.
          const promo = await findActivePromotionCode(stripe, couponCode);
          if (!promo) {
            reply.code(400);
            return { success: false, error: "Coupon is invalid or expired" };
          }
          discounts.push({ promotion_code: promo.id });
        } else {
          // No code entered — silently try the general-availability default
          // (see plan: everyone gets this pre-selected unless they have a
          // special code). Missing/expired default is not an error here,
          // just no discount.
          const defaultPromo = await findActivePromotionCode(stripe, process.env.STRIPE_DEFAULT_PROMO_CODE);
          if (defaultPromo) {
            discounts.push({ promotion_code: defaultPromo.id });
          }
        }

        // Team is per-seat — quantity is chosen on Stripe's own hosted
        // Checkout page via adjustable_quantity (no custom seat-picker UI
        // needed on our side). Default of 5 covers the owner plus a few
        // invites before anyone needs to touch it; adjustable right there
        // if 5 is wrong for a given customer.
        const lineItem: Stripe.Checkout.SessionCreateParams.LineItem =
          tier === "team"
            ? { price: priceId, quantity: 5, adjustable_quantity: { enabled: true, minimum: 1, maximum: 50 } }
            : { price: priceId, quantity: 1 };

        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: customerId,
          line_items: [lineItem],
          ...(discounts.length > 0 ? { discounts } : {}),
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
    },
  );

  // Only the general-availability code (STRIPE_DEFAULT_PROMO_CODE, e.g.
  // "LAUNCH_501M") is ever listed here — see plan: the 50%-off-3-months
  // code is hand-emailed to a pre-selected group and entered manually via
  // the couponCode field on /billing/checkout, never surfaced to everyone
  // else in this list.
  app.get("/billing/coupons", async (_, reply) => {
    const stripe = getStripe();
    if (!stripe) {
      reply.code(500);
      return { success: false, error: "Billing is not configured" };
    }

    try {
      const promo = await findActivePromotionCode(stripe, process.env.STRIPE_DEFAULT_PROMO_CODE);
      if (!promo) {
        return { success: true, data: [] };
      }
      // list() returns promotion.coupon as a bare ID, not expanded — fetch
      // the full coupon separately for its percent_off/duration.
      const couponRef = promo.promotion.coupon;
      const coupon =
        typeof couponRef === "string" ? await stripe.coupons.retrieve(couponRef) : couponRef;
      if (!coupon || !coupon.valid) {
        return { success: true, data: [] };
      }
      return {
        success: true,
        data: [
          {
            code: promo.code,
            percentOff: coupon.percent_off ?? null,
            amountOff: coupon.amount_off ?? null,
            durationMonths: coupon.duration === "repeating" ? coupon.duration_in_months : null,
          },
        ],
      };
    } catch (err) {
      app.log.error(err, "Failed to fetch coupons");
      reply.code(502);
      return { success: false, error: "Failed to load coupons" };
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

  // Shared by /cancel and /resume — both just flip cancel_at_period_end on
  // the same Stripe subscription and write the result straight back to our
  // own table, rather than waiting on the customer.subscription.updated
  // webhook to eventually catch up (it will too, redundantly — upserting
  // twice from the same subscription state is harmless).
  async function setCancelAtPeriodEnd(request: FastifyRequest, reply: FastifyReply, cancelAtPeriodEnd: boolean) {
    const supabase = getSupabase();
    const stripe = getStripe();
    if (!supabase || !stripe) {
      reply.code(500);
      return { success: false, error: "Billing is not configured" };
    }

    try {
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("user_id", request.userId)
        .maybeSingle();
      if (!existing) {
        reply.code(404);
        return { success: false, error: "No subscription to update" };
      }

      const subscription = await stripe.subscriptions.update(existing.stripe_subscription_id, {
        cancel_at_period_end: cancelAtPeriodEnd,
      });
      await upsertSubscriptionRow(supabase, request.userId!, subscription);

      return {
        success: true,
        data: {
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          currentPeriodEnd: new Date(subscription.items.data[0]!.current_period_end * 1000).toISOString(),
        },
      };
    } catch (err) {
      app.log.error(err, cancelAtPeriodEnd ? "Failed to cancel subscription" : "Failed to resume subscription");
      reply.code(502);
      return { success: false, error: "Failed to update subscription, please try again" };
    }
  }

  // Cancels at the end of the current billing period (not immediately) —
  // the user keeps Pro access through what they already paid for, matching
  // how the Stripe Portal's own cancel flow behaves.
  app.post("/billing/cancel", { preHandler: requireAuth }, (request, reply) => setCancelAtPeriodEnd(request, reply, true));

  // Undoes a pending cancel-at-period-end before the period actually ends.
  app.post("/billing/resume", { preHandler: requireAuth }, (request, reply) => setCancelAtPeriodEnd(request, reply, false));

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
        app.log.error("Webhook called but billing not configured");
        reply.code(500);
        return { success: false, error: "Billing is not configured" };
      }

      const signature = request.headers["stripe-signature"];
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(request.body as Buffer, signature as string, webhookSecret);
        app.log.info({ eventType: event.type }, "Stripe webhook received");
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
