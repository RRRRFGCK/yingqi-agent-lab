# Vercel deployment

The app has two build targets. The default `npm run build` retains the existing
Vinext / Cloudflare deployment; `npm run build:vercel` builds the same routes
with Next.js. `vercel.json` selects the latter on Vercel.

Local Next.js development:

```bash
npm ci
npm run dev:vercel
```

Validation:

```bash
npm test
npm run build:vercel
```

Import this repository into a personal Vercel project, or deploy with the
official Vercel CLI after account authorization. Keep account tokens and
generated `.vercel/` files out of Git.

No model key is required for the default rule-based demonstrations. Real model
calls require server-side configuration and can incur provider charges.
CareFlow remains offline unless `CAREFLOW_LIVE_ENABLED=true`; do not enable
public model calls without access controls and rate limits.

The migration does not delete or redirect the original tools Site.

Production: https://yingqi-agent-workbench.vercel.app

Dedicated Vercel project: `yingqi-agent-workbench` in
`wyq20020220-2441s-projects`. Keep this deployment separate from other
projects in the account. Do not reuse an old checkout-local `.vercel/project.json`.
Use an explicit project when deploying a clean copy of the source:

```bash
vercel deploy ./clean-source --project yingqi-agent-workbench --scope wyq20020220-2441s-projects --prod --yes
```

The 23 October upgrade was uploaded from a clean Git archive with no local
`.env` files or previous project linkage. The homepage and three workspaces
returned HTTP 200. Hosted AgentBench normal runs passed 200/200 assertions;
containment runs passed 170/170 assertions (10 completed tasks, 2 contained
failures). CareFlow completed a synthetic appointment request and respected
the correction from afternoon to morning. Live model access remains disabled.

Verified on 14 October 2026: four page routes returned HTTP 200, the CareFlow
endpoint completed a synthetic request through seven nodes and two local tools,
and the FinPilot endpoint reported no model key. Next.js and Vinext builds and
the 24-test suite passed. Hosted browser-interaction QA was not completed.

Dependency installation reports existing npm advisories in the shared toolchain
(including Vinext and shadcn dependency trees). This migration is not a security
audit; automatic major-version fixes have not been applied. Keep live model
access disabled until the public endpoint controls are reviewed.
