do $checks$
declare product public.products%rowtype; item jsonb; options jsonb := '{}'::jsonb; g record; rejected boolean; ref text := gen_random_uuid()::text; i integer;
begin
 if has_schema_privilege('anon','sobers_private','USAGE') then raise exception 'Anonymous access to internal schema'; end if;
 if has_schema_privilege('authenticated','sobers_private','USAGE') then raise exception 'Authenticated access to internal schema'; end if;
 rejected := false;
 begin perform public.create_public_order('sobers-pizza','Test','0000000000','pickup',null,null,'[]'::jsonb,'MAIN-BRANCH');
 exception when others then rejected := sqlerrm = 'Use the secure customer order endpoint'; end;
 if not rejected then raise exception 'Legacy order bypass remains'; end if;
 if position('Use the secure customer order endpoint' in pg_get_functiondef('public.create_public_order(text,text,text,public.fulfilment_type,text,text,jsonb)'::regprocedure))=0 then raise exception 'Seven-argument legacy guard missing'; end if;
 rejected := false;
 begin perform public.create_kiosk_order('sobers-pizza','main-branch','main-kiosk','takeaway','[]'::jsonb,gen_random_uuid());
 exception when others then rejected := sqlerrm like '%item%' or sqlerrm like '%Item%'; end;
 if not rejected then raise exception 'Public kiosk failed to reach item validation'; end if;
 if public.track_public_order('sobers-pizza','SP-10010','0000000000') is not null then raise exception 'Predictable tracking reference accepted'; end if;
 select p.* into product from public.products p join public.businesses b on b.id=p.business_id where b.slug='sobers-pizza' and p.is_active and p.is_available and p.options ? 'size' limit 1;
 if not found then raise exception 'Cannot validate catalog options: missing sample'; end if;
 for g in select key,value from jsonb_each(product.options) loop
  if g.value->>1='radio' then options := options || jsonb_build_object(g.key,(select key from jsonb_each(g.value->2) limit 1)); end if;
 end loop;
 item := jsonb_build_object('product_key',product.slug,'quantity',1,'selected_options',options);
 perform sobers_private.validate_items('sobers-pizza',jsonb_build_array(item));
 rejected := false;
 begin perform sobers_private.validate_items('sobers-pizza',jsonb_build_array(item || jsonb_build_object('quantity',null)));
 exception when others then rejected := true; end;
 if not rejected then raise exception 'Null quantity accepted'; end if;
 rejected := false;
 begin perform sobers_private.validate_items('sobers-pizza',jsonb_build_array(item || jsonb_build_object('selected_options','{}'::jsonb)));
 exception when others then rejected := true; end;
 if not rejected then raise exception 'Missing size accepted'; end if;
 rejected := false;
 begin perform sobers_private.validate_items('sobers-pizza',jsonb_build_array(item || jsonb_build_object('selected_options',options || '{"unknown":"bad"}'::jsonb)));
 exception when others then rejected := true; end;
 if not rejected then raise exception 'Unknown option group accepted'; end if;
 for i in 1..12 loop
  if not sobers_private.allow_tracking(ref,'0000000000') then raise exception 'Normal tracking throttled'; end if;
 end loop;
 if sobers_private.allow_tracking(ref,'0000000000') then raise exception 'Tracking limiter failed'; end if;
end; $checks$;
select 'PASS: legacy endpoints denied, public kiosk validates items, tracking restricted, valid options accepted, malformed options rejected' as result;
