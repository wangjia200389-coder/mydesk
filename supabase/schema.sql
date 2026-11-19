-- MyDesk 多设备同步：在 Supabase 项目 → SQL Editor 里整段粘贴执行即可。
-- 说明：一个同步码对应一行快照；payload 是端到端加密后的密文，服务端只存密文。
-- 隔离模型是「能力令牌」：identity_id 由同步码派生后截取 16 字节（128 位）。
-- 同步码本身来自 24 字节随机源（192 位熵）；PBKDF2 派生出的 AES-GCM 密钥是 256 位，
-- 但密钥长度不等于同步码的熵，不要写成「256 位熵」。
-- 前端请求带 x-identity-id 头，RLS 只允许读写自己那一行。
-- 注意：文件哈希、大小等元信息仍是明文；知道 identity_id 的一方可以读写对应密文，
-- 但这不代表自动拿到解密密钥。这不是多租户强鉴权；
-- 若将来要公开给多人用，应换成 Supabase Auth + auth.uid()。

create table if not exists public.snapshots (
  identity_id   text primary key,
  payload       text not null,
  revision      bigint not null default 1,
  device_id     text not null,
  updated_at    timestamptz not null default now(),
  schema_version int not null default 1
);

alter table public.snapshots enable row level security;

drop policy if exists "identity scoped" on public.snapshots;
create policy "identity scoped" on public.snapshots
  for all to anon
  using (
    identity_id = coalesce(
      current_setting('request.headers', true)::json->>'x-identity-id', ''
    )
  )
  with check (
    identity_id = coalesce(
      current_setting('request.headers', true)::json->>'x-identity-id', ''
    )
  );

grant select, insert, update on public.snapshots to anon;

-- 照片 / 知识库原始文件：加密后按「一个文件一行」存，按 sha256 只传变化的那一个。
-- 不用 Storage bucket，省掉建 bucket 和配对象策略，PostgREST 直接读写即可。
create table if not exists public.files (
  identity_id text not null,
  file_id     text not null,
  kind        text not null,
  payload     text not null,
  sha256      text not null,
  size_bytes  bigint not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (identity_id, file_id)
);

create index if not exists files_identity_idx on public.files (identity_id);

alter table public.files enable row level security;

drop policy if exists "files identity scoped" on public.files;
create policy "files identity scoped" on public.files
  for all to anon
  using (
    identity_id = coalesce(
      current_setting('request.headers', true)::json->>'x-identity-id', ''
    )
  )
  with check (
    identity_id = coalesce(
      current_setting('request.headers', true)::json->>'x-identity-id', ''
    )
  );

grant select, insert, update on public.files to anon;
