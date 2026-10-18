-- SOC reports: each SOC 1, SOC 2 or SOC 3 report the company is working
-- towards or has received.
--
-- One row per report, not per audit firm or per year: a Type II report has
-- its own observation period, and the next one starts the day after. The
-- dates are what customers ask about ("is your report current?"), so they
-- are columns, not notes.

create table engagements (
  id            text primary key,
  seq           integer not null,
  title         text not null,
  report        text not null default 'SOC 2'
                check (report in ('SOC 1', 'SOC 2', 'SOC 3')),
  report_type   text not null default 'Type II'
                check (report_type in ('Type I', 'Type II', 'Not applicable')),
  status        text not null default 'Planning'
                check (status in ('Planning', 'Readiness', 'Observation period', 'Fieldwork', 'Report issued', 'Cancelled')),
  auditor       text not null default '',
  -- Security is always in a SOC 2; the others are chosen.
  categories    text not null default 'Security',
  -- Type I: period_end is the "as of" date and period_start stays empty.
  period_start  text,
  period_end    text,
  report_date   text,
  opinion       text not null default 'Not yet issued'
                check (opinion in ('Not yet issued', 'Unmodified', 'Qualified', 'Adverse', 'Disclaimer')),
  exceptions    text not null default '',
  next_due      text,
  owner         text not null default '',
  owner_email   text not null default '',
  notes         text not null default '',
  attrs         text not null default '{}',
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index engagements_seq_idx on engagements (seq);
create index engagements_due_idx on engagements (status, next_due);

create table engagement_controls (
  engagement_id text not null references engagements(id) on delete cascade,
  control_id    text not null references controls(id) on delete cascade,
  primary key (engagement_id, control_id)
);
