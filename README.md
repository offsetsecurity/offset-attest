# Offset Accord

**EU GDPR** record-keeping software that runs on your own server. No cloud
account, no per-seat pricing, and nothing leaves the machine you install it on.

This repository is the whole product: the application, the GDPR content, and
everything needed to build the installers. Nothing is fetched from anywhere
else.

GDPR is about your data, so Offset Accord is built around the records the
Regulation asks for:

- **Data map** — the record of processing activities (Article 30), with
  ready-made templates and a department-by-department questionnaire
- **DPIAs** — screening questions and a risk grid for high-risk processing,
  linked to the data map (Article 35)
- **Requests** — access, erasure, correction and objection requests with a
  one-month countdown and the extension rule (Articles 12 to 22)
- **Breaches** — a breach log with the 72-hour countdown to tell the regulator
  and the "tell the people affected?" decision (Articles 33 and 34)
- **Processors and suppliers** — the signed DPA on each processor, and how each
  transfer outside the EU is covered (Articles 28, 44 to 49)
- **Consent records and privacy notices** — what people agreed to and where the
  proof is kept, and versioned notices (Articles 7, 13 and 14)
- **Accountability report** — one PDF with all of it, for a regulator
  (Article 5(2))

Every entry has an owner. Owners are emailed when a request or breach deadline
comes, and when a data map entry or consent record has not been reviewed for
12 months. The dashboard lists everything late, due this week, or missing.

Version 1 records what people write down. It does not scan or connect to your
other systems.

Every Offset product has HTTPS, backups and restore from the screen, an audit
trail, reminder emails, signed one-click updates, and a Forgot password flow
for administrators.

> Offset Accord is not affiliated with or endorsed by the European Union or
> any data protection authority. It helps you keep records; it is not legal
> advice.

## Download it

**[Releases](../../releases)** — take the newest one.

| | |
|---|---|
| Windows | `OffsetAccord-<version>-setup.exe`. It carries its own Node, so the machine needs nothing else |
| Linux | `offset-accord-<version>-linux-x64.tar.gz`, then `sudo ./install.sh accord` |
| Docker | `docker pull ghcr.io/offsetsecurity/offset-accord` |

On Docker, pull the updater beside it so an administrator can install updates
from Settings:

```bash
docker pull ghcr.io/offsetsecurity/offset-accord
docker pull ghcr.io/offsetsecurity/offset-accord-updater
```

Then copy `deploy/docker/env.example` to `.env`, fill in the two secrets it
asks for, and run `docker compose up -d`.

[INSTALL.md](INSTALL.md) covers installing properly: HTTPS, backups, ports and
what to do when something goes wrong. [docs/user-guide.md](docs/user-guide.md)
covers using it.

## What a customer gets

| | |
|---|---|
| Windows | An installer that carries its own Node. No prerequisites |
| Linux | A tarball installed as systemd services |
| Docker | `ghcr.io/offsetsecurity/offset-accord` |

An installed copy checks that same Releases page for updates, and an
administrator installs them from Settings.

## Working on it

```bash
corepack enable                 # pnpm ships with Node 24
pnpm install
cp .env.example .env            # fill in SESSION_SECRET and FIELD_ENC_KEY
pnpm migrate                    # creates the schema, a SQLite file
pnpm dev                        # http://localhost:8080
```

No database to install. `pnpm test` runs the suite; the end-to-end half needs
`E2E_DATABASE_URL` pointed at a throwaway file.

### Layout

```
apps/api/       the API, worker and updater
apps/web/       the screens
packs/accord/   the framework: 37 GDPR duties, their explanations,
                Get ready, the sample library and the help pages
deploy/         Dockerfile, compose, the Windows and Linux builds, releasing
docs/           what it is, how it works, how to install it
```

**The framework content is data, not code.** `packs/accord/pack.json` decides
which screens appear, so changing the wording of a requirement never means
touching the application.

## Releasing

Push a version tag and GitHub builds the Windows installer, the Linux bundle
and the images, signs one manifest naming all of them, and publishes it to
its own Releases page:

```bash
git tag -a v0.2.0 -m "What changed, in a sentence or two"
git push origin v0.2.0
```

See [docs/dev/releasing.md](docs/dev/releasing.md) for the one-time setup, and
what to do when a release goes wrong.

## Licence

Free to use, closed source. See [LICENSE](LICENSE).

---

**Offset Security** — Offset Risk. Enable Growth.
