# Offset Attest

**SOC 1, SOC 2 and SOC 3** readiness software that runs on your own server. No
cloud account, no per-seat pricing, and nothing leaves the machine you install
it on.

This repository is the whole product: the application, the SOC content, and
everything needed to build the installers. Nothing is fetched from anywhere
else.

A SOC report is a CPA firm's opinion on your controls. Attest is where you get
ready for one and keep it current:

- **Scope**: the system and its boundaries, your service commitments, and
  which Trust Services categories and SOC 1 objectives are in the report, with
  a reason for everything left out
- **Criteria**: all 61 SOC 2 Trust Services Criteria (Security, Availability,
  Processing integrity, Confidentiality, Privacy) and 12 starter SOC 1 control
  objectives, each with what it asks for, what to do, what the auditor tests
  and the records to keep, plus an owner, status, evidence and tests
- **Testing**: record your own tests of each criterion (Pass, Partial, Fail)
  so exceptions are found before the auditor finds them
- **SOC reports**: each SOC 1, SOC 2 or SOC 3 report, Type I or Type II, with
  the CPA firm, the period, the opinion, exceptions and when the next is due
- **Vendors**: subservice organisations and the SOC reports they gave you
- **Risks, assets, policies, training, internal audits and exceptions**: the
  records CC1 to CC9 are tested against
- **Policy templates**: 13 Word documents, the system description and the
  policies a SOC 2 auditor expects, filled in on screen from answers given
  once and from the registers (risks, vendors, training, assets, audits)
- **Reports**: an executive summary for the board, the SOC 2 criteria matrix
  and SOC 1 objectives matrix for your CPA firm, and a SOC 3 draft
  (management's assertion, the system description and the categories covered)
  for publishing once the report is issued

Every entry has an owner. Owners are emailed as reviews and reports come due.
**Get ready** walks from a fresh install to an issued report in eight stages,
most of which tick themselves from your records.

Version 1 records what people write down. It does not scan or connect to your
other systems.

Every Offset product has HTTPS, backups and restore from the screen, an audit
trail, reminder emails, signed one-click updates, and a Forgot password flow
for administrators.

> Offset Attest is not affiliated with or endorsed by the AICPA. SOC 1, SOC 2
> and SOC 3 reports can only be issued by an independent CPA firm. Attest helps
> you prepare; it is not an audit.

## Download it

**[Releases](../../releases)**: take the newest one.

| | |
|---|---|
| Windows | `OffsetAttest-<version>-setup.exe`. It carries its own Node, so the machine needs nothing else |
| Linux | `offset-attest-<version>-linux-x64.tar.gz`, then `sudo ./install.sh attest` |
| Docker | `docker pull ghcr.io/offsetsecurity/offset-attest` |

On Docker, pull the updater beside it so an administrator can install updates
from Settings:

```bash
docker pull ghcr.io/offsetsecurity/offset-attest
docker pull ghcr.io/offsetsecurity/offset-attest-updater
```

Then copy `deploy/docker/env.example` to `.env`, fill in the two secrets it
asks for, and run `docker compose up -d`.

[INSTALL.md](INSTALL.md) covers installing properly: HTTPS, backups, ports and
what to do when something goes wrong. [docs/user-guide.md](docs/user-guide.md)
covers using it.

## Working on it

```bash
corepack enable                 # pnpm ships with Node 24
pnpm install
cp .env.example .env            # fill in SESSION_SECRET and FIELD_ENC_KEY
pnpm migrate                    # creates the schema, a SQLite file
pnpm --filter @offset/web build # the screens
pnpm dev                        # http://localhost:8080
```

No database to install. `pnpm test` runs the suite; the end-to-end half needs
`E2E_DATABASE_URL` pointed at a throwaway file, for example
`E2E_DATABASE_URL=file:./.tmp/e2e.db`. Keep that path short on Windows.

### Layout

```
apps/api/       the API, worker and updater
apps/web/       the screens
packs/attest/   the framework: 61 SOC 2 criteria and 12 SOC 1 objectives,
                their explanations, Get ready, the sample library and help
deploy/         Dockerfile, compose, the Windows and Linux builds, releasing
docs/           what it is, how it works, how to install it
```

**The framework content is data, not code.** `packs/attest/pack.json` decides
which screens appear and what they are called, so changing the wording of a
criterion never means touching the application.

The policy templates are built by `docs/dev/build-soc-templates.py`; change a
document there and run it again. The SOC-specific code is small: the SOC reports register
(`apps/api/src/routes/soc.ts`, migration `0017`), the three SOC PDFs
(`apps/api/src/reports/soc.ts`) and the Get ready checks marked SOC in
`apps/api/src/journey/checks.ts`.

## Where it came from

Copied from Offset Accord 0.1.0 (EU GDPR) on 2026-10-18, which was itself
copied from Offset Assure (ISO 27001). The GDPR screens are still in the code
behind the `privacy` feature flag, switched off in this pack.

## Releasing

Push a version tag and GitHub builds the Windows installer, the Linux bundle
and the images, signs one manifest naming all of them, and publishes it to
its own Releases page:

```bash
git tag -a v0.1.0 -m "What changed, in a sentence or two"
git push origin v0.1.0
```

See [docs/dev/releasing.md](docs/dev/releasing.md) for the one-time setup, and
what to do when a release goes wrong.

## Licence

Free to use, closed source. See [LICENSE](LICENSE).

---

**Offset Security**: Offset Risk. Enable Growth.
