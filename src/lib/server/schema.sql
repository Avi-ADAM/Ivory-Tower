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
  kind text not null check (kind in ('question','position','argument','evidence','synthesis')),
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
  rel text not null check (rel in ('answers','refines','supports','opposes','premise','synthesizes','arisesFrom')),
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
