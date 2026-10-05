-- Apply to staging first. Does not change existing admin MFA or order RLS.
begin;
alter table public.platform_orders add column if not exists delivery_latitude double precision;
alter table public.platform_orders add column if not exists delivery_longitude double precision;
create table public.sobers_delivery_sessions (
 order_id uuid primary key references public.platform_orders(id) on delete cascade,
 business_id uuid not null references public.businesses(id),
 rider_id uuid not null references public.profiles(id),
 state text not null default 'assigned' check(state in ('assigned','out_for_delivery','stopped','ended')),
 topic uuid not null default gen_random_uuid(),
 latitude double precision check(latitude between -90 and 90),
 longitude double precision check(longitude between -180 and 180),
 accuracy double precision check(accuracy between 0 and 200),
 heading double precision check(heading >= 0 and heading < 360),
 speed double precision check(speed between 0 and 100),
 updated_at timestamptz,
 unique(topic)
);
alter table public.sobers_delivery_sessions enable row level security;
revoke all on public.sobers_delivery_sessions from public,anon,authenticated;
grant select on public.sobers_delivery_sessions to authenticated;
insert into public.roles(name,display_name,description) values('sobers_rider','Sobers rider','Assigned delivery access only') on conflict(name) do nothing;
-- No orders.read/update permission is granted to riders.
create function sobers_private.active_rider(b uuid,r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.business_memberships m join public.roles ro on ro.id=m.role_id join public.profiles p on p.id=m.profile_id join public.businesses bu on bu.id=m.business_id where m.business_id=b and m.profile_id=r and m.status='active' and p.is_active and ro.name='sobers_rider' and bu.slug='sobers-pizza' and bu.status='active');
$$;
create policy sobers_delivery_assigned_read on public.sobers_delivery_sessions for select to authenticated using (
 (rider_id=auth.uid() and sobers_private.active_rider(business_id,auth.uid())) or public.has_business_permission(business_id,'orders.read')
);
grant usage on schema sobers_private to authenticated;
grant execute on function sobers_private.active_rider(uuid,uuid) to authenticated;
create function public.sobers_assign_delivery(p_order uuid,p_rider uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.platform_orders;
begin
 select * into o from public.platform_orders where id=p_order for update;
 if not found or not public.has_business_permission(o.business_id,'orders.update') then raise exception 'Not authorized'; end if;
 if o.fulfilment <> 'delivery' or o.status in ('completed','cancelled') or not sobers_private.active_rider(o.business_id,p_rider) then raise exception 'Not an eligible rider or delivery'; end if;
 insert into public.sobers_delivery_sessions(order_id,business_id,rider_id) values(o.id,o.business_id,p_rider)
 on conflict(order_id) do update set rider_id=p_rider,state='assigned',topic=gen_random_uuid(),latitude=null,longitude=null,accuracy=null,heading=null,speed=null,updated_at=null;
end; $$;
create function public.sobers_rider_deliveries() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('order_id',o.id,'order_number',o.order_number,'status',o.status,'state',s.state,'topic','sobers-delivery:'||s.topic::text,'customer_name',o.customer_name,'customer_phone',o.customer_phone,'address',o.delivery_address,'latitude',o.delivery_latitude,'longitude',o.delivery_longitude)),'[]'::jsonb)
 from public.sobers_delivery_sessions s join public.platform_orders o on o.id=s.order_id where s.rider_id=auth.uid() and sobers_private.active_rider(s.business_id,auth.uid()) and o.status not in ('completed','cancelled') and s.state <> 'ended';
$$;
create function public.sobers_available_riders(p_business uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_business_permission(p_business,'orders.update') then raise exception 'Not authorized'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name)),'[]'::jsonb) from public.profiles p where sobers_private.active_rider(p_business,p.id));
end; $$;
create function public.sobers_rider_action(p_order uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare o public.platform_orders; s public.sobers_delivery_sessions;
begin
 select * into o from public.platform_orders where id=p_order for update;
 select * into s from public.sobers_delivery_sessions where order_id=p_order for update;
 if s.rider_id is distinct from auth.uid() or not sobers_private.active_rider(s.business_id,auth.uid()) or o.status in ('completed','cancelled') then raise exception 'Delivery unavailable'; end if;
 if p_action='start' then
  if o.status <> 'ready' or s.state='ended' then raise exception 'The kitchen must mark this order ready and assign the delivery first'; end if;
  update public.sobers_delivery_sessions set state='out_for_delivery',latitude=null,longitude=null,accuracy=null,heading=null,speed=null,updated_at=null where order_id=p_order;
 elsif p_action='stop' then
  update public.sobers_delivery_sessions set state='stopped',latitude=null,longitude=null,accuracy=null,heading=null,speed=null,updated_at=null where order_id=p_order;
 elsif p_action='delivered' then
  if s.state not in ('out_for_delivery','stopped') then raise exception 'Start delivery first'; end if;
  update public.platform_orders set status='completed',completed_at=now() where id=p_order;
 else raise exception 'Invalid action'; end if;
end; $$;
create function public.sobers_rider_location(p_order uuid,p_lat double precision,p_lng double precision,p_accuracy double precision,p_heading double precision default null,p_speed double precision default null) returns boolean language plpgsql security definer set search_path='' as $$
declare o public.platform_orders; s public.sobers_delivery_sessions;
begin
 select * into o from public.platform_orders where id=p_order for update;
 select * into s from public.sobers_delivery_sessions where order_id=p_order for update;
 if s.rider_id is distinct from auth.uid() or not sobers_private.active_rider(s.business_id,auth.uid()) or s.state <> 'out_for_delivery' or o.status <> 'ready' then raise exception 'Delivery unavailable'; end if;
 if p_lat is null or p_lng is null or p_accuracy is null or not(p_lat between -90 and 90 and p_lng between -180 and 180 and p_accuracy between 0 and 200) then raise exception 'GPS accuracy or coordinates invalid'; end if;
 if s.updated_at > clock_timestamp()-interval '15 seconds' then return false; end if;
 update public.sobers_delivery_sessions set latitude=p_lat,longitude=p_lng,accuracy=p_accuracy,heading=p_heading,speed=p_speed,updated_at=clock_timestamp() where order_id=p_order;
 return true;
end; $$;
create function sobers_private.delivery_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- No coordinates, customer data, order IDs or status are broadcast. Secure RPC fetch only.
 if TG_OP='UPDATE' then
  if old.topic is distinct from new.topic then perform realtime.send('{}'::jsonb,'changed','sobers-delivery:'||old.topic::text,false); end if;
 end if;
 perform realtime.send('{}'::jsonb,'changed','sobers-delivery:'||new.topic::text,false);
 return new;
end; $$;
create trigger sobers_delivery_changed after insert or update on public.sobers_delivery_sessions for each row execute function sobers_private.delivery_changed();
create function sobers_private.end_delivery() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('completed','cancelled') or new.fulfilment <> 'delivery' then
 update public.sobers_delivery_sessions set state='ended',latitude=null,longitude=null,accuracy=null,heading=null,speed=null,updated_at=null where order_id=new.id;
 end if; return new;
end; $$;
create trigger sobers_end_delivery after update of status,fulfilment on public.platform_orders for each row execute function sobers_private.end_delivery();
-- Preserve the audited tracking function and its UUID+phone throttle unchanged.
alter function public.track_public_order(text,text,text) rename to sobers_track_order_base;
revoke all on function public.sobers_track_order_base(text,text,text) from public,anon,authenticated;
create function public.track_public_order(p_business_slug text,p_order_number text,p_customer_phone text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; o public.platform_orders; s public.sobers_delivery_sessions; br public.branches;
begin
 result:=public.sobers_track_order_base(p_business_slug,p_order_number,p_customer_phone);
 if result is null or p_business_slug <> 'sobers-pizza' then return result; end if;
 select po.* into o from public.platform_orders po join public.businesses b on b.id=po.business_id where b.slug=p_business_slug and po.client_request_id::text=result->>'tracking_reference';
 select * into br from public.branches where id=o.branch_id;
 select * into s from public.sobers_delivery_sessions where order_id=o.id;
 if o.status='ready' and s.state in ('out_for_delivery','stopped') then
 result:=result||jsonb_build_object('delivery',jsonb_build_object('state',s.state,'topic','sobers-delivery:'||s.topic::text,'latitude',case when s.state='out_for_delivery' and sobers_private.active_rider(s.business_id,s.rider_id) then s.latitude end,'longitude',case when s.state='out_for_delivery' and sobers_private.active_rider(s.business_id,s.rider_id) then s.longitude end,'accuracy',case when s.state='out_for_delivery' and sobers_private.active_rider(s.business_id,s.rider_id) then s.accuracy end,'updated_at',case when s.state='out_for_delivery' and sobers_private.active_rider(s.business_id,s.rider_id) then s.updated_at end,'destination_latitude',o.delivery_latitude,'destination_longitude',o.delivery_longitude,'branch_latitude',br.latitude,'branch_longitude',br.longitude));
 elsif o.status not in ('completed','cancelled') and s.order_id is not null then
 result:=result||jsonb_build_object('delivery',jsonb_build_object('state',s.state,'topic','sobers-delivery:'||s.topic::text));
 end if;
 return result;
end; $$;
create function public.create_public_order_v3(business_slug text,customer_name text,customer_phone text,fulfilment public.fulfilment_type,delivery_address text default null,customer_note text default null,requested_items jsonb default '[]',branch_code text default null,client_request_id uuid default null,delivery_latitude double precision default null,delivery_longitude double precision default null) returns table(order_id uuid,order_number text,order_total numeric) language plpgsql security definer set search_path='' as $$
declare saved record;
begin
 if business_slug <> 'sobers-pizza' then raise exception 'Unsupported business'; end if;
 if (delivery_latitude is null) <> (delivery_longitude is null) or (delivery_latitude is not null and not(delivery_latitude between -90 and 90 and delivery_longitude between -180 and 180)) then raise exception 'Invalid delivery pin'; end if;
 select * into saved from public.create_public_order_v2(business_slug,customer_name,customer_phone,fulfilment,delivery_address,customer_note,requested_items,branch_code,client_request_id);
 update public.platform_orders o set delivery_latitude=create_public_order_v3.delivery_latitude,delivery_longitude=create_public_order_v3.delivery_longitude where o.id=saved.order_id and o.fulfilment='delivery' and o.status='new' and o.delivery_latitude is null and regexp_replace(o.customer_phone,'\D','','g')=regexp_replace(create_public_order_v3.customer_phone,'\D','','g');
 return query select saved.order_id,saved.order_number,saved.order_total;
end; $$;
revoke all on function public.sobers_assign_delivery(uuid,uuid),public.sobers_rider_deliveries(),public.sobers_rider_action(uuid,text),public.sobers_rider_location(uuid,double precision,double precision,double precision,double precision,double precision) from public,anon;
revoke all on function public.sobers_available_riders(uuid) from public,anon;
grant execute on function public.sobers_available_riders(uuid) to authenticated;
grant execute on function public.sobers_assign_delivery(uuid,uuid),public.sobers_rider_deliveries(),public.sobers_rider_action(uuid,text),public.sobers_rider_location(uuid,double precision,double precision,double precision,double precision,double precision) to authenticated;
revoke all on function public.track_public_order(text,text,text),public.create_public_order_v3(text,text,text,public.fulfilment_type,text,text,jsonb,text,uuid,double precision,double precision) from public;
grant execute on function public.track_public_order(text,text,text),public.create_public_order_v3(text,text,text,public.fulfilment_type,text,text,jsonb,text,uuid,double precision,double precision) to anon,authenticated;
revoke all on function sobers_private.delivery_changed(),sobers_private.end_delivery() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
