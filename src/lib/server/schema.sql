-- Ivory Tower schema. Plain Postgres; runs unchanged on PGlite (dev/tests)
-- and on a real Postgres (DATABASE_URL). Idempotent: safe to run on boot.

create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists space (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  title text not null,
  description text not null default '',
  visibility text not null default 'public' check (visibility in ('public','members','private')),
  license text not null default 'CC-BY-SA-4.0',
  owner_rikma_id text,                      -- a 1lev1 project id, when a rikma holds the space
  created_by uuid not null references app_user,
  created_at timestamptz not null default now()
);

create table if not exists node (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references space on delete cascade,
  kind text not null,
  current_rev int not null default 1,
  inquiry_status text check (inquiry_status in ('exploring','concluded','deadEnd','parked')),
  inquiry_note text,
  absorbed_into uuid references node,
  attributed_to text,                        -- who argued it originally (Kant, a paper…), not who typed it
  created_by uuid not null references app_user,
  created_at timestamptz not null default now()
);
create index if not exists node_space_idx on node (space_id, kind);

-- Every edit is a new revision; nothing is overwritten.
create table if not exists node_rev (
  node_id uuid not null references node on delete cascade,
  rev int not null,
  title text not null check (length(title) between 1 and 300),
  body text not null default '',
  source text,                               -- a URL / DOI / citation, mostly for evidence
  author_id uuid not null references app_user,
  created_at timestamptz not null default now(),
  primary key (node_id, rev)
);

create table if not exists edge (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references space on delete cascade,
  rel text not null,
  from_node uuid not null references node on delete cascade,   -- the child: the one responding
  to_node uuid not null references node on delete cascade,     -- the parent: what it responds to
  to_rev int,                                -- the parent's revision at the time of linking
  superseded_by uuid references edge,        -- set when a step was inserted into this edge
  created_by uuid not null references app_user,
  created_at timestamptz not null default now(),
  check (from_node <> to_node)
);
create index if not exists edge_to_idx on edge (to_node, rel) where superseded_by is null;
create index if not exists edge_from_idx on edge (from_node, rel) where superseded_by is null;

create table if not exists stance (
  user_id uuid not null references app_user on delete cascade,
  node_id uuid not null references node on delete cascade,
  value text not null check (value in ('agree','disagree','unsure')),
  public boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, node_id)
);

-- A 1lev1 member, when signed in through the shared .1lev1.com session.
alter table app_user add column if not exists lev_user_id text unique;

-- v2: documents and anchored passages ─────────────────────────────────────
-- The kind/rel vocabularies are (re)declared here so an existing database
-- picks up new values on boot; src/lib/model/types.ts is the source of truth.
alter table node drop constraint if exists node_kind_check;
alter table node add constraint node_kind_check
  check (kind in ('question','position','argument','evidence','synthesis','document'));
alter table edge drop constraint if exists edge_rel_check;
alter table edge add constraint edge_rel_check
  check (rel in ('answers','refines','supports','opposes','premise','synthesizes','arisesFrom','alternativeTo','partOf'));

-- The passage of the parent this edge responds to: {exact, prefix, suffix} (W3C TextQuoteSelector).
alter table edge add column if not exists anchor jsonb;
-- Order of a block inside its document (rel = 'partOf').
alter table edge add column if not exists ord double precision;
create index if not exists edge_doc_idx on edge (to_node, ord) where rel = 'partOf' and superseded_by is null;

-- v3: the bridge to 1lev1 rikmas ─────────────────────────────────────────
-- Work a node led to in a rikma: an open mission (or its proposal) or a process.
-- external_* are 1lev1 ids; Ivory Tower never writes to 1lev1 except as the member.
create table if not exists rikma_link (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references space on delete cascade,
  node_id uuid not null references node on delete cascade,
  rikma_id text not null,
  rikma_name text not null,
  kind text not null check (kind in ('mission','process')),
  external_type text not null,
  external_id text not null,
  mission_id text,
  title text not null,
  created_by uuid not null references app_user,
  created_at timestamptz not null default now()
);
create index if not exists rikma_link_node_idx on rikma_link (node_id);
alter table space add column if not exists owner_rikma_name text;
alter table space drop constraint if exists space_visibility_check;
alter table space add constraint space_visibility_check check (visibility in ('public','members'));

-- v4: who may contribute to a space held by a rikma ─────────────────────
-- 'anyone' (every reader) or 'members' (members of the holding rikma only).
-- A members-visibility space is members-write by construction.
alter table space add column if not exists write_policy text not null default 'anyone';
alter table space drop constraint if exists space_write_policy_check;
alter table space add constraint space_write_policy_check check (write_policy in ('anyone','members'));

-- v5: where the rikma work stands, as 1lev1 last said (ivoryWorkStatus qid).
-- A cache, refreshed when a member of that rikma opens the node; never inferred.
alter table rikma_link add column if not exists status text;
alter table rikma_link add column if not exists status_at timestamptz;
alter table rikma_link add column if not exists open_mission_id text;
