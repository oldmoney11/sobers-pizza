-- Sobers Pizza: rider availability and first-accept dispatch.
-- Safe to run more than once. Does not delete orders, riders, or payments.
-- Riders start offline. A ready delivery with no rider can be accepted by one online rider.

alter table public.delivery_riders
    add column if not exists is_available boolean not null default false;

create or replace function public.sobers_rider_profile()
returns table (display_name text, phone text, is_available boolean)
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
    select r.display_name, r.phone, r.is_available
    from public.delivery_riders r
    where r.profile_id = auth.uid()
      and r.is_active
    limit 1;
end;
$$;

create or replace function public.sobers_rider_availability(p_available boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    saved boolean;
begin
    if auth.uid() is null then
        raise exception 'Sign in required';
    end if;
    update public.delivery_riders
    set is_available = coalesce(p_available, false)
    where profile_id = auth.uid()
      and is_active
    returning is_available into saved;
    if saved is null then
        raise exception 'This login is not an active rider yet';
    end if;
    return saved;
end;
$$;

create or replace function public.sobers_rider_queue()
returns table (
    order_id uuid,
    order_number text,
    branch_name text,
    delivery_address text,
    order_total numeric,
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
    if not exists (
        select 1 from public.delivery_riders r
        where r.profile_id = auth.uid() and r.is_active and r.is_available
    ) then
        return;
    end if;
    return query
    select o.id, o.order_number, b.name, o.delivery_address, o.total, o.created_at
    from public.platform_orders o
    join public.delivery_riders r on r.business_id = o.business_id
    left join public.branches b on b.id = o.branch_id
    where r.profile_id = auth.uid()
      and r.is_active
      and r.is_available
      and o.rider_id is null
      and o.status::text = 'ready'
      and o.fulfilment::text <> 'pickup'
    order by o.created_at
    limit 20;
end;
$$;

create or replace function public.sobers_rider_accept(p_order uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    rider_match uuid;
    claimed uuid;
begin
    if auth.uid() is null then
        raise exception 'Sign in required';
    end if;
    select r.id into rider_match
    from public.delivery_riders r
    join public.platform_orders o on o.business_id = r.business_id
    where r.profile_id = auth.uid()
      and r.is_active
      and r.is_available
      and o.id = p_order
    limit 1;
    if rider_match is null then
        raise exception 'Go online before accepting a delivery';
    end if;
    update public.platform_orders
    set rider_id = rider_match,
        updated_at = now()
    where id = p_order
      and rider_id is null
      and status::text = 'ready'
      and fulfilment::text <> 'pickup'
    returning id into claimed;
    if claimed is null then
        raise exception 'Another rider already accepted this job';
    end if;
    return 'accepted';
end;
$$;

drop function if exists public.sobers_list_riders(uuid);

create or replace function public.sobers_list_riders(p_business uuid)
returns table (id uuid, display_name text, phone text, email text, is_active boolean, is_available boolean)
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
    select r.id, r.display_name, r.phone, u.email::text, r.is_active, r.is_available
    from public.delivery_riders r
    left join auth.users u on u.id = r.profile_id
    where r.business_id = p_business
    order by r.display_name;
end;
$$;

revoke all on function public.sobers_rider_profile() from public, anon;
revoke all on function public.sobers_rider_availability(boolean) from public, anon;
revoke all on function public.sobers_rider_queue() from public, anon;
revoke all on function public.sobers_rider_accept(uuid) from public, anon;
revoke all on function public.sobers_list_riders(uuid) from public, anon;
grant execute on function public.sobers_rider_profile() to authenticated;
grant execute on function public.sobers_rider_availability(boolean) to authenticated;
grant execute on function public.sobers_rider_queue() to authenticated;
grant execute on function public.sobers_rider_accept(uuid) to authenticated;
grant execute on function public.sobers_list_riders(uuid) to authenticated;
