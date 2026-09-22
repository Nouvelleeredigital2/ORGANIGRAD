-- Signalé par l'advisor Supabase (performance) "unindexed_foreign_keys".
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT
      c.conrelid::regclass::text as tbl,
      c.conname as fkey_name,
      (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
       from unnest(c.conkey) with ordinality as k(attnum, ord)
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) as cols
    FROM pg_constraint c
    WHERE c.contype = 'f'
    AND c.connamespace = 'public'::regnamespace
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid
      AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] = c.conkey
    )
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %s (%s);',
        'idx_' || r.fkey_name,
        r.tbl,
        r.cols
      );
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'FAILED on % (%): %', r.fkey_name, r.tbl, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'indexes created: %', n;
END $$;
