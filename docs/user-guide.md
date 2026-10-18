# Offset Attest user guide

How to use Offset Attest to get ready for a SOC 1, SOC 2 or SOC 3 report, get
through the audit, and keep the report current. The same pages ship inside the
product under **Help** and **Documentation**.

## What do you want to do?

| I want to… | Go to |
|---|---|
| Know what to do next | [Get ready](#get-ready) |
| Decide what the report covers | [Scope](#scope) |
| Work through the criteria | [Criteria](#criteria) |
| Prove a control works | [Evidence](#evidence) |
| Test a control myself | [Testing](#testing) |
| Record a SOC report and its period | [SOC reports](#soc-reports) |
| Keep track of vendors and their SOC reports | [Vendors](#vendors) |
| Send the auditor what they need | [Reports](#reports) |
| Publish a SOC 3 | [Reports](#reports) |

## What it is

A SOC report is a CPA firm's independent opinion on the controls at a service
organisation. **SOC 2** covers security and, if you choose, availability,
processing integrity, confidentiality and privacy, measured against the
AICPA's Trust Services Criteria. **SOC 1** covers controls that affect your
customers' financial reporting, measured against control objectives you write.
**SOC 3** is a short, public version of a SOC 2.

A **Type I** report tests that controls are designed properly on one date. A
**Type II** also tests that they worked throughout a period, usually 3 to 12
months, by sampling the evidence. Customers usually want a Type II.

Attest does not issue reports. Only a licensed CPA firm can. Attest is where
you prepare and where the evidence lives.

## Get ready

The plan, in eight stages: set the product up, decide what the report covers,
assess your risks, put the controls in place, collect the evidence, test your
own controls, go through the audit, and get the report and keep it current.

Most steps tick themselves from your records: a step that asks for every
criterion to have an owner turns green when they all do. The rest you mark
done yourself, or mark as not applying to you.

## Scope

At the top, two boxes that go straight into the SOC 3 draft:

- **The system and its boundaries**: the service customers buy, and the
  infrastructure, software, people, procedures and data behind it.
- **Service commitments and system requirements**: what you promise
  customers, and what the system must do to keep those promises.

Below, every criterion and SOC 1 objective, **In** or **Out**. Security is
always in a SOC 2. Rule out the categories you are not reporting on, and the
SOC 1 objectives if you are not doing a SOC 1, with a one-line reason each. An
exclusion with no reason is flagged in red.

## Criteria

The 61 SOC 2 criteria, grouped by category (CC1 to CC9, Availability,
Confidentiality, Processing integrity, Privacy), then the SOC 1 control
objectives. Open one to see:

- **What this is**: why the criterion exists, in plain words.
- **What to do**: the controls that usually meet it.
- **Records to keep**: the evidence the auditor will ask for.
- What the auditor tests.

Give each criterion in scope an owner, a status and a due date. The panel
lists what is still missing, such as no owner, no evidence or never tested,
with a button to fix each.

## Evidence

Screenshots, exports, tickets and documents, each with the date it was
produced and the criteria it supports. For a Type II, a recurring control
needs one piece of evidence each time it runs: four quarterly access reviews,
twelve monthly scans.

## Testing

On each criterion, **Record a test**: the date, who tested it, the result
(Pass, Partial or Fail) and what you looked at. Do what the auditor will do:
pick a sample and check the control worked for each item. The latest result
counts. A Partial or Fail stays flagged until a later test passes; raise it in
**Exceptions** so the fix is tracked.

## SOC reports

One record per report. Choose SOC 1, SOC 2 or SOC 3 and Type I or Type II, then
fill in the CPA firm, the categories in scope and the period. A Type I has only
an "as of" date; a Type II has a start and an end. When the report is issued,
set the status, the date, the opinion and any exceptions, and set **Next report
due** so you are reminded before the gap opens.

Attest refuses a SOC 3 marked Type I, a period that ends before it starts, and
an issued report with no date or opinion.

## Vendors

Every supplier that touches the system or its data. Mark the ones you rely on
for controls, usually your cloud host, as High: these are your subservice
organisations. For each, record the assurance they gave (usually their own SOC
2 report) and the date you last assessed them. Get ready checks that every
High vendor has been reviewed in the last 12 months.

## Reports

PDFs, with your organisation name and logo, set at the top of the Reports
screen:

- **SOC 2 criteria matrix**: every criterion, owner, status, evidence count
  and last test, by category. Send it to your CPA firm before fieldwork.
- **SOC 1 control objectives matrix**: the same for your SOC 1 objectives.
- **SOC 3 report (draft)**: management's assertion, the auditor's section
  (which the firm writes), the system and its boundaries, and the categories
  covered. Its first page lists what must be done before it can be published,
  and disappears when the list is empty.
- The readiness plan, gap report, risk register and evidence register.

## Day to day

See **Using it day to day** in Documentation. In short: add evidence the day a
recurring control runs, look at the Dashboard every week, test a sample of
controls every quarter, and review policies, vendors and the risk assessment
every year.

## Roles

| Role | Can do |
|---|---|
| Administrator | Everything, plus adding people and changing settings |
| Contributor | Read and change all records |
| Auditor | Read everything, including the audit trail. Change nothing. Give this to your CPA firm |
| Read only | Read everything. Change nothing |
