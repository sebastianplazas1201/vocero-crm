CREATE TABLE "pedido" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"conversation_id" text,
	"numero" text NOT NULL,
	"cliente" text NOT NULL,
	"lineas" jsonb NOT NULL,
	"fecha_entrega" text,
	"entrega" text,
	"total" integer NOT NULL,
	"abono" integer NOT NULL,
	"imagen_id" text NOT NULL,
	"enviado_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedido_contacto_idx" ON "pedido" USING btree ("organization_id","contact_id","created_at");