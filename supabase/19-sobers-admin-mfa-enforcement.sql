-- Apply AFTER the MFA-capable admin UI is deployed and enrollment is tested.
begin;
CREATE OR REPLACE FUNCTION public.has_business_permission(target_business_id uuid, target_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select (target_business_id <> (select id from public.businesses where slug='sobers-pizza') or coalesce(auth.jwt()->>'aal','aal1')='aal2') and (public.is_platform_admin()
 or exists (
 select 1
 from public.business_memberships bm
 join public.profiles p on p.id = bm.profile_id
 join public.role_permissions rp on rp.role_id = bm.role_id
 join public.permissions permission
 on permission.id = rp.permission_id
 where bm.business_id = target_business_id
 and bm.profile_id = (select auth.uid())
 and bm.status = 'active'
 and p.is_active
 and permission.permission_key = target_permission
 ));
$function$
;
notify pgrst, 'reload schema';
commit;
