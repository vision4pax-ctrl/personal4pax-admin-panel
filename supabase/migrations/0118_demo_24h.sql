-- =====================================================================================
-- 0118 · Modalidad demo: 24 horas para abrir el enlace (26/11/2026)
-- El enlace se puede abrir en las 24 horas siguientes a generarlo; la demostración dura
-- 4 / 15 minutos desde que se abre. Como ahora puede pasar mucho tiempo entre generar y
-- abrir, todo se mide desde la APERTURA, no desde la generación:
--   · lo que se puede modificar en la demo = lo creado desde que se abrió;
--   · la limpieza borra lo creado durante cada sesión abierta, sesión a sesión;
--   · el silencio de correos solo actúa mientras hay una sesión abierta.
-- =====================================================================================

-- Inicio de la demo en curso = primera apertura de un enlace todavía activo del mismo lote.
create or replace function public.demo_inicio_sesion_actual()
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select case
           when count(*) = 0 then null
           else coalesce(
             (select min(e2.usado_en) from public.demo_enlaces e2
               where e2.usado_en is not null and e2.expira_en > now()
                 and e2.lote in (select e1.lote from public.demo_enlaces e1
                                  where e1.user_id = auth.uid() and e1.usado_en is not null
                                    and e1.expira_en > now())),
             'infinity'::timestamptz)
         end
  from public.demo_enlaces e
  where e.user_id = auth.uid() and e.usado_en is not null;
$$;

-- Correos: silencio solo con una sesión demo ABIERTA (no durante las 24 h de espera).
create or replace function public.demo_silenciar_correo()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_cfg public.demo_config;
begin
  if new.destinatario_email ilike 'demo.%@personal4pax.com' then
    new.canal_email := false;
    return new;
  end if;
  select * into v_cfg from public.demo_config where id = 1;
  if v_cfg.hotel_id is null or new.hotel_id is distinct from v_cfg.hotel_id then return new; end if;
  if new.trabajador_id = v_cfg.trabajador_id
     or public.demo_inicio_sesion_actual() is not null
     or exists (select 1 from public.demo_enlaces e
                 where e.hotel_id = v_cfg.hotel_id and e.usado_en is not null and e.expira_en > now())
     or exists (select 1 from public.personas_trabajadoras p
                 join public.demo_enlaces e on e.user_id = p.user_id and e.creado_en_demo
                 where p.id = new.trabajador_id)
  then
    new.canal_email := false;
  end if;
  return new;
end;
$$;

-- Limpieza sesión a sesión: borra lo creado en el hotel demo entre la apertura y el final de cada
-- sesión terminada, y devuelve las cuentas de las personas dadas de alta en ese intervalo.
create or replace function public.demo_limpiar()
returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  v_ses     record;
  v_tabla   record;
  v_pasada  int;
  v_borrado int;
  v_total   int := 0;
  v_hubo    boolean;
  v_cuentas uuid[] := '{}';
  v_sesiones int := 0;
begin
  for v_ses in
    select id, hotel_id, usado_en as desde, expira_en as hasta
    from public.demo_enlaces
    where usado_en is not null and limpiado_en is null and expira_en < now() - interval '2 minutes'
  loop
    v_sesiones := v_sesiones + 1;
    -- Cuentas de acceso de las personas creadas durante la sesión (se borran después, desde la función).
    v_cuentas := v_cuentas || array(select user_id from public.personas_trabajadoras
                                     where hotel_id = v_ses.hotel_id and user_id is not null
                                       and created_at >= v_ses.desde and created_at <= v_ses.hasta);
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
            using v_ses.hotel_id, v_ses.desde, v_ses.hasta;
          get diagnostics v_borrado = row_count;
          if v_borrado > 0 then v_total := v_total + v_borrado; v_hubo := true; end if;
        exception when foreign_key_violation then
          v_hubo := true;
        end;
      end loop;
      exit when not v_hubo;
    end loop;
    update public.demo_enlaces set limpiado_en = now() where id = v_ses.id;
  end loop;
  return jsonb_build_object('sesiones', v_sesiones, 'filas_borradas', v_total,
                            'cuentas_a_borrar', to_jsonb(array(select distinct unnest(v_cuentas))));
end;
$$;
revoke all on function public.demo_limpiar() from public, anon, authenticated;
grant execute on function public.demo_limpiar() to service_role;
