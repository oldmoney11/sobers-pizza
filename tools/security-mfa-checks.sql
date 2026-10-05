do $mfa_checks$
declare biz uuid := '8fd864d2-c9f3-46b3-b7c3-c82a786a6823';
begin
 perform set_config('request.jwt.claim.sub','90f28899-9b63-4cd8-8802-befe0d600d43',true);
 perform set_config('request.jwt.claims','{"sub":"90f28899-9b63-4cd8-8802-befe0d600d43","aal":"aal1"}',true);
 if public.has_business_permission(biz,'orders.read') then raise exception 'Password-only owner has administrative access'; end if;
 perform set_config('request.jwt.claims','{"sub":"90f28899-9b63-4cd8-8802-befe0d600d43","aal":"aal2"}',true);
 if not public.has_business_permission(biz,'orders.read') then raise exception 'Verified owner lost authorized access'; end if;
end; $mfa_checks$;
select 'PASS: password-only owner denied; MFA-verified owner authorized' as result;
