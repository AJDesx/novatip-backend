-- DropIndex
-- Creator.walletAddress and Creator.slug are both @unique, which Postgres
-- already backs with a unique btree index (Creator_walletAddress_key,
-- Creator_slug_key). The plain indexes below duplicated those exactly,
-- costing a second index write on every sign-in and slug claim for a lookup
-- that was already served off the unique index. Same reasoning as the
-- WebhookDelivery_webhookId_idx drop in 20260909000000_webhook_delivery_history_index.
DROP INDEX "Creator_walletAddress_idx";

-- DropIndex
DROP INDEX "Creator_slug_idx";
