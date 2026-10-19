CREATE TABLE public.swap_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_hash text NOT NULL,
 request_id uuid NOT NULL UNIQUE,
 shift_id text UNIQUE,
 order_data jsonb,
 state text NOT NULL DEFAULT 'creating',
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.swap_orders TO service_role;
ALTER TABLE public.swap_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX swap_orders_session_idx ON public.swap_orders(session_hash, created_at DESC);
COMMENT ON TABLE public.swap_orders IS 'Private guest swap orders; server access requires a matching hashed HttpOnly session capability. No browser Data API grants or policies.';