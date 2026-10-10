# Sushi Corner linked-PDF pilot (#147)

Base: fetched `origin/main` `db1c22cd993a9c0ae00a11ec2c9706825f968b0e`.

## Operator flow

After application deployment, recheck Restaurant inventory and locate or create
**Sushi Corner, ul. Pawła Włodkowica 12a, 50-072 Wrocław**. Sushi Friends is a
different Restaurant. Optional business details must not be invented.

In the Restaurant's Admin import settings choose **Wybierz pilot Sushi Corner —
Włodkowica 12a**, save the inactive draft and run the PDF trial. The importer
rediscovers exactly one **Lunch Menu Download** anchor on the
[official branch lunch page](https://sushicorner.pl/wlodkowica/menu-en/lunch/)
each time. It does not use the general sushi menu or a permanent dated asset URL.
The [branch page](https://sushicorner.pl/wlodkowica/) provides independent address
evidence; the expected address displayed by the trial is not extracted proof.

Compare the exact downloaded PDF with the AI transcription. Trials and active
previews offer a download of the bytes used for analysis, the current remote
link, SHA-256 and fetch time. Trial bytes are returned only to that request and
never saved in binding/audit JSON. After reload only the remote link/hash remain;
rerun the trial if exact bytes are needed. Remote links can change their content.
AI output is editable evidence, not an independent literal source transcript.

Verify each dish, price, alternative and paid extra; uncertain prices remain
null and require correction/exclusion. Confirm weekday/time conditions and sales
channel. Record branch and freshness evidence and explicitly activate only after
a supported trial. Fetch the active preview, choose the actual available date,
correct/exclude dishes and explicitly approve the existing publication form.
Neither fetch time, unchanged bytes nor the PDF upload path establishes current
validity. A successful extraction never activates a source or publishes offers.

## Bounds and existing protections

- Shared public transport validates all DNS answers, pins the selected address,
  checks the connected peer and validates every redirect before requesting it.
  HTTPS, HTTP 200, correct MIME type and uncompressed responses are required.
  Each resource has a 10-second deadline, two redirects and a streamed 2 MiB cap.
- The discovery URL is restricted to this branch's English lunch page. Assets
  must be on `https://sushicorner.pl/wp-content/uploads/sites/7/YYYY/MM/` with a
  `sushi-corner-lunch-menu-*.pdf` filename. Other branches/hosts/formats fail closed.
- `pdf-lib` parses in a separate Node worker with a five-second deadline and
  64 MiB old-generation / 16 MiB young-generation heap limits. Only an unencrypted,
  structurally parseable single page up to 2,000 points per dimension is accepted.
  Worker heap limits do not constitute a bound on all native/external memory.
- Gemini receives downloaded PDF bytes directly using its native PDF file part;
  it does not fetch a remote URL. Existing fallback and shared 25-second provider
  deadline apply. No local rasterizer or text-order price heuristic is introduced.
- Only successfully validated extraction is cached by bytes SHA-256 plus version.
  Discovery and PDF bytes are fetched/validated every time. New URLs preserve the
  `html-<Restaurant UUID>` source identity. Model errors are classified safe messages;
  invalid/empty/duplicate-name output fails and is not cached.
- Existing Admin action authorization and SQL RPC/RLS remain independent. Binding
  revisions, 30-minute freshness, Restaurant-edit invalidation, disable, audit,
  source/item/date retry identity, manual corrections and tombstones are unchanged.
  Changed OCR names still require comparison with existing offers before approval.

Deploy application/dependencies and the traced `scripts/validate-menu-pdf.cjs`
worker together. No SQL migration is introduced; existing migrations through
`20261009000002` are required. Generic onboarding still rejects arbitrary PDFs;
this exception supports only Sushi Corner Włodkowica's linked lunch PDF.
There is no scheduling or unattended publication.

## Captured evidence and validation

The exact one-page PDF fixture was downloaded on 2026-10-10 from the currently
linked official URL. SHA-256:
`97aa2e5308766584bc51324628791eeb76fe62980ce4d78688025cda38f68fb3`.
The discovery fixture retains the actual download anchor including its icon.
Fixture age and the upload path `2025/04` are not validity evidence.

An opt-in protected live fetch at `2026-10-10T17:34:12.606Z` rediscovered the same
asset and hash and validated the real PDF. Its extraction was deliberately mocked:
this verifies discovery, transport and parsing, not live provider menu quality.
Provider boundary tests verify the actual SDK sends inline PDF bytes and preserves
availability/null prices. Adapter/action/UI tests cover changed/missing/ambiguous
links, unsafe redirects/peers, parser failures/deadline, caching, branch guards,
Admin gating, transient exact-byte evidence and manual activation controls.

Production onboarding, live extraction quality and operator confirmation remain
pending. No production Restaurant, binding or offer was created or changed.
Sofa remains unverified following its hidden-category finding; #94 must record
the final pilot membership and actual dates separately from earlier Sofa samples.

The full unit/property checkpoint passed (1,160 tests, seven opt-in tests skipped).
Additional protected PDF transport and encrypted-PDF cases passed afterward.
Typecheck, lint and production build passed; lint has the two existing unused
imports in chat/OfferPreview. The build used local placeholder Supabase public
configuration and did not contact production. Build tracing includes the worker
and its `pdf-lib`/pako dependencies.

Two PDF-specific real-DB lifecycle cases are provided in
`__tests__/db/sushi-corner-import.test.ts`, covering metadata/authorization and
retry/correction/date/tombstone behavior. They were not run here: the Docker daemon
is unavailable and Docker Desktop is not installed at its documented path. Run
`npm run test:db -- __tests__/db/sushi-corner-import.test.ts` on the local stack
before accepting the pilot. No SQL contract was changed.

Collaborative PDF-browser snapshots twice returned
`Preview automation snapshot timed out after 15000ms`. Exact-PDF download/hash,
unknown-date and activation states passed focused DOM interaction tests. A local
authenticated browser flow and visual/live-model price comparison remain pending;
the test fixture's mocked offers are not claimed as correct menu interpretation.
