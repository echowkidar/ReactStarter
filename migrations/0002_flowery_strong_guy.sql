CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_type" text NOT NULL,
	"issuing_authority" text NOT NULL,
	"subject" text NOT NULL,
	"ref_no" text NOT NULL,
	"date" text NOT NULL,
	"image_url" text NOT NULL,
	"department_id" integer NOT NULL,
	"department_name" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "department_names" ALTER COLUMN "id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "salary_asstt" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pay_level" text DEFAULT 'L-1' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "is_active" text DEFAULT 'active' NOT NULL;