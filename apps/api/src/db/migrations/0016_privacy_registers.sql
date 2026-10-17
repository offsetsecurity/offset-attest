-- The GDPR records: what personal data the organisation handles and why, the
-- risk assessments for the risky parts, the requests people make about their
-- own data, the breaches, and the consent it collects.
--
-- GDPR is driven by data, not by controls. The question a regulator asks is
-- "show me what you do with personal data", and the answer is these lists,
-- kept up to date by the people who own each entry. Nothing here is collected
-- from other systems: every row is written by a person.
--
-- The shape follows every other register: an id, a seq for a stable
-- human-facing number, the fields, an attrs escape hatch, and the two
-- timestamps with a touch trigger.
--
-- Dates that are always worked out from another date - the next review, the
-- one-month answer date, the 72-hour notice deadline - are generated columns.
-- Stored by hand they would be wrong the moment somebody changed the date they
-- came from.

-- ── the data map: one row per processing activity (Article 30) ──────────────
create table processing_activities (
  id               text primary key,
  seq              integer not null,
  name             text not null,
  department       text not null default '',
  owner            text not null default '',
  owner_email      text not null default '',
  purpose          text not null default '',
  lawful_basis     text not null default 'Not decided yet'
                   check (lawful_basis in ('Consent', 'Contract', 'Legal obligation', 'Vital interests',
                                           'Public task', 'Legitimate interests', 'Not decided yet')),
  data_subjects    text not null default '',   -- whose data: staff, customers, visitors
  data_categories  text not null default '',   -- what data: name, address, bank details
  special_data     text not null default 'No'
                   check (special_data in ('No', 'Yes')),
  special_condition text not null default '',  -- the Article 9 condition, when special_data is Yes
  source           text not null default '',   -- where the data comes from
  storage          text not null default '',   -- systems and places it is kept
  recipients       text not null default '',   -- who it is shared with
  transfers        text not null default '',   -- outside the EU/EEA, and how that is covered
  retention        text not null default '',
  security         text not null default '',
  high_risk        text not null default 'Not assessed'
                   check (high_risk in ('Not assessed', 'No', 'Yes')),
  status           text not null default 'Draft'
                   check (status in ('Draft', 'Active', 'Retired')),
  last_reviewed    text,
  -- Twelve months after the last review, or after it was written down if
  -- nobody has reviewed it yet. Retired entries are still listed, never chased.
  next_review      text generated always as
                   (date(coalesce(last_reviewed, substr(created_at, 1, 10)), '+12 months')) virtual,
  notes            text not null default '',
  attrs            text not null default '{}',
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index processing_activities_seq_idx on processing_activities (seq);

-- Which suppliers receive or process the data for this activity.
create table activity_vendors (
  activity_id text not null references processing_activities(id) on delete cascade,
  vendor_id   text not null references vendors(id) on delete cascade,
  primary key (activity_id, vendor_id)
);

create table activity_controls (
  activity_id text not null references processing_activities(id) on delete cascade,
  control_id  text not null references controls(id) on delete cascade,
  primary key (activity_id, control_id)
);

-- ── data protection impact assessments (Article 35) ─────────────────────────
create table dpias (
  id                text primary key,
  seq               integer not null,
  title             text not null,
  activity_id       text references processing_activities(id) on delete set null,
  owner             text not null default '',
  owner_email       text not null default '',
  status            text not null default 'Screening'
                    check (status in ('Screening', 'Not needed', 'In progress', 'Approved', 'Rejected')),
  description       text not null default '',   -- what the processing is, in plain words
  -- The screening answers and the risk grid, as the questionnaire on the
  -- screen writes them. JSON, because the questions belong to the screen.
  screening_json    text not null default '{}',
  risks_json        text not null default '{}',
  necessity         text not null default '',
  minimisation      text not null default '',
  rights            text not null default '',
  residual_risk     text not null default 'Not assessed'
                    check (residual_risk in ('Not assessed', 'Low', 'Medium', 'High')),
  dpo_advice        text not null default '',
  decision          text not null default 'Not decided'
                    check (decision in ('Not decided', 'Go ahead', 'Go ahead with changes', 'Do not go ahead')),
  consult_regulator text not null default 'No'
                    check (consult_regulator in ('No', 'Yes', 'Done')),
  approved_by       text not null default '',
  approved_date     text,
  review_date       text,
  notes             text not null default '',
  attrs             text not null default '{}',
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index dpias_seq_idx on dpias (seq);

-- ── requests from individuals about their own data (Articles 15 to 22) ──────
create table subject_requests (
  id               text primary key,
  seq              integer not null,
  requester        text not null,
  contact          text not null default '',
  request_type     text not null default 'Access'
                   check (request_type in ('Access', 'Erasure', 'Correction', 'Objection', 'Restriction',
                                           'Portability', 'Stop marketing', 'Other')),
  channel          text not null default '',
  received_date    text not null,
  identity         text not null default 'Not checked'
                   check (identity in ('Not checked', 'Checked', 'Not needed')),
  extended         text not null default 'No'
                   check (extended in ('No', 'Yes')),
  extension_reason text not null default '',
  -- One month to answer; two more when the request is complex and the person
  -- was told so within the first month (Article 12(3)).
  due_date         text generated always as
                   (date(received_date, case when extended = 'Yes' then '+3 months' else '+1 month' end)) virtual,
  status           text not null default 'Open'
                   check (status in ('Open', 'Waiting for ID', 'In progress', 'Done', 'Refused')),
  owner            text not null default '',
  owner_email      text not null default '',
  completed_date   text,
  outcome          text not null default '',
  notes            text not null default '',
  attrs            text not null default '{}',
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index subject_requests_seq_idx on subject_requests (seq);
create index subject_requests_open_idx on subject_requests (status, received_date);

-- ── personal data breaches (Articles 33 and 34) ─────────────────────────────
-- Times are local wall-clock times, "2026-10-16T09:30", as the person typed
-- them. The 72 hours run from the moment the organisation became aware.
create table breaches (
  id                    text primary key,
  seq                   integer not null,
  title                 text not null,
  aware_at              text not null,
  occurred_at           text,
  regulator_deadline    text generated always as
                        (strftime('%Y-%m-%dT%H:%M', aware_at, '+72 hours')) virtual,
  description           text not null default '',
  data_categories       text not null default '',
  people_affected       text not null default '',
  special_data          text not null default 'No'
                        check (special_data in ('No', 'Yes')),
  consequences          text not null default '',
  risk_level            text not null default 'Not assessed'
                        check (risk_level in ('Not assessed', 'Unlikely to harm anyone', 'Risk to people', 'High risk to people')),
  notify_regulator      text not null default 'Not decided'
                        check (notify_regulator in ('Not decided', 'Yes', 'No')),
  regulator_notified_at text,
  regulator_reference   text not null default '',
  late_reason           text not null default '',
  notify_people         text not null default 'Not decided'
                        check (notify_people in ('Not decided', 'Yes', 'No')),
  people_notified_date  text,
  decision_reason       text not null default '',
  containment           text not null default '',
  status                text not null default 'Open'
                        check (status in ('Open', 'Contained', 'Closed')),
  owner                 text not null default '',
  owner_email           text not null default '',
  notes                 text not null default '',
  attrs                 text not null default '{}',
  created_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index breaches_seq_idx on breaches (seq);

-- ── consent records (Article 7) ─────────────────────────────────────────────
-- One row per place consent is collected, not per person: what people were
-- asked, how, and where the individual answers are kept as proof.
create table consents (
  id                text primary key,
  seq               integer not null,
  purpose           text not null,
  activity_id       text references processing_activities(id) on delete set null,
  method            text not null default '',
  wording           text not null default '',
  notice_version    text not null default '',
  evidence_location text not null default '',
  withdraw_method   text not null default '',
  started_date      text,
  status            text not null default 'Active'
                    check (status in ('Active', 'Paused', 'Ended')),
  owner             text not null default '',
  owner_email       text not null default '',
  last_reviewed     text,
  next_review       text generated always as
                    (date(coalesce(last_reviewed, substr(created_at, 1, 10)), '+12 months')) virtual,
  notes             text not null default '',
  attrs             text not null default '{}',
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index consents_seq_idx on consents (seq);

-- ── suppliers as processors (Articles 28 and 44 to 49) ──────────────────────
alter table vendors add column privacy_role text not null default 'Processor';
alter table vendors add column personal_data text not null default '';
alter table vendors add column dpa_status text not null default 'Missing';
alter table vendors add column dpa_date text;
alter table vendors add column transfer text not null default 'No';
alter table vendors add column transfer_countries text not null default '';
alter table vendors add column transfer_safeguard text not null default 'Not applicable';

-- ── privacy notices sit in the documents register, with a kind ──────────────
alter table policies add column doc_type text not null default 'Policy';
alter table policies add column audience text not null default '';

-- ── updated_at maintenance, as for every other table ────────────────────────
create trigger processing_activities_touch after update on processing_activities for each row
when new.updated_at = old.updated_at
begin update processing_activities set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;

create trigger dpias_touch after update on dpias for each row
when new.updated_at = old.updated_at
begin update dpias set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;

create trigger subject_requests_touch after update on subject_requests for each row
when new.updated_at = old.updated_at
begin update subject_requests set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;

create trigger breaches_touch after update on breaches for each row
when new.updated_at = old.updated_at
begin update breaches set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;

create trigger consents_touch after update on consents for each row
when new.updated_at = old.updated_at
begin update consents set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
