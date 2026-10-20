-- CreateTable
-- A slug released by its previous owner, held for CREATOR_SLUG_HOLD_DAYS
-- (default 90 days) so old links/QR codes pointing at it can't be claimed by
-- whoever comes next. One row per slug: a later release upserts, restarting
-- the hold window.
CREATE TABLE "ReleasedSlug" (
    "slug" TEXT NOT NULL,
    "previousOwnerId" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleasedSlug_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
-- Postgres does not index foreign keys; the FK back to Creator would otherwise
-- force a scan on any per-owner query or cascade delete.
CREATE INDEX "ReleasedSlug_previousOwnerId_idx" ON "ReleasedSlug"("previousOwnerId");

-- AddForeignKey
ALTER TABLE "ReleasedSlug" ADD CONSTRAINT "ReleasedSlug_previousOwnerId_fkey" FOREIGN KEY ("previousOwnerId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
