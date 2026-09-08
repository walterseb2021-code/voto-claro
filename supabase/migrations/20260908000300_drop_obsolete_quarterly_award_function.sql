-- B-SEC COMMENTS
-- Retira una funcion obsoleta y desalineada con el esquema actual.
-- can_user_win_quarterly_award(uuid) referencia
-- comment_awards.access_participant_id, columna que ya no existe.

do $$
begin
  if pg_catalog.to_regprocedure(
       'public.can_user_win_quarterly_award(uuid)'
     ) is null then
    raise exception
      'BSEC_COMMENTS_MISSING_FUNCTION: can_user_win_quarterly_award(uuid)';
  end if;
end
$$;

drop function public.can_user_win_quarterly_award(uuid);