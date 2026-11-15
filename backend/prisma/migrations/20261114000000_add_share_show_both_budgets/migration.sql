-- Share.showBothBudgets: when true, both members' categories and budgets are
-- visible to both (reads only; writes still go to budgetOwnerUserId).
-- Additive with a default, so existing rows keep today's single-owner behaviour.
ALTER TABLE "Share" ADD COLUMN "showBothBudgets" BOOLEAN NOT NULL DEFAULT false;
