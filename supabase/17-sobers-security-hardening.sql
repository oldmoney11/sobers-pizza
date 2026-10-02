-- Sobers Pizza public API hardening.
-- Run once in the Supabase SQL editor after migrations 13-16.
-- Safe to run repeatedly.

create or replace function public.create_public_order_v2(
    business_slug text,
    customer_name text,
    customer_phone text,
    fulfilment public.fulfilment_type,
    delivery_address text default null,
    customer_note text default null,
    requested_items jsonb default '[]'::jsonb,
    branch_code text default null,
    client_request_id uuid default null
)
returns table (order_id uuid, order_number text, order_total numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
    existing_order public.platform_orders%rowtype;
    selected_branch public.branches%rowtype;
    created_order record;
    clean_phone text := regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g');
    clean_request_id uuid := client_request_id;
    item jsonb;
    item_quantity integer;
begin
    if clean_request_id is null then
        raise exception 'A valid customer tracking reference is required';
    end if;

    -- Idempotency is checked first so a network retry never creates a duplicate.
    select o.* into existing_order
    from public.platform_orders o
    join public.businesses b on b.id = o.business_id
    where b.slug = business_slug and o.client_request_id = clean_request_id
    limit 1;
    if found then
        return query select existing_order.id, existing_order.order_number, existing_order.total;
        return;
    end if;

    if business_slug <> 'sobers-pizza' then raise exception 'Business is unavailable'; end if;
    if length(trim(coalesce(customer_name, ''))) not between 2 and 80 then raise exception 'Enter a valid customer name'; end if;
    if length(clean_phone) not between 9 and 15 then raise exception 'Enter a valid phone number'; end if;
    if length(coalesce(delivery_address, '')) > 300 or length(coalesce(customer_note, '')) > 500 then raise exception 'Order details are too long'; end if;
    if fulfilment = 'delivery' and length(trim(coalesce(delivery_address, ''))) < 5 then raise exception 'A delivery address is required'; end if;
    if jsonb_typeof(requested_items) <> 'array' or jsonb_array_length(requested_items) not between 1 and 30 then raise exception 'Order must contain between 1 and 30 items'; end if;

    for item in select value from jsonb_array_elements(requested_items)
    loop
        if jsonb_typeof(item) <> 'object' or length(coalesce(item ->> 'product_key', '')) not between 1 and 120 then
            raise exception 'A requested item is invalid';
        end if;
        begin item_quantity := (item ->> 'quantity')::integer;
        exception when others then raise exception 'Each quantity must be a whole number'; end;
        if item_quantity not between 1 and 20 then raise exception 'Each quantity must be between 1 and 20'; end if;
        if jsonb_typeof(coalesce(item -> 'selected_options', '{}'::jsonb)) <> 'object' then raise exception 'Selected options are invalid'; end if;
    end loop;

    -- Server-side abuse guard. This cannot be bypassed by disabling JavaScript.
    if (select count(*) from public.platform_orders o join public.businesses b on b.id = o.business_id
        where b.slug = business_slug and regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') = clean_phone
          and o.created_at > now() - interval '5 minutes') >= 5 then
        raise exception 'Too many recent orders. Please wait five minutes and try again';
    end if;
    if (select count(*) from public.platform_orders o join public.businesses b on b.id = o.business_id
        where b.slug = business_slug and regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') = clean_phone
          and o.created_at > now() - interval '24 hours') >= 30 then
        raise exception 'Daily order limit reached for this number';
    end if;

    select br.* into selected_branch
    from public.branches br join public.businesses b on b.id = br.business_id
    where b.slug = business_slug and b.status = 'active' and br.is_active = true
      and br.code = coalesce(nullif(trim(branch_code), ''), 'MAIN-BRANCH') limit 1;
    if not found then raise exception 'The selected branch is unavailable'; end if;
    if not selected_branch.accepting_orders then raise exception 'Online orders are paused for this branch'; end if;

    select * into created_order from public.create_public_order(
        business_slug, trim(customer_name), customer_phone, fulfilment,
        nullif(trim(coalesce(delivery_address, '')), ''), nullif(trim(coalesce(customer_note, '')), ''),
        requested_items, selected_branch.code
    );
    update public.platform_orders set client_request_id = clean_request_id where id = created_order.order_id;
    return query select created_order.order_id, created_order.order_number, created_order.order_total;
end;
$$;

revoke all on function public.create_public_order_v2(text,text,text,public.fulfilment_type,text,text,jsonb,text,uuid) from public;
grant execute on function public.create_public_order_v2(text,text,text,public.fulfilment_type,text,text,jsonb,text,uuid) to anon, authenticated;

-- Explicitly preserve deny-by-default access to sensitive tables.
alter table public.platform_orders enable row level security;
alter table public.platform_order_items enable row level security;
alter table public.profiles enable row level security;
alter table public.business_memberships enable row level security;

revoke all on table public.platform_orders from anon;
revoke all on table public.platform_order_items from anon;
revoke all on table public.profiles from anon;
revoke all on table public.business_memberships from anon;

notify pgrst, 'reload schema';
