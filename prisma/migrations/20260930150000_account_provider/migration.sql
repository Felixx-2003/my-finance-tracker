ALTER TABLE "Account" ADD COLUMN "provider" TEXT;

-- Preserve account IDs and transaction links while updating the original demo labels.
UPDATE "Account" SET "name" = 'Bank'
WHERE "name" = 'Maybank' AND NOT EXISTS (SELECT 1 FROM "Account" WHERE "name" = 'Bank');

UPDATE "Account" SET "name" = 'E-Wallet', "provider" = 'Touch ''n Go eWallet'
WHERE "name" = 'Touch n Go' AND NOT EXISTS (SELECT 1 FROM "Account" WHERE "name" = 'E-Wallet');

INSERT INTO "Account" ("name", "type", "openingBalance")
SELECT 'Debit Card', 'Debit Card', 0
WHERE NOT EXISTS (SELECT 1 FROM "Account" WHERE "name" = 'Debit Card');
