-- Rider app history. Safe to run more than once. Does not delete orders.

create or replace function public.sobers_rider_history()
returns table (
    order_id uuid,
    order_number text,
    status text,
    customer_name text,
    delivery_address text,
    order_total numeric,
    branch_name text,
    updated_at timestamptz
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
    select o.id, o.order_number, o.status::text, o.customer_name,
           o.delivery_address, o.total, b.name, o.updated_at
    from public.platform_orders o
    join public.delivery_riders r on r.id = o.rider_id
    left join public.branches b on b.id = o.branch_id
    where r.profile_id = auth.uid()
      and r.is_active
      and o.status::text = 'completed'
      and o.updated_at > now() - interval '60 days'
    order by o.updated_at desc
    limit 40;
end;
$$;

revoke all on function public.sobers_rider_history() from public, anon;
grant execute on function public.sobers_rider_history() to authenticated;
