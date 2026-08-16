-- Lets the admin dashboard break share_stats down by who created the
-- share: the anonymous public Live Diff tool (POST /share, tier_at_share
-- stays null — "community"), or a signed-in project comparison share
-- (POST /comparison-share, tier_at_share is the sharer's subscription tier
-- *at the moment they shared*, not a live join against subscriptions —
-- so a later upgrade/downgrade doesn't silently rewrite historical counts).
alter table share_stats add column if not exists tier_at_share text check (tier_at_share in ('free', 'pro'));

notify pgrst, 'reload schema';
