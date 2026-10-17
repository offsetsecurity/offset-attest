# Using Offset

For the people who use it day to day. If you are installing it, read
[INSTALL.md](../INSTALL.md) instead.

You do not need to read this end to end. Find what you are trying to do.

| I want to | Go to |
|---|---|
| Understand what this is for | [What it does](#what-it-does) |
| Sign in the first time | [Getting in](#getting-in) |
| Know what the front page is telling me | [Dashboard](#dashboard) |
| Be told what to do next | [Get ready](#get-ready) |
| Write down how we use personal data | [Data map](#data-map) |
| Assess a risky use of data | [DPIAs](#dpias) |
| Log a request from a person about their data | [Requests](#requests) |
| Log a breach and meet the 72 hours | [Breaches](#breaches) |
| Record processors, DPAs and transfers | [Processors and suppliers](#processors-and-suppliers) |
| Record consent and privacy notices | [Consent records](#consent-records) |
| Track the GDPR duties | [Duties](#duties) |
| Attach proof to a duty | [Evidence on a control](#evidence-on-a-control) |
| Set deadlines and chase people | [Due dates and reminders](#due-dates-and-reminders) |
| Attach proof | [Evidence](#evidence) |
| Track risks | [Risks](#risks) |
| Plan a change safely | [Tasks](#the-other-registers) |
| Start a register from ready-made examples | [Sample library](#sample-library) |
| See everything that is due | [Calendar](#calendar) |
| See what is left to do | [Gap analysis](#gap-analysis) |
| Read the guides inside the product | [Help and Documentation](#help-and-documentation) |
| Get data in or out as a spreadsheet | [Spreadsheets](#spreadsheets) |
| Produce something for a regulator | [Reports](#reports) |
| Add a colleague | [Users](#users) |
| See who changed what, or give an auditor the record | [Audit trail](#audit-trail) |
| Take or restore a backup | [Backups](#backups) |
| Stop the browser saying "Not secure" | [Settings](#settings) |

---

## What it does

It keeps your GDPR records in one place, so that when a regulator, a customer
or a person asks "what do you do with personal data, and can you show me"
there is an answer.

**Offset Accord** covers the **EU GDPR**. Most of the work is in the records:
the data map, DPIAs, requests, breaches, processors and consent. The 37 duties
from the Regulation sit beside them as a checklist, under **Duties**.

The menu is on the left, in groups. Documentation and Help are at the bottom.
To make more room for the page, press the arrow at the top of the menu: it
shrinks to icons, and pointing at an icon shows its name. Press the arrow again
to bring the names back. Your browser remembers which way you left it.

**This does not make you compliant, and it is not legal advice.** It is a
place to record and show your own work, and to be reminded when something is
due. Every record is written by a person; it does not scan your other systems.

---

## Getting in

Your administrator gives you a username and a password, and the address, which
looks like `https://offset.yourcompany.local` or `http://localhost:8080`.

You may also get an email saying an account has been created. **It will not
contain your password.** That is deliberate: email is not a safe place to keep
one. Ask whoever set up your account.

### If you forget your password

**Everyone except administrators:** ask an administrator. They can set a new one
for you under **Users**.

**Administrators:** click **Forgot password?** on the sign-in page and enter
your username or email address. A temporary password is emailed to you.

- It works **once**, for **30 minutes**.
- Signing in with it takes you straight to **Choose a new password**. Nothing
  else opens until you have.
- Your old password keeps working until then, so if you remember it after all,
  just use it.
- Everywhere else you were signed in is signed out once the new password is set,
  and you get an email saying the password was changed.

The page says the same thing whatever you type, whether or not the account
exists. That stops anyone using it to find out who your administrators are. If
no email arrives, email may not be set up: ask another administrator, or see
**Locked out** in `INSTALL.md`.

To change your password when you do know it, use **Change password** at the top
right of any screen.

### If the browser warns you

**"Your connection is not private"** or **"Not secure"** means the server has
no certificate your browser trusts. Do not click through. Tell your
administrator: they can fix it for everyone in a few minutes, under
**Settings → HTTPS certificate**, with a certificate from your IT team. It costs
nothing.

### What you are allowed to do

Four roles. Yours is shown under your name, top right.

| Role | Can do |
|---|---|
| **Administrator** | Everything, plus adding people and changing settings |
| **Contributor** | Read and change all compliance data. Most people. |
| **Auditor** | Read everything, including the audit trail. Cannot change anything. |
| **Read only** | Read everything. Cannot change anything. |

If a button is missing or a change is refused, that is your role, not a fault.

---

## Get ready

If you have never done this before, start here.

It is a plan in 7 stages, from setting the product up to being able to show
a regulator your records.
Each stage opens into a short list of steps, and each step says three things:
what to do, why it matters, and a button that takes you to the screen where you
do it.

### Your next step

The box with the blue border, under the stages, is the one thing to do now: the
first step not yet done, in the order of the plan. It says what to do and why,
with the same buttons as everywhere else: **Take me there**, **Assign it** and
**Does not apply to us**. Underneath, **After that** names the two steps that
follow.

**Nearly there** lists checks that are almost passing, such as "91 of 92 that
apply have an owner". Each is usually one or two fixes. It only appears when
there is something nearly done.

The golden thread box says how many links between your risks, what treats them
and the proof need fixing. Click it to open the Golden thread tab on Risks.

The page's longer introduction is behind **How this works**, at the top.

### Green on its own, or ticked by you

Every step is one of two kinds, and it says which:

- **Checked for you.** The product looks at its own data. "Score every control"
  goes green when they are all scored; until then it tells you how far off you
  are, like "104 of 159 answered". You cannot tick these by hand, and you do not
  need to.
- **Ticked by you.** Things no software can see: whether your board approved a
  policy, whether staff actually follow it, whether somebody was made
  accountable. You tick these, and the product records who ticked and when.

The difference is on purpose. A plan that claimed to verify "get management to
approve this" would be lying to you.

### Doing them out of order

Nothing is locked. The numbers are the order most organisations find easiest,
not a rule. If you want to write your policies before assessing anything, click
stage 4 and do it. The rings along the top show where everything stands:
each one fills as its steps are done, and turns solid green with a tick when the
stage is finished. The stage suggested next says **next** under it.

### If something does not apply to you

Any step can be excluded, and the product asks why. Excluded steps stop counting
against you — a stage of four steps with one excluded is finished when the other
three are done.

The same is true of controls. Open one and there is **Does this apply to you?**
near the top. Say no, write the reason, and it comes out of your average, your
percentage and your charts. Your score is kept, so if you change your mind you
get the assessment back rather than doing it again.

**Be strict with yourself.** "We have no payment systems" is a reason. "We have
not got round to it" is not — that one is just outstanding, and an assessor can
tell the difference at a glance.

### Printing it

The **Readiness plan** report puts the whole thing on paper: where each stage
stands, what is still to do, what you excluded and why, and who decided each
one. It is the document to take to your management when nobody has asked you
for a report yet.


## Dashboard

The front page. The top half is about your GDPR records.

**Data map**, **Open requests**, **Open breaches** and **Processors**: four
figures, each linking to its screen. The Processors note goes red when a
processor has no signed agreement.

**Needs attention** is the list to read every week. It shows:

- **Late**, in red: a request past its answer date, a breach past its 72 hours,
  a data map entry not reviewed for over 12 months
- **Due soon**, in amber: anything due within a week
- **Missing**, in grey: a high-risk entry with no DPIA, a processor with no
  signed DPA, a transfer outside the EU with nothing to cover it, an entry in
  use with no lawful basis

Click a row to go to its screen.

Below that, **GDPR duties**: how many duties are in place, open risks, and
evidence, with charts by area.

Every figure is worked out live from the same data as the screens.

---

## Data map

Every way you use personal data, one row each. GDPR calls this the **record of
processing activities** (Article 30). It is the first thing a regulator asks
for, and everything else builds on it.

Each entry says what you do, which **department** does it, the **purpose**,
the **lawful basis**, whose data and what data, where it comes from, where it
is kept, who it is shared with, whether it leaves the EU, **how long you keep
it**, how it is protected, and an **owner**.

Two tabs help you fill it in:

- **Templates** — 22 common activities, already filled in: recruitment,
  payroll, customer orders, marketing lists, CCTV, website analytics and more.
  Tick the ones you do and press **Add**.
- **Questionnaire** — go round each department with this. Pick the
  department, answer yes or no to plain questions such as "Do you use CCTV
  cameras?", name the person answering, and add anything else they do. Every
  Yes becomes an entry owned by that person.

Everything added this way is a **Draft**. Open it, correct anything that is not
true for you, and set it to **Active**.

**High risk?** — set Yes or No for every entry. Yes means it needs a DPIA, and
the list shows "Yes · no DPIA" in red until it has one.

**Last reviewed** — set it to today after checking an entry. Twelve months
later the owner is emailed, and the dashboard shows it as late until somebody
reviews it again.

---

## DPIAs

A DPIA (data protection impact assessment) looks at a risky use of personal
data **before** you start. Link each one to its data map entry.

1. **Screening.** Nine yes-or-no questions about the signs of high risk. Two or
   more Yes answers means a DPIA is needed; the box says so as you answer. If
   none apply, set the status to **Not needed** and save: the answers stay as
   your reason.
2. **Describe it.** Why it is needed, how you keep data to the minimum, and how
   people are told and can use their rights.
3. **Score the risks.** For each risk to people, pick how likely and how severe.
   Write what you will do about it, then the risk **left over**. The worst
   left-over risk fills in the result.
4. **Decide.** Record the DPO's advice and the decision. If high risk is left
   over, consult the regulator first (Article 36); a DPIA cannot be approved
   with high risk left over until **Consult the regulator?** says Done.

Set a **review date**; the owner is reminded on it.

---

## Requests

Requests from people about their own data: to see it, correct it, delete it,
restrict it, take it elsewhere, object, or stop marketing.

Log each one the day it arrives. The **received** date starts the clock, and
the list shows how many days are left: green, amber in the last week, red
when late.

You have **one month**. For a complex request you may take two more months, but
only if you tell the person, with the reason, within the first month. Set
**Extended** to Yes and write the reason; the answer date moves.

Before you close a request as Done or Refused, write what you did, or why you
refused, in **What you did**.

---

## Breaches

Every personal data breach, including small ones such as an email sent to the
wrong person.

Log it as soon as you know. **Became aware at** starts the 72-hour clock, and
the list counts down the hours to telling the regulator.

Then record what happened, the data and people affected, what you did to
contain it, and the risk to people. Make two decisions:

- **Tell the regulator?** Yes, unless the breach is unlikely to harm anyone.
  Record when you told them and their reference. If you were late, say why.
- **Tell the people affected?** Yes, if it is high risk to them.

**Write down why** for both. GDPR asks for this on every breach, including the
ones you do not report, so a breach cannot be closed without it.

---

## Processors and suppliers

Everyone outside the organisation who sees or handles personal data for you.

**Role under GDPR** — a **processor** handles data only on your instructions,
like a payroll company or a cloud host. A **separate controller** decides for
itself, like a bank or the tax office.

**Data processing agreement (DPA)** — every processor needs one (Article 28).
Attach the signed copy and set the status to **Signed**.

**Outside the EU** — say whether data is sent or seen outside the EU/EEA, to
which countries, and what covers it, such as standard contractual clauses.
A transfer with nothing to cover it shows on the dashboard.

The Sample library tab has common suppliers to start from.

---

## Consent records

One row per place you ask for consent, not per person: the newsletter sign-up
form, the cookie banner. Record the exact wording people see, how it is
collected, where each person's answer is kept, and how they withdraw. Attach a
screenshot.

Like the data map, each record is chased 12 months after it was last reviewed.

Privacy notices live under **Notices and policies**, with the kind set to
**Privacy notice**. Change the version number when you change a notice, and the
old version is kept in its history.

---

## Duties

Every GDPR duty, one row each. The menu calls them Duties.

**Click a row to open the duty.** At the top is what it means in plain
words: what it is, what to do about it, and what an assessor or auditor will
look for. It also lists the records that prove it.

### The four statuses

| Status | Means |
|---|---|
| **Not Started** | Nothing done yet |
| **In Progress** | Being worked on |
| **Implemented** | Done and operating |
| **Not Applicable** | Does not apply to you |

**Not Applicable needs a reason.** Write why in the justification. "We offer no online
services to children" is a good reason. Blank is not, and an auditor will
ask about every single one.

Not Applicable controls come out of your readiness percentage. That is correct,
and it is also how a percentage gets dishonest — if you mark things Not
Applicable to make the number look better, the number stops meaning anything.

### Working through them

Change the status and the owner straight in the list. No save button; it saves
as you go, and puts it back if the server refuses.

Click a row for the detail: notes, what evidence is attached, related risks.

Filter by status, by theme or function, or search. The usual first job is
filtering to Not Started and giving each one an owner.

**Give everything an owner.** A control with nobody's name against it is one
nobody is doing.

---

## Evidence on a control

Anything you mark as in place, you are claiming is defined, approved, in use
and monitored. An assessor will ask you to show it. Attach it while you are looking
at the control, rather than trying to remember later.

Open a control and there is an **Evidence** panel. Three ways to add something:

| Button | Use it when |
|---|---|
| **Upload a file** | You have the document on your computer. It is stored, named after the file, and linked to this control in one step |
| **Link something I already have** | You recorded it earlier against another control. Search and pick it |
| **Record it without a file** | The proof exists but not as a file — signed minutes in a cabinet, a report in another system. Record what it is and who owns it |

**It is the same evidence as the Evidence tab.** Not a copy. Attach something
here and it appears there; link it there and it appears here. One item can
support many controls, which is normal — one approved policy is evidence for a
dozen of them.

**Unlink** removes it from this control only. The evidence itself is kept.

---

## Due dates and reminders

Each control can carry a deadline and the address of whoever owns it. Open a
control and you will find them under Owner:

- **Due by** — when the work should be finished
- **Email reminders to** — where the chasing goes

**Both are needed, or nothing happens.** A date with nobody to tell, and an
address with no deadline, are each harmless on their own. That is deliberate.
The product should not start emailing your colleagues because somebody typed an
address once.

### What gets sent

Once a day, each person gets **one email about their own controls only** —
never a long list of everyone's work, which is how reminders end up in a filter.

It lists anything overdue first, then anything due within the next seven days,
with the reference, the deadline and the current status of each.

To stop the emails for a control, clear the address on it.

### On the register

The **Due** column shows the date. It turns amber as the deadline approaches and
red once it has passed, so you can see the pressure without opening anything.

The date is set on the control rather than edited in the list, on purpose:
deciding to start emailing a colleague deserves the screen where the
explanation sits next to it.

---

## Evidence

Proof. Where most of the real value is, and where most programmes fall down.

Each item records what the proof is, who owns it, when it was collected, and
which controls it supports.

### Freshness

Evidence goes out of date. The colour tells you how far:

| | Age |
|---|---|
| **Fresh** | within 30 days |
| **Ageing** | 30–60 days |
| **Due** | 60–90 days |
| **Stale** | older than 90 days |
| **No date** | never recorded |

Work from Stale downwards. A firewall review from eighteen months ago proves
what was true eighteen months ago.

### Attaching the document

Click **Attach a file** in the Document column. Up to 25 MB.

The file is stored with the record, and a checksum is kept so you can tell
later whether it changed.

**Attach the actual thing.** A row saying "firewall review" is a claim. The
review itself is evidence. When an auditor says "show me", one of those works.

Click the filename to download it. **Remove** takes the file away and keeps the
record.

### Linking to controls

Link each item to the controls it supports. This is what makes the **Evidence
gaps** figure work, and what lets a report say which controls are proven.

One document often supports several controls. Link it to all of them.

---

## Risks

Your risk register, with a heat map.

Score each risk on **likelihood** and **impact**, 1 to 5. Multiplied together:

| Score | Band |
|---|---|
| 20 and above | **Critical** |
| 12 to 19 | **Elevated** |
| Below 12 | **Acceptable** |

Record an inherent score — before your controls — and a residual score after
them. The gap between the two is what your controls are worth, which is a
question you will eventually be asked.

Set a treatment: mitigate, transfer, avoid or accept. **A risk you accept will
not save without a name against it.** Somebody with the authority to accept it
did so, and that is the record. Put the date in too, even though it is not
forced — "who accepted this and when" is one question, not two.

Link risks to the controls that reduce them and to affected assets.

---

## Sample library

A blank register is the hardest place to start, so **Risks**
and **Assets** each have a **Sample library** tab next to the register.

It holds ready-made examples to react to, grouped so you can open only the ones
that fit you:

| | |
|---|---|
| **Assets** | Systems and files that hold personal data: office and IT, HR, sales and marketing, finance, customer service, facilities, healthcare, education, and data protection records. 83 in all |
| **Risks** | Privacy risks grouped by area: principles, rights, governance, security and breaches, processors and transfers. 41 in all |

Each sample risk comes with a likelihood, an impact, a suggested owner and the
GDPR duties it relates to. Every one of the 37 duties has at least one
sample risk against it.

Each sample asset says whether it is a primary asset - the information and
the business processes - or a supporting one that holds or carries them, and
points at the controls that govern assets of that kind.

**Add** copies a row into your register, and that is all. Once added it is
yours: rename it, rescore it, or delete it like anything else. Samples you have
already added are shown dimmed, so you do not lose your place.

**Scores are a first guess, not an answer.** Change them to fit your
organisation. Ten risks that are really yours beat a hundred copied without
thought, and an auditor can tell the difference.

---

## Gap analysis

The Controls screen answers "where does this control stand". This one answers
"what is left", which is the question asked before an audit.

Four numbers at the top:

| | |
|---|---|
| **Done and proved** | Implemented, with evidence attached |
| **Not started** | Nothing recorded yet |
| **In progress** | Started, not finished |
| **Claimed, unproved** | Marked implemented with nothing attached to prove it |

That last one matters most. A control you claim without proof is the one an
auditor finds, and it is worse than an honest gap.

Under that, each theme with a bar, and the list itself. Filter by what kind of
gap it is, or by theme. **Raise a task** on any row creates a task linked to
that control, with its owner and due date, so the gap becomes work with a name
against it.

---

## Help and Documentation

Two items in the menu, both readable inside the product.
Nothing is downloaded, and nothing you read leaves the server.

**Help** — short answers: your first hour, what each screen is for, who can do
what, where your data lives, and the questions that come up in the first week.

**Documentation** — seven guides: quick start, using it day to day, the
administrator guide, collecting evidence from AWS, Azure, Microsoft 365 and
Google Workspace, GDPR in plain words, doing a DPIA, and handling requests and
breaches.

They ship with the product, so they describe the version you are running.

**The same documents come in the box.** Every installer has a `docs` folder.
In it: this user guide, the install guide, the security overview, the privacy
sheet, a troubleshooting guide and the release notes. On Windows the Start
menu has a shortcut to it.

---

## Spreadsheets

Every register has **Export CSV** and **Import CSV**.

**Export** gives you the rows currently on screen — filters and search
included — with the same column headings the add form uses. It opens in Excel
with accents intact.

**Import** adds rows from a file. The headings are matched to the fields by
name, anything unrecognised is ignored, and **nothing already in the register
is changed or removed**. You see how many rows were found and which columns
matched before anything is added.

If the file has no column for a required field, it says so and adds nothing.
The quickest way to get the headings right is to export first and fill in the
file you get back.

Rows are added one at a time through the same checks the form uses, so one bad
date does not stop the other forty-nine rows.

---

## Calendar

Everything with a date on it, in one place: policy reviews, tasks, findings,
evidence going stale, supplier reviews, objectives, training due again, planned
audits and control due dates.

Three groups: **overdue**, **the next 30 days**, and **after that**. Look ahead
30 days, 90 days, six months or a year.

Nothing is edited here. Each row has a button to the screen it came from, which
is where its date is changed.

---

## The other registers

Same shape: a list, a filter, a search, a dialog to add and edit.

**Assets** — what you hold that matters. Primary or supporting, with a
criticality and a classification.

**Notices and policies** — privacy notices, cookie notices and policies. Set the **Kind**. Draft, In Review, or Approved. Set a review date. Version history
is kept, so "which version was in force in March" has an answer.

**Tasks** — the work outstanding. Owner, due date, priority. Anything overdue
appears in the daily email.

Set **Kind** to **Change** for a planned change - to the way you work, or to
a system. Then fill in **what this change means for security**: what it
affects, what could go wrong, and what you will do about it. It keeps planned changes in the same list as the work, rather than in
a second list nobody updates. Filter the list by kind to show only changes.

**Incidents** — what happened. Severity Low to Critical; status from Open
through Investigating, Contained and Resolved, to Closed.

**Findings** — raised against you, by a regulator, an auditor or internally. **A closed
finding must say what closed it.** "Closed" on its own is not a record of
anything.

---

## Reports

PDFs to hand to someone. Click **Download** on any of them.

| Report | What it is for |
|---|---|
| **Accountability report** | Everything a regulator asks for: data map, DPIAs, requests, breaches, processors and transfers, consent and notices |
| **Record of processing activities** | The Article 30 record on its own |
| **Readiness plan** | Your Get ready plan on paper |
| **Executive summary** | One or two pages for a board or a manager |
| **Gap report** | Every duty not yet in place, and who owns it |
| **Risk register** | The full register with scores and treatments |
| **Evidence register** | What proof you hold and how fresh it is |

### Your own logo

Administrators can upload your organisation's logo under Reports. It appears at
the top of every report, where an auditor expects to see the name of the
organisation being audited.

Without one, reports carry the Offset Security mark instead.

### What is in them

Whatever is in the system when you press the button, with the date and your
name on it. A report that cannot say when it was produced is not evidence of
anything.

---

## Users

Administrators only.

Add someone with a name, a username, an email and a role. They get told the
account exists — **not the password.** Give them that yourself, in person or
through a password manager.

**Disable, do not delete.** The audit trail points at people. Deleting an
account would leave "who approved this" without an answer, which is the one
question an audit trail exists to answer. Disabling stops them signing in and
keeps the history.

If somebody is locked out after too many wrong passwords, **Unlock** clears it.

Two limits stop password guessing. Five wrong passwords lock that account for
15 minutes. Twenty failed sign-ins from one address, to any accounts, block
that address for 15 minutes, so one computer cannot guess at everyone's
password or lock everyone out.

---

## Audit trail

Administrators and auditors only. Nobody else sees it in the menu: it holds
failed sign-ins and addresses, which are security information.

It lists everything that happened, newest first: who, when, what they did,
which record, and the address they came from.

- **Search**, or pick a person, an action, or dates.
- **Click an entry** to see what it changed: each field, before and after.
  For something added or deleted, it shows the values it had.
- **Download CSV** gives everything that matches the filters, as a
  spreadsheet. Hand it to an auditor as evidence. The download is itself
  recorded.

**Nothing here can be changed or deleted**, by anybody, including
administrators. Entries are kept for ever unless whoever runs the server sets
a retention period (`AUDIT_RETENTION_DAYS`).

---

## Backups

Administrators only.

A backup is one file holding everything: the database and every evidence
document. One is taken automatically every night. The newest three backups are
kept, counting every kind together, and older ones are deleted.

**Take a backup now** before a big change, such as importing a lot of data.

**Download** saves a backup to your computer. Do this now and then and keep the
file somewhere other than the server. The file holds everyone's password hashes
and every document, so keep it safe.

**Upload a backup** adds a file you downloaded earlier back to the list. It is
checked first, and refused if it is damaged, not an Offset backup, from a
different product, or from a newer version.

**Restore** puts everything back as it was in that backup. You are asked to type
RESTORE first, because anything added or changed since that backup is replaced.
Before it starts, a backup of everything as it is now is taken, so a restore of
the wrong one can be undone. Everyone is signed out afterwards and signs in with
the accounts as they were in the backup.

---

## Settings

Administrators only.

**Outgoing email** — optional. Everything works without it. Set it up and you
can send the daily digest.

**Daily digest** — one message a day listing what needs attention: evidence out
of date, overdue tasks and findings, policies due for review, open risks in the
top band.

**It sends nothing on a day when nothing needs attention.** That is on purpose.
A message that arrives every morning saying nothing is one people stop reading,
and the morning it matters they will not read that one either.

Use **Preview today's** to see what it would say before turning it on.

**HTTPS certificate** — stops the browser saying "Not secure". Ask your IT team
for a certificate for the name people type to reach this server, issued by your
company's own certificate authority. It is free, and every company computer
already trusts it. A `.pfx` file with its password works, and so do a
certificate and key as PEM files.

Click **Choose files**, pick them, type the password if there is one, and click
**Upload certificate**. It is checked first. Anything worth knowing - it is for
a different name, it is self-signed, it expires soon - is shown before it
replaces the one you have.

If the product is already on HTTPS, the new certificate is used at once. That
is how you renew it each year. If it is still on plain HTTP, it needs a restart,
and the screen says how. Old `http://` links keep working afterwards: they are
sent on to `https://`.

The section also shows the certificate in use: who it is for, who issued it,
and when it expires. It warns 30 days before. Installing and network settings
are in `INSTALL.md`, under **Turning on HTTPS**.

**Updates** — shows which version you have. **Check for updates** asks Offset
Security's release server whether there is a newer one, and shows what changed.
Nothing is checked until somebody presses it.

If there is one, **Update** installs it. A backup is taken first. The product
is then unavailable for a minute or two while it restarts. If the new version
does not start properly, the old one and your data are put back for you. The
section shows each step as it happens. When it says **Updated**, reload the page.

If the button is not offered, the section says why: usually that the server
cannot reach the internet, or that this copy was installed without the updater.
Whoever installed it can see **Updating** in `INSTALL.md`.

---

## Things worth knowing

**Everything is recorded.** Every change is written to an audit trail with who,
what and when. That is the point of the tool, and it means nothing is quietly
undone.

**It is backed up nightly**, automatically, documents included. Administrators
can take, download and restore backups under [Backups](#backups). Ask whether a
restore has ever been tested. An untested backup is a hope.

**Your data does not leave your organisation.** There is no cloud service behind
this, no telemetry, and no update check. It runs on your own machines.

**Two numbers to watch**, if you only watch two:

1. **Evidence gaps** on the dashboard — controls you claim without proof.
2. **Stale evidence** — proof that has aged out.

Both are things you can fix quietly now, or have found for you later.

---

Questions your administrator cannot answer: **info@offsetsecurity.net**
