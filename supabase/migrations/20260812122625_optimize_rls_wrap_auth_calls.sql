-- Signalé par l'advisor Supabase (performance) "auth_rls_initplan".
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT policyname, tablename, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname='public'
    AND (
      (qual IS NOT NULL AND qual ~ '\mauth\.(uid|jwt|role)\(\)' AND qual !~* '\(\s*select\s+auth\.(uid|jwt|role)\(\)')
      OR
      (with_check IS NOT NULL AND with_check ~ '\mauth\.(uid|jwt|role)\(\)' AND with_check !~* '\(\s*select\s+auth\.(uid|jwt|role)\(\)')
    )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I%s%s%s;',
        r.policyname,
        r.tablename,
        CASE WHEN r.roles <> ARRAY['public'::name] THEN ' TO ' || array_to_string(r.roles, ', ') ELSE '' END,
        CASE WHEN r.qual IS NOT NULL THEN ' USING (' || regexp_replace(r.qual, '\mauth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g') || ')' ELSE '' END,
        CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || regexp_replace(r.with_check, '\mauth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g') || ')' ELSE '' END
      );
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'FAILED on policy % (table %): %', r.policyname, r.tablename, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'policies rewritten: %', n;
END $$;
