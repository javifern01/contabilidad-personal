CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"type" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_kind_check" CHECK ("categories"."kind" IN ('expense','income','transfer'))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text,
	"dedup_key" text NOT NULL,
	"booking_date" date NOT NULL,
	"value_date" date,
	"amount_cents" bigint NOT NULL,
	"amount_eur_cents" bigint NOT NULL,
	"original_currency" text DEFAULT 'EUR' NOT NULL,
	"fx_rate" numeric(18, 8),
	"description_raw" text NOT NULL,
	"merchant_normalized" text,
	"counterparty_name" text,
	"category_id" uuid NOT NULL,
	"category_source" text DEFAULT 'manual' NOT NULL,
	"category_confidence" real,
	"status" text DEFAULT 'posted' NOT NULL,
	"transfer_pair_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"soft_deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_amount_cents_positive_check" CHECK ("transactions"."amount_cents" > 0),
	CONSTRAINT "transactions_amount_eur_cents_positive_check" CHECK ("transactions"."amount_eur_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_account_dedup_unique_idx" ON "transactions" USING btree ("account_id","dedup_key");--> statement-breakpoint
CREATE INDEX "transactions_booking_date_partial_idx" ON "transactions" USING btree ("booking_date" DESC NULLS LAST) WHERE "transactions"."soft_deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "transactions_account_booking_partial_idx" ON "transactions" USING btree ("account_id","booking_date" DESC NULLS LAST) WHERE "transactions"."soft_deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "transactions_category_booking_partial_idx" ON "transactions" USING btree ("category_id","booking_date" DESC NULLS LAST) WHERE "transactions"."soft_deleted_at" IS NULL;--> statement-breakpoint
-- Self-FK on transactions.transfer_pair_id (D-20). Hand-patched here because Drizzle's
-- self-referential FK requires deferred refs / relations() boilerplate at the schema layer.
-- Pattern mirrors Phase 1's INET hand-patch on auth_audit_log.ip. ON DELETE SET NULL so
-- deleting one half of a transfer pair doesn't cascade-delete the other.
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_transfer_pair_id_fkey"
  FOREIGN KEY ("transfer_pair_id")
  REFERENCES "transactions"("id")
  ON DELETE SET NULL;