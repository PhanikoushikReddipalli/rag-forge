-- Extensions
create extension if not exists vector;

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ knowledge_sources ============
create type public.source_status as enum ('pending','processing','indexed','failed');
create type public.source_kind as enum ('github','pdf','markdown','txt','demo');

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  source_type public.source_kind not null,
  source_url text,
  status public.source_status not null default 'pending',
  is_demo boolean not null default false,
  stage text,
  progress int not null default 0,
  error_message text,
  document_count int not null default 0,
  chunk_count int not null default 0,
  config jsonb not null default '{}'::jsonb,
  last_indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.knowledge_sources (user_id, created_at desc);
grant select, insert, update, delete on public.knowledge_sources to authenticated;
grant all on public.knowledge_sources to service_role;
alter table public.knowledge_sources enable row level security;
create policy "ks_all_own" on public.knowledge_sources for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ documents ============
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  content text not null,
  language text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.documents (source_id);
create index on public.documents (user_id);
grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy "docs_all_own" on public.documents for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ chunks ============
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  content text not null,
  embedding vector(3072),
  embedding_model text,
  chunk_index int not null default 0,
  chunk_type text not null default 'paragraph',
  file_path text,
  language text,
  section text,
  line_start int,
  line_end int,
  page_number int,
  token_estimate int,
  metadata jsonb not null default '{}'::jsonb,
  fts tsvector generated always as (to_tsvector('english', coalesce(content,''))) stored,
  created_at timestamptz not null default now()
);
create index on public.chunks (document_id);
create index on public.chunks (source_id);
create index chunks_fts_idx on public.chunks using gin (fts);
create index chunks_embedding_idx on public.chunks using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);
grant select, insert, update, delete on public.chunks to authenticated;
grant all on public.chunks to service_role;
alter table public.chunks enable row level security;
create policy "chunks_all_own" on public.chunks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ conversations / messages ============
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null default 'New conversation',
  source_id uuid references public.knowledge_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.conversations (user_id, updated_at desc);
grant select, insert, update, delete on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create policy "conv_all_own" on public.conversations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  mode text,
  citations jsonb not null default '[]'::jsonb,
  retrieval_log_id uuid,
  grounded boolean,
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);
grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "msg_all_own" on public.messages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ retrieval_logs ============
create table public.retrieval_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  request_id text not null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  source_id uuid references public.knowledge_sources(id) on delete set null,
  query text not null,
  mode text not null default 'ask',
  retrieval_method text not null default 'hybrid',
  filters jsonb not null default '{}'::jsonb,
  embedding_model text,
  embedding_dimensions int,
  semantic_results jsonb not null default '[]'::jsonb,
  keyword_results jsonb not null default '[]'::jsonb,
  hybrid_results jsonb not null default '[]'::jsonb,
  reranked_results jsonb not null default '[]'::jsonb,
  final_context jsonb not null default '[]'::jsonb,
  reranker_used boolean not null default false,
  reranker_model text,
  timings jsonb not null default '{}'::jsonb,
  latency_ms int,
  generation_status text,
  answered boolean,
  error_message text,
  created_at timestamptz not null default now()
);
create index on public.retrieval_logs (user_id, created_at desc);
grant select, insert, update, delete on public.retrieval_logs to authenticated;
grant all on public.retrieval_logs to service_role;
alter table public.retrieval_logs enable row level security;
create policy "rl_all_own" on public.retrieval_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ evaluation ============
create table public.evaluation_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  source_id uuid references public.knowledge_sources(id) on delete cascade,
  question text not null,
  expected_answer text,
  expected_sources text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.evaluation_questions (user_id, created_at desc);
grant select, insert, update, delete on public.evaluation_questions to authenticated;
grant all on public.evaluation_questions to service_role;
alter table public.evaluation_questions enable row level security;
create policy "eq_all_own" on public.evaluation_questions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  run_id uuid not null,
  question_id uuid not null references public.evaluation_questions(id) on delete cascade,
  generated_answer text,
  retrieved_sources text[] not null default '{}',
  hit boolean,
  recall_at_k numeric,
  precision_at_k numeric,
  mrr numeric,
  context_relevance numeric,
  faithfulness numeric,
  answer_relevance numeric,
  latency_ms int,
  error_message text,
  created_at timestamptz not null default now()
);
create index on public.evaluation_results (user_id, created_at desc);
create index on public.evaluation_results (run_id);
grant select, insert, update, delete on public.evaluation_results to authenticated;
grant all on public.evaluation_results to service_role;
alter table public.evaluation_results enable row level security;
create policy "er_all_own" on public.evaluation_results for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ retrieval functions ============
create or replace function public.match_chunks(
  query_embedding vector(3072),
  match_count int default 10,
  p_source_id uuid default null,
  p_language text default null,
  p_file_type text default null
)
returns table (
  id uuid, document_id uuid, source_id uuid, content text, chunk_type text,
  file_path text, language text, section text, line_start int, line_end int,
  page_number int, metadata jsonb, similarity double precision
)
language sql stable security invoker set search_path = public as $$
  select c.id, c.document_id, c.source_id, c.content, c.chunk_type,
         c.file_path, c.language, c.section, c.line_start, c.line_end,
         c.page_number, c.metadata,
         1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) as similarity
  from public.chunks c
  where c.embedding is not null
    and (p_source_id is null or c.source_id = p_source_id)
    and (p_language is null or c.language = p_language)
    and (p_file_type is null or c.file_path ilike '%.' || p_file_type)
  order by c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  limit match_count;
$$;
grant execute on function public.match_chunks(vector, int, uuid, text, text) to authenticated, service_role;

create or replace function public.keyword_search_chunks(
  query_text text,
  match_count int default 10,
  p_source_id uuid default null,
  p_language text default null,
  p_file_type text default null
)
returns table (
  id uuid, document_id uuid, source_id uuid, content text, chunk_type text,
  file_path text, language text, section text, line_start int, line_end int,
  page_number int, metadata jsonb, keyword_score double precision
)
language sql stable security invoker set search_path = public as $$
  select c.id, c.document_id, c.source_id, c.content, c.chunk_type,
         c.file_path, c.language, c.section, c.line_start, c.line_end,
         c.page_number, c.metadata,
         ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text))::double precision as keyword_score
  from public.chunks c
  where c.fts @@ websearch_to_tsquery('english', query_text)
    and (p_source_id is null or c.source_id = p_source_id)
    and (p_language is null or c.language = p_language)
    and (p_file_type is null or c.file_path ilike '%.' || p_file_type)
  order by keyword_score desc
  limit match_count;
$$;
grant execute on function public.keyword_search_chunks(text, int, uuid, text, text) to authenticated, service_role;
