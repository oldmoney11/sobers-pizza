-- Sobers Pizza step 3: live rider location.
-- Stores one current point per order. Deletes it when the order leaves "out for delivery".
-- Safe to run more than once. Does not delete orders.

create table if not exists public.delivery_locations (
    order_id uuid primary key references public.platform_orders(id) on delete cascade,
    rider_id uuid not null references public.delivery_riders(id),
    latitude double precision not null,
    longitude double precision not null,
    accuracy_m double precision,
    updated_at timestamptz not null default now()
);

alter table public.delivery_locations enable row level security;
revoke all on table public.delivery_locations from public, anon, authenticated;

create or replace function public.sobers_rider_location(
    p_order uuid,
    p_lat double precision,
    p_lng double precision,
    p_accuracy double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    selected public.platform_orders%rowtype;
    rider_match uuid;
begin
    if auth.uid() is null then
        raise exception 'Sign in required';
    end if;
    if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
        raise exception 'Location is not valid';
    end if;
    select o.* into selected
    from public.platform_orders o
    join public.delivery_riders r on r.id = o.rider_id
    where o.id = p_order and r.profile_id = auth.uid() and r.is_active;
    if not found then
        raise exception 'This order is not assigned to you';
    end if;
    if selected.status::text <> 'out_for_delivery' then
        raise exception 'Start the delivery before sharing location';
    end if;
    select r.id into rider_match
    from public.delivery_riders r
    where r.id = selected.rider_id and r.profile_id = auth.uid();
    if exists (
        select 1 from public.delivery_locations
        where order_id = selected.id and updated_at > now() - interval '4 seconds'
    ) then
        return;
    end if;
    insert into public.delivery_locations (order_id, rider_id, latitude, longitude, accuracy_m, updated_at)
    values (selected.id, rider_match, p_lat, p_lng, p_accuracy, now())
    on conflict (order_id) do update
        set rider_id = excluded.rider_id,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            accuracy_m = excluded.accuracy_m,
            updated_at = now();
end;
$$;

create or replace function public.sobers_track_location(
    p_business_slug text,
    p_order_number text,
    p_customer_phone text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    selected_order public.platform_orders%rowtype;
    point public.delivery_locations%rowtype;
begin
    if nullif(trim(p_order_number), '') is null
       or length(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')) < 7 then
        return null;
    end if;
    select o.* into selected_order
    from public.platform_orders o
    join public.businesses b on b.id = o.business_id
    where b.slug = p_business_slug
      and b.status = 'active'
      and (
        upper(trim(o.order_number)) = upper(trim(p_order_number))
        or lower(o.client_request_id::text) = lower(trim(p_order_number))
      )
      and regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') =
          regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')
    limit 1;
    if not found or selected_order.status::text <> 'out_for_delivery' then
        return null;
    end if;
    select * into point from public.delivery_locations where order_id = selected_order.id;
    if not found then
        return null;
    end if;
    return jsonb_build_object(
        'latitude', point.latitude,
        'longitude', point.longitude,
        'updated_at', point.updated_at
    );
end;
$$;

create or replace function public.sobers_clear_location_when_not_out()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.status::text is distinct from 'out_for_delivery' then
        delete from public.delivery_locations where order_id = new.id;
    end if;
    return new;
end;
$$;

drop trigger if exists sobers_clear_delivery_location on public.platform_orders;
create trigger sobers_clear_delivery_location
after update of status on public.platform_orders
for each row
execute function public.sobers_clear_location_when_not_out();

revoke all on function public.sobers_rider_location(uuid, double precision, double precision, double precision) from public, anon;
revoke all on function public.sobers_track_location(text, text, text) from public;
revoke all on function public.sobers_clear_location_when_not_out() from public, anon, authenticated;
grant execute on function public.sobers_rider_location(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.sobers_track_location(text, text, text) to anon, authenticated;
