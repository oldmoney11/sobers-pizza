-- Sobers Pizza step 2: rider login and assignment.
-- Additive only. Does not delete orders, products, or accounts.
-- Safe to run more than once.

create table if not exists public.delivery_riders (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id),
    profile_id uuid not null,
    display_name text not null,
    phone text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    unique (business_id, profile_id)
);

alter table public.platform_orders
    add column if not exists rider_id uuid references public.delivery_riders(id);

alter table public.delivery_riders enable row level security;
revoke all on table public.delivery_riders from public, anon, authenticated;

create or replace function public.sobers_is_business_admin(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select auth.uid() is not null and (
        exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and coalesce(p.is_platform_admin, false)
        )
        or exists (
            select 1 from public.business_memberships bm
            where bm.business_id = p_business
              and bm.profile_id = auth.uid()
              and bm.status = 'active'
        )
    );
$$;

revoke all on function public.sobers_is_business_admin(uuid) from public, anon, authenticated;

create or replace function public.sobers_list_riders(p_business uuid)
returns table (id uuid, display_name text, phone text, email text, is_active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.sobers_is_business_admin(p_business) then
        raise exception 'Not allowed';
    end if;
    return query
    select r.id, r.display_name, r.phone, u.email::text, r.is_active
    from public.delivery_riders r
    left join auth.users u on u.id = r.profile_id
    where r.business_id = p_business
    order by r.display_name;
end;
$$;

create or replace function public.sobers_save_rider(p_business uuid, p_email text, p_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    found_user uuid;
    saved_id uuid;
begin
    if not public.sobers_is_business_admin(p_business) then
        raise exception 'Not allowed';
    end if;
    if nullif(trim(p_name), '') is null or nullif(trim(p_email), '') is null then
        raise exception 'Rider name and email are required';
    end if;
    select u.id into found_user
    from auth.users u
    where lower(u.email) = lower(trim(p_email))
    limit 1;
    if found_user is null then
        raise exception 'No login exists for that email yet. Ask the rider to create an account on the rider page first.';
    end if;
    insert into public.delivery_riders (business_id, profile_id, display_name, phone, is_active)
    values (p_business, found_user, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), true)
    on conflict (business_id, profile_id) do update
        set display_name = excluded.display_name,
            phone = excluded.phone,
            is_active = true
    returning delivery_riders.id into saved_id;
    return saved_id;
end;
$$;

create or replace function public.sobers_assign_rider(p_business uuid, p_order uuid, p_rider uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    selected public.platform_orders%rowtype;
begin
    if not public.sobers_is_business_admin(p_business) then
        raise exception 'Not allowed';
    end if;
    select * into selected
    from public.platform_orders
    where id = p_order and business_id = p_business;
    if not found then
        raise exception 'Order not found';
    end if;
    if selected.fulfilment::text = 'pickup' then
        raise exception 'Pickup orders do not need a rider';
    end if;
    if p_rider is not null and not exists (
        select 1 from public.delivery_riders r
        where r.id = p_rider and r.business_id = p_business and r.is_active
    ) then
        raise exception 'Choose an active rider for this business';
    end if;
    update public.platform_orders
    set rider_id = p_rider, updated_at = now()
    where id = selected.id;
end;
$$;

create or replace function public.sobers_rider_orders()
returns table (
    order_id uuid,
    order_number text,
    status text,
    customer_name text,
    customer_phone text,
    delivery_address text,
    customer_note text,
    order_total numeric,
    branch_name text,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Sign in required';
    end if;
    return query
    select o.id, o.order_number, o.status::text, o.customer_name, o.customer_phone,
           o.delivery_address, o.customer_note, o.total, b.name, o.created_at
    from public.platform_orders o
    join public.delivery_riders r on r.id = o.rider_id
    left join public.branches b on b.id = o.branch_id
    where r.profile_id = auth.uid()
      and r.is_active
      and o.status::text in ('ready', 'out_for_delivery')
    order by o.created_at;
end;
$$;

create or replace function public.sobers_rider_update(p_order uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    selected public.platform_orders%rowtype;
    next_status text;
begin
    if auth.uid() is null then
        raise exception 'Sign in required';
    end if;
    select o.* into selected
    from public.platform_orders o
    join public.delivery_riders r on r.id = o.rider_id
    where o.id = p_order and r.profile_id = auth.uid() and r.is_active;
    if not found then
        raise exception 'This order is not assigned to you';
    end if;
    if p_action = 'start' and selected.status::text = 'ready' then
        next_status := 'out_for_delivery';
    elsif p_action = 'delivered' and selected.status::text = 'out_for_delivery' then
        next_status := 'completed';
    else
        raise exception 'This order cannot move to that step yet';
    end if;
    update public.platform_orders
    set status = next_status, updated_at = now()
    where id = selected.id;
    return next_status;
end;
$$;

revoke all on function public.sobers_list_riders(uuid) from public, anon;
revoke all on function public.sobers_save_rider(uuid, text, text, text) from public, anon;
revoke all on function public.sobers_assign_rider(uuid, uuid, uuid) from public, anon;
revoke all on function public.sobers_rider_orders() from public, anon;
revoke all on function public.sobers_rider_update(uuid, text) from public, anon;
grant execute on function public.sobers_list_riders(uuid) to authenticated;
grant execute on function public.sobers_save_rider(uuid, text, text, text) to authenticated;
grant execute on function public.sobers_assign_rider(uuid, uuid, uuid) to authenticated;
grant execute on function public.sobers_rider_orders() to authenticated;
grant execute on function public.sobers_rider_update(uuid, text) to authenticated;
