# Working with your auditor

## Choosing a CPA firm

Only a licensed CPA firm can issue a SOC report. Ask for references from
companies of your size and industry, ask who will actually do the work, and
ask what their request list looks like. A firm that also built your controls
cannot audit them.

## Before fieldwork

Send the firm:

- **The system description**: the system, its boundaries and your service
  commitments, from **Scope**.
- **The SOC 2 criteria matrix** from **Reports**: every criterion in scope,
  its owner, status, evidence and last test. Add the SOC 1 objectives matrix
  for a SOC 1.
- **Your vendor list** with each subservice organisation's SOC report.
- **Policies**, with approval and review dates.

Give the firm an **Auditor** account in **Users**. It can read everything and
change nothing, and every report it downloads is in the audit trail.

## During fieldwork

The auditor sends a request list: evidence by criterion, and for a Type II,
samples drawn from populations you provide, such as "all production changes in
the period" or "everyone who left". Evidence linked to criteria in Attest
answers most of it directly.

Answer each request with exactly what was asked for, from inside the period.
Extra material slows things down.

## Exceptions

An exception is a sample where a control did not work: a leaver whose access
was removed late, a change deployed without review. Exceptions are listed in
the report with your response.

When the auditor raises one, record it in **Exceptions** with the cause and the
fix, and link the criterion. Next year's auditor will look for it first.

## After the report

Record it in **SOC reports**: date, opinion and exceptions. Export the SOC 3
draft from **Reports**, agree the final wording with the firm, and publish it
once they have issued it. Then set the date the next report is due.
