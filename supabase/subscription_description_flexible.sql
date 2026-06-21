-- Special subscriptions: optional member-facing description + flexible (pay-what-you-want) amount.
-- description: shown on the member's subscription card (what the contribution is for).
-- flexible_amount: when true, members may enter any amount; no mismatch warning is shown.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS flexible_amount BOOLEAN DEFAULT false;
