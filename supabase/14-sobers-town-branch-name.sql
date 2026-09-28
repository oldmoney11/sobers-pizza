-- Sobers Pizza: rename the customer-facing main branch label to Town.
-- The stable branch code remains unchanged so existing orders keep their links.

update public.branches b
set name = 'Town',
    updated_at = now()
from public.businesses business
where business.id = b.business_id
  and business.slug = 'sobers-pizza'
  and b.code = 'MAIN-BRANCH'
  and b.name is distinct from 'Town';
