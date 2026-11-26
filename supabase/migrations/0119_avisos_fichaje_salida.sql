-- =====================================================================================
-- 0119 · Avisos de fichaje de SALIDA (26/11/2026)
-- Mismo mecanismo que los avisos de entrada (evaluar_avisos_fichaje_automaticos, cada 5 min):
--   hora de fin del turno ....... 1.er aviso a la persona trabajadora
--   +5 min sin fichar ........... 2.º aviso a la persona trabajadora
--   +10 min sin fichar .......... último aviso a la persona + aviso a su jefe/a de departamento
--                                 y a RR.HH./Dirección
-- Solo a quien fichó la entrada y no ha fichado la salida. Turno partido: cuenta el fin del
-- segundo tramo. Turno de noche: si termina tras la medianoche, el aviso salta al día siguiente.
-- No genera aviso disciplinario (es informativo). No modifica ninguna tabla existente.
-- =====================================================================================

create table if not exists public.fichaje_avisos_salida (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references public.hoteles(id),
  trabajador_id uuid not null references public.personas_trabajadoras(id),
  fecha         date not null,                  -- fecha del turno (la del fichaje de entrada)
  hora_fin      time not null,
  estado        text not null check (estado in ('aviso_1', 'aviso_2', 'aviso_final')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (trabajador_id, fecha)
);
alter table public.fichaje_avisos_salida enable row level security;
drop policy if exists fichaje_avisos_salida_lectura on public.fichaje_avisos_salida;
create policy fichaje_avisos_salida_lectura on public.fichaje_avisos_salida
  for select to authenticated
  using (hotel_id in (select u.hotel_id from public.usuarios u where u.id = auth.uid()));

create or replace function public.evaluar_avisos_fichaje_salida()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_ahora      timestamp := (now() at time zone 'Europe/Madrid');
  r            record;
  v_fin_ts     timestamp;
  v_minutos    integer;
  v_aviso      public.fichaje_avisos_salida;
  v_destino    record;
  v_jefe       record;
  v_hora_txt   text;
  v_procesadas integer := 0;
begin
  for r in
    select ca.trabajador_id, ca.hotel_id, ca.fecha, pt.nombre, pt.departamento, pt.supervisor_id,
           tc.hora_entrada_1, coalesce(tc.hora_salida_2, tc.hora_salida_1) as hora_fin
    from public.cuadrante_asignaciones ca
    join public.personas_trabajadoras pt on pt.id = ca.trabajador_id
    join public.turnos_catalogo tc on tc.id = ca.turno_id
    where ca.fecha in (v_ahora::date, v_ahora::date - 1)
      and coalesce(tc.hora_salida_2, tc.hora_salida_1) is not null
      and coalesce(pt.estado_laboral, 'Activo') = 'Activo'
      -- fichó la entrada y no ha fichado la salida
      and exists (select 1 from public.fichajes f
                   where f.trabajador_id = ca.trabajador_id and f.fecha = ca.fecha
                     and f.hora_entrada is not null and f.hora_salida is null)
  loop
    v_fin_ts := r.fecha + r.hora_fin;
    if r.hora_entrada_1 is not null and r.hora_fin <= r.hora_entrada_1 then
      v_fin_ts := v_fin_ts + interval '1 day';               -- turno que termina tras la medianoche
    end if;
    v_minutos := floor(extract(epoch from (v_ahora - v_fin_ts)) / 60)::integer;
    if v_minutos < 0 or v_minutos > 180 then continue; end if; -- aún no ha terminado, o ya muy pasado
    v_hora_txt := to_char(r.hora_fin, 'HH24:MI');

    select * into v_aviso from public.fichaje_avisos_salida
     where trabajador_id = r.trabajador_id and fecha = r.fecha;

    if v_aviso.id is null then
      insert into public.fichaje_avisos_salida (hotel_id, trabajador_id, fecha, hora_fin, estado)
      values (r.hotel_id, r.trabajador_id, r.fecha, r.hora_fin, 'aviso_1')
      returning * into v_aviso;
      perform public.encolar_notificacion(
        r.trabajador_id, r.hotel_id, 'fichaje_salida_recordatorio',
        '🔔 Recuerda fichar la salida',
        'Tu turno termina a las ' || v_hora_txt || ' y todavía no has fichado la salida. Fíchala antes de irte.',
        'fichaje_avisos_salida', v_aviso.id);
      v_procesadas := v_procesadas + 1;

    elsif v_aviso.estado = 'aviso_1' and v_minutos >= 5 then
      update public.fichaje_avisos_salida set estado = 'aviso_2', updated_at = now() where id = v_aviso.id;
      perform public.encolar_notificacion(
        r.trabajador_id, r.hotel_id, 'fichaje_salida_recordatorio_2',
        '🔔 Fichaje de salida pendiente (+5 min)',
        'Tu turno terminó a las ' || v_hora_txt || ' y sigues sin fichar la salida. Fíchala ahora, por favor.',
        'fichaje_avisos_salida', v_aviso.id);
      v_procesadas := v_procesadas + 1;

    elsif v_aviso.estado = 'aviso_2' and v_minutos >= 10 then
      update public.fichaje_avisos_salida set estado = 'aviso_final', updated_at = now() where id = v_aviso.id;
      perform public.encolar_notificacion(
        r.trabajador_id, r.hotel_id, 'fichaje_salida_ultimo_aviso',
        '⚠️ Último aviso: ficha la salida (+10 min)',
        'Tu turno terminó a las ' || v_hora_txt || ' y no consta tu fichaje de salida. Fíchala ahora o comunícalo a tu responsable o a RR.HH. Se ha informado a tu jefe/a de departamento y a RR.HH.',
        'fichaje_avisos_salida', v_aviso.id);

      -- Jefe/a de departamento: responsable en el organigrama; si no hay, su supervisor/a.
      for v_jefe in
        select distinct j.id
        from public.personas_trabajadoras j
        where j.id <> r.trabajador_id
          and (j.id in (select od.responsable_trabajador_id from public.organigrama_departamentos od
                         where od.hotel_id = r.hotel_id and od.dept = r.departamento
                           and od.responsable_trabajador_id is not null)
               or (j.id = r.supervisor_id
                   and not exists (select 1 from public.organigrama_departamentos od
                                    where od.hotel_id = r.hotel_id and od.dept = r.departamento
                                      and od.responsable_trabajador_id is not null)))
      loop
        perform public.encolar_notificacion(
          v_jefe.id, r.hotel_id, 'fichaje_salida_aviso_jefe',
          '⚠️ Fichaje de salida pendiente en tu departamento',
          r.nombre || ' no ha fichado la salida de su turno (terminaba a las ' || v_hora_txt || ', +10 min).',
          'fichaje_avisos_salida', v_aviso.id);
      end loop;

      -- RR.HH./Dirección del hotel, por correo (igual que los avisos de entrada).
      for v_destino in
        select au.email from public.usuarios u join auth.users au on au.id = u.id
        where u.hotel_id = r.hotel_id and u.rol = 'rrhh_direccion' and au.email is not null
      loop
        insert into public.notificaciones_cola
          (trabajador_id, hotel_id, destinatario_email, tipo, titulo, cuerpo, referencia_tabla, referencia_id, canal_push, canal_email)
        values
          (null, r.hotel_id, v_destino.email, 'fichaje_salida_aviso_admin', '⚠️ Fichaje de salida pendiente (+10 min)',
           r.nombre || ' no ha fichado la salida (turno hasta las ' || v_hora_txt || ', departamento ' ||
           coalesce(r.departamento, '—') || '). Último aviso enviado a la persona y a su jefe/a de departamento.',
           'fichaje_avisos_salida', v_aviso.id, false, true);
      end loop;
      v_procesadas := v_procesadas + 1;
    end if;
  end loop;
  return v_procesadas;
end;
$$;
revoke all on function public.evaluar_avisos_fichaje_salida() from public, anon, authenticated;

select cron.unschedule('evaluar-avisos-fichaje-salida')
where exists (select 1 from cron.job where jobname = 'evaluar-avisos-fichaje-salida');
select cron.schedule('evaluar-avisos-fichaje-salida', '*/5 * * * *',
                     'select public.evaluar_avisos_fichaje_salida();');
