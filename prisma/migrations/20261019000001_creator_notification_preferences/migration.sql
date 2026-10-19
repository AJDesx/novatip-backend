-- AlterTable
-- Channel switches behind the notification-preferences card. Default true:
-- the columns are backfilled as "on" for every existing creator, so the
-- migration turns nothing off — a creator opts out, nothing opts out for
-- them.
ALTER TABLE "Creator" ADD COLUMN "emailEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Creator" ADD COLUMN "webhookEnabled" BOOLEAN NOT NULL DEFAULT true;
