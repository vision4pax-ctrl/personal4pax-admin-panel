-- =====================================================================================
-- 0117 · Optimización (26/11/2026)
-- 1. Había dos tareas programadas llamando cada 5 minutos a enviar-notificaciones:
--    «procesar-notificaciones» (clave pública) y «enviar-notificaciones-cada-5-min», que además
--    llevaba escrita la clave secreta del proyecto. Se deja solo la primera.
-- 2. Ningún correo a las cuentas internas de la demo (demo.*@personal4pax.com), que no tienen buzón.
-- =====================================================================================

select cron.unschedule('enviar-notificaciones-cada-5-min')
where exists (select 1 from cron.job where jobname = 'enviar-notificaciones-cada-5-min');

create or replace function public.demo_silenciar_correo()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_cfg public.demo_config;
begin
  if new.destinatario_email ilike 'demo.%@personal4pax.com' then   -- cuentas internas de la demo
    new.canal_email := false;
    return new;
  end if;
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

select jobid, jobname from cron.job order by jobid;
