# SOC reports in plain words

A SOC report is a CPA firm's independent opinion on the controls at a service
organisation: a company whose service other companies rely on. Customers ask
for one so they do not have to audit you themselves.

## The three reports

| | SOC 1 | SOC 2 | SOC 3 |
|---|---|---|---|
| About | Controls that affect your customers' financial reporting | Security, and optionally availability, processing integrity, confidentiality and privacy | The same examination as a SOC 2 |
| Measured against | Control objectives you write yourself | The AICPA's Trust Services Criteria | The Trust Services Criteria |
| Who reads it | Your customers and their financial auditors | Customers and prospects, under NDA | Anyone. It is public |
| Detail | Full description and test results | Full description and test results | A short summary: no test details |
| Types | Type I or Type II | Type I or Type II | Issued with a Type II |

## SOC 2: the Trust Services Criteria

There are five categories. **Security** is always in, and its criteria are
called the common criteria because the other four build on them.

- **CC1 to CC5** follow the COSO framework: control environment, communication,
  risk assessment, monitoring and control activities.
- **CC6 to CC9** are the technical and operational core: access, system
  operations, change management, vendors and business continuity.
- **Availability (A1)**: capacity, backups and recovery.
- **Confidentiality (C1)**: knowing what is confidential and disposing of it.
- **Processing integrity (PI1)**: processing that is complete, accurate and on time.
- **Privacy (P1 to P8)**: notice, consent, use, retention, access and disclosure
  of personal information.

The criteria say what must be true, not how. You choose your own controls to
meet them; each criterion in **Criteria** suggests what usually works.

## SOC 1: control objectives

A SOC 1 has no fixed list. You write control objectives for the parts of your
service that touch customers' financial figures, such as "client transactions
are processed completely and accurately", and the CPA firm tests the controls
you put against each one. Attest ships twelve common objectives to start from.

## Who is in the report

Vendors that run controls for you, such as your cloud host, are **subservice
organisations**. Your report either includes their controls or, more often,
carves them out and relies on their own SOC report. Either way you must review
them. Customers have controls to run too, called **complementary user entity
controls**, and your report lists them.
