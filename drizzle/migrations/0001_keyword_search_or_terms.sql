CREATE OR REPLACE FUNCTION public.keyword_search_chunks(query_text text, match_count integer DEFAULT 10, p_source_id uuid DEFAULT NULL::uuid, p_language text DEFAULT NULL::text, p_file_type text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, document_id uuid, source_id uuid, content text, chunk_type text, file_path text, language text, section text, line_start integer, line_end integer, page_number integer, metadata jsonb, keyword_score double precision)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  with q as (
    select case when websearch_to_tsquery('english', query_text)::text = '' then null
           else to_tsquery('english', replace(websearch_to_tsquery('english', query_text)::text, ' & ', ' | ')) end as tsq
  )
  select c.id, c.document_id, c.source_id, c.content, c.chunk_type,
         c.file_path, c.language, c.section, c.line_start, c.line_end,
         c.page_number, c.metadata,
         ts_rank_cd(c.fts, q.tsq)::double precision as keyword_score
  from public.chunks c, q
  where q.tsq is not null and c.fts @@ q.tsq
    and (p_source_id is null or c.source_id = p_source_id)
    and (p_language is null or c.language = p_language)
    and (p_file_type is null or c.file_path ilike '%.' || p_file_type)
  order by keyword_score desc
  limit match_count;
$function$;