CREATE TABLE "attendance_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"days" integer NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text NOT NULL,
	"periods" text NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "attendance_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"receipt_no" serial NOT NULL,
	"receipt_date" timestamp,
	"transaction_id" text,
	"despatch_no" text,
	"despatch_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"file_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_names" (
	"id" serial PRIMARY KEY NOT NULL,
	"dept_code" text NOT NULL,
	"dept_name" text NOT NULL,
	"d_ast" text,
	CONSTRAINT "department_names_dept_code_unique" UNIQUE("dept_code")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hod_title" text NOT NULL,
	"hod_name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"epid" text NOT NULL,
	"name" text NOT NULL,
	"pan_number" text NOT NULL,
	"bank_account" text NOT NULL,
	"bank_name" text DEFAULT 'State Bank' NOT NULL,
	"aadhar_card" text NOT NULL,
	"designation" text NOT NULL,
	"employment_status" text NOT NULL,
	"term_expiry" date,
	"joining_date" date NOT NULL,
	"salary_register_no" text NOT NULL,
	"office_memo_no" text NOT NULL,
	"joining_shift" text DEFAULT 'morning' NOT NULL,
	"pan_card_url" text,
	"bank_proof_url" text,
	"aadhar_card_url" text,
	"office_memo_url" text,
	"joining_report_url" text,
	"term_extension_url" text
);
