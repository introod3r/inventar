CREATE TABLE IF NOT EXISTS public.role_permissions (
  role TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  PRIMARY KEY (role, permission_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Admins manage role permissions
DROP POLICY IF EXISTS "Admins manage role permissions" ON public.role_permissions;
CREATE POLICY "Admins manage role permissions" ON public.role_permissions FOR ALL USING (public.is_admin());

-- Everyone reads role permissions
DROP POLICY IF EXISTS "Everyone reads role permissions" ON public.role_permissions;
CREATE POLICY "Everyone reads role permissions" ON public.role_permissions FOR SELECT USING (true);

-- Insert defaults for admin
INSERT INTO public.role_permissions (role, permission_key, enabled)
VALUES 
  ('admin', 'manage_assets', true),
  ('admin', 'manage_events', true),
  ('admin', 'checkout', true),
  ('admin', 'service', true),
  ('admin', 'inventory', true),
  ('admin', 'admin', true),
  ('admin', 'view_finance', true)
ON CONFLICT DO NOTHING;
