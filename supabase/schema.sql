-- BIZNIS PAM initial schema
create extension if not exists pgcrypto;

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  owner_id uuid references auth.users(id) on delete cascade,
  default_currency text not null default 'HTG',
  created_at timestamptz not null default now()
);
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text not null default '',
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'HTG',
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  full_name text,
  phone text not null,
  channel text not null default 'whatsapp',
  created_at timestamptz not null default now(),
  unique (merchant_id, phone, channel)
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','confirmed','processing','shipped','delivered','cancelled')),
  total numeric(12,2) not null default 0,
  currency text not null default 'HTG',
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.merchants(id) on delete cascade,
  customer_phone text not null,
  channel text not null default 'whatsapp',
  customer_message text not null,
  assistant_reply text,
  status text not null default 'human_handoff',
  created_at timestamptz not null default now()
);
create index if not exists products_merchant_idx on public.products(merchant_id);
create index if not exists orders_merchant_idx on public.orders(merchant_id, created_at desc);
create index if not exists conversations_phone_idx on public.conversations(customer_phone, created_at desc);

alter table public.merchants enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.conversations enable row level security;

-- Browser clients may read/write only rows belonging to their authenticated merchant.
create policy "merchant owner reads own merchant" on public.merchants for select using (owner_id = auth.uid());
create policy "merchant owner updates own merchant" on public.merchants for update using (owner_id = auth.uid());
create policy "merchant owner manages categories" on public.categories for all using (exists(select 1 from public.merchants m where m.id=merchant_id and m.owner_id=auth.uid())) with check (exists(select 1 from public.merchants m where m.id=merchant_id and m.owner_id=auth.uid()));
create policy "merchant owner manages products" on public.products for all using (exists(select 1 from public.merchants m where m.id=merchant_id and m.owner_id=auth.uid())) with check (exists(select 1 from public.merchants m where m.id=merchant_id and m.owner_id=auth.uid()));
create policy "merchant owner manages customers" on public.customers for all using (exists(select 1 from public.merchants m where m.id=merchant_id and m.owner_id=auth.uid())) with check (exists(select 1 from public.merchants m where m.id=merchant_id and m.owner_id=auth.uid()));
create policy "merchant owner manages orders" on public.orders for all using (exists(select 1 from public.merchants m where m.id=merchant_id and m.owner_id=auth.uid())) with check (exists(select 1 from public.merchants m where m.id=merchant_id and m.owner_id=auth.uid()));
create policy "merchant owner reads conversations" on public.conversations for select using (exists(select 1 from public.merchants m where m.id=merchant_id and m.owner_id=auth.uid()));
