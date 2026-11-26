-- =====================================================================================
-- 0116 · Modalidad demo de Personal4Pax (26/11/2026)
-- Enlaces de demostración de un solo uso (demo inicial 4 min · demo ampliada 15 min),
-- con estas garantías:
--   1. Los datos de ejemplo existentes NO se pueden modificar ni borrar desde una demo
--      (sí se puede crear todo lo nuevo que haga falta para probar de principio a fin).
--   2. Lo creado durante cada demo se borra solo cuando termina.
--   3. Durante la demo no salen correos reales (los correos inventados no se envían).
--   4. No cambia ninguna fecha ni ningún dato existente.
-- Va junto con la función Edge «demo-acceso».
-- =====================================================================================

-- ---------------------------------------------------------------- 1. Configuración
create table if not exists public.demo_config (
  id                 int primary key default 1 check (id = 1),
  hotel_id           uuid not null references public.hoteles(id),
  trabajador_id      uuid not null references public.personas_trabajadoras(id), -- Elena
  admin_user_id      uuid,          -- lo crea la función (accion «preparar»)
  trabajador_user_id uuid,          -- ídem, acceso de Elena
  created_at         timestamptz not null default now()
);

insert into public.demo_config (id, hotel_id, trabajador_id)
values (1, 'a0111f32-4521-4a34-8d50-fbafea1187b0',   -- Hotel Playa Dorada
           '13a848a8-5533-4315-831f-f208fd377f74')   -- Elena Torres (Playa Dorada)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- 2. Enlaces
create table if not exists public.demo_enlaces (
  id                  uuid primary key default gen_random_uuid(),
  lote                uuid not null,                 -- los enlaces de una misma demo
  modalidad           text not null check (modalidad in ('inicial', 'ampliada')),
  minutos             int  not null,
  rol                 text not null check (rol in ('admin', 'trabajador')),
  user_id             uuid not null,
  hotel_id            uuid not null,
  token_hash          text not null unique,          -- nunca se guarda el enlace en claro
  creado_en           timestamptz not null default now(),
  abrir_antes_de      timestamptz not null,
  usado_en            timestamptz,
  expira_en           timestamptz,
  acceso_bloqueado_en timestamptz,
  creado_en_demo      boolean not null default false, -- persona dada de alta por el prospecto
  limpiado_en         timestamptz
);
create index if not exists demo_enlaces_user_idx on public.demo_enlaces (user_id);
create index if not exists demo_enlaces_lote_idx on public.demo_enlaces (lote);

-- Solo la función Edge (service_role) lee y escribe estas tablas.
alter table public.demo_config  enable row level security;
alter table public.demo_enlaces enable row level security;
revoke all on public.demo_config, public.demo_enlaces from anon, authenticated;

-- ---------------------------------------------------------------- 3. ¿Quién está en demo?
-- Devuelve el inicio de la demo en curso del usuario conectado (momento en que se generaron
-- los enlaces), 'infinity' si es un usuario demo cuya demo ya terminó, o null si no es demo.
create or replace function public.demo_inicio_sesion_actual()
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select case
           when count(*) = 0 then null
           else coalesce(
             (select min(e2.creado_en) from public.demo_enlaces e2
               where e2.lote in (select e1.lote from public.demo_enlaces e1
                                  where e1.user_id = auth.uid() and e1.usado_en is not null
                                    and e1.expira_en > now())),
             'infinity'::timestamptz)
         end
  from public.demo_enlaces e
  where e.user_id = auth.uid() and e.usado_en is not null;
$$;
revoke all on function public.demo_inicio_sesion_actual() from public;
grant execute on function public.demo_inicio_sesion_actual() to authenticated;

-- ---------------------------------------------------------------- 4. Protección de datos de ejemplo
create or replace function public.demo_proteger_datos()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_inicio   timestamptz;
  v_creado   timestamptz;
  v_old      jsonb;
  v_new      jsonb;
  v_campo    text;
  -- Marcar como leído no es modificar datos: se permite.
  -- Registrar la rúbrica propia de la persona tampoco: es parte de lo que se enseña en la demo.
  v_lectura  text[] := array['leido', 'leido_en', 'leido_rrhh', 'leido_rrhh_en', 'updated_at', 'actualizado_en',
                             'firma_personal_id', 'firma_personal_hash', 'firma_personal_creada_en',
                             'firma_manuscrita_url', 'firma_manuscrita_hash', 'firma_manuscrita_creada_en'];
begin
  if auth.uid() is null then return coalesce(new, old); end if;   -- servidor, cron, service_role
  v_inicio := public.demo_inicio_sesion_actual();
  if v_inicio is null then return coalesce(new, old); end if;     -- usuario real: sin cambios

  if v_inicio = 'infinity'::timestamptz then
    raise exception 'La demostración ha terminado. Pida un enlace nuevo a comercial@personal4pax.com.';
  end if;
  if tg_op = 'INSERT' then return new; end if;                    -- crear cosas nuevas: permitido

  v_old := to_jsonb(old);
  v_creado := coalesce(v_old->>'created_at', v_old->>'creado_en')::timestamptz;
  if v_creado is not null and v_creado >= v_inicio then
    return coalesce(new, old);                                    -- creado en esta demo: permitido
  end if;

  if tg_op = 'UPDATE' then
    v_new := to_jsonb(new);
    for v_campo in select k from jsonb_object_keys(v_new) k where v_new->k is distinct from v_old->k loop
      if not (v_campo = any (v_lectura)) then
        raise exception 'Modo demostración: los datos de ejemplo no se pueden modificar. Puede crear registros nuevos para probarlo todo.';
      end if;
    end loop;
    return new;
  end if;

  raise exception 'Modo demostración: los datos de ejemplo no se pueden borrar.';
end;
$$;

-- Se instala en todas las tablas con hotel_id, y en hoteles.
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and tb.table_type = 'BASE TABLE'
      and c.column_name = 'hotel_id' and c.table_name not like 'demo\_%'
    union select 'hoteles'
  loop
    execute format('drop trigger if exists trg_demo_proteger on public.%I', t);
    execute format('create trigger trg_demo_proteger before insert or update or delete on public.%I
                    for each row execute function public.demo_proteger_datos()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 5. Sin correos reales en la demo
create or replace function public.demo_silenciar_correo()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_cfg public.demo_config;
begin
  select * into v_cfg from public.demo_config where id = 1;
  if v_cfg.hotel_id is null or new.hotel_id is distinct from v_cfg.hotel_id then return new; end if;
  if new.trabajador_id = v_cfg.trabajador_id                                       -- Elena
     or public.demo_inicio_sesion_actual() is not null                             -- lo provoca un usuario demo
     or exists (select 1 from public.demo_enlaces e                                -- hay una demo en curso
                 where e.hotel_id = v_cfg.hotel_id
                   and (e.expira_en > now() or (e.usado_en is null and e.abrir_antes_de > now())))
     or exists (select 1 from public.personas_trabajadoras p                       -- persona creada en una demo
                 join public.demo_enlaces e on e.user_id = p.user_id and e.creado_en_demo
                 where p.id = new.trabajador_id)
  then
    new.canal_email := false;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_demo_silenciar_correo on public.notificaciones_cola;
create trigger trg_demo_silenciar_correo before insert on public.notificaciones_cola
  for each row execute function public.demo_silenciar_correo();

-- ---------------------------------------------------------------- 6. Limpieza al terminar cada demo
-- La llama la función Edge (service_role), que es el único rol al que la normativa de conservación
-- (_bloquear_borrado_registro_protegido) permite borrar. Borra en el hotel demo lo creado entre la
-- generación de los enlaces y el final de la demo; repite pasadas hasta que el orden de las claves
-- foráneas lo permite.
create or replace function public.demo_limpiar()
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_lote    record;
  v_tabla   record;
  v_pasada  int;
  v_borrado int;
  v_total   int := 0;
  v_hubo    boolean;
  v_cuentas uuid[] := '{}';
  v_lotes   int := 0;
begin
  for v_lote in
    select lote, min(hotel_id::text)::uuid as hotel_id, min(creado_en) as desde,
           greatest(max(coalesce(expira_en, abrir_antes_de)), max(abrir_antes_de)) as hasta
    from public.demo_enlaces
    group by lote
    having bool_and(limpiado_en is null)
       and greatest(max(coalesce(expira_en, abrir_antes_de)), max(abrir_antes_de)) < now() - interval '2 minutes'
  loop
    v_lotes := v_lotes + 1;
    v_cuentas := v_cuentas || array(select user_id from public.demo_enlaces
                                     where lote = v_lote.lote and creado_en_demo);
    for v_pasada in 1..6 loop
      v_hubo := false;
      for v_tabla in
        select c.table_name, max(case when c.column_name in ('created_at', 'creado_en') then c.column_name end) as col
        from information_schema.columns c
        join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
        where c.table_schema = 'public' and tb.table_type = 'BASE TABLE' and c.table_name not like 'demo\_%'
        group by c.table_name
        having bool_or(c.column_name = 'hotel_id') and bool_or(c.column_name in ('created_at', 'creado_en'))
      loop
        begin
          execute format('delete from public.%I where hotel_id = $1 and %I >= $2 and %I <= $3',
                         v_tabla.table_name, v_tabla.col, v_tabla.col)
            using v_lote.hotel_id, v_lote.desde, v_lote.hasta;
          get diagnostics v_borrado = row_count;
          if v_borrado > 0 then v_total := v_total + v_borrado; v_hubo := true; end if;
        exception when foreign_key_violation then
          v_hubo := true;  -- quedan filas hijas: se reintenta en la siguiente pasada
        end;
      end loop;
      exit when not v_hubo;
    end loop;
    update public.demo_enlaces set limpiado_en = now() where lote = v_lote.lote;
  end loop;
  return jsonb_build_object('lotes', v_lotes, 'filas_borradas', v_total, 'cuentas_a_borrar', to_jsonb(v_cuentas));
end;
$$;
revoke all on function public.demo_limpiar() from public, anon, authenticated;
grant execute on function public.demo_limpiar() to service_role;

-- ---------------------------------------------------------------- 7. Revisión automática cada 5 minutos
select cron.unschedule('demo-caducar') where exists (select 1 from cron.job where jobname = 'demo-caducar');
select cron.schedule('demo-caducar', '*/5 * * * *', $cron$
  select net.http_post(
    url     := 'https://uybljgcimvnfbgumucwo.supabase.co/functions/v1/demo-acceso',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer sb_publishable_ndBnIFRxI4TB5YYJiBxdXQ_o_qVnb-i'),
    body    := '{"accion":"caducar"}'::jsonb);
$cron$);
