# Installed candidate probe

`candidate-smoke.mjs` takes the absolute public bin from an actually installed
matching CLI/Core pair and a new absolute evidence directory. It never imports
source checkout modules. The parent of the evidence directory must already exist.

```sh
node candidate-smoke.mjs \
  /absolute/prefix/node_modules/@mindfoldhq/trellis/bin/trellis.js \
  /absolute/new-evidence-directory
```

The script imports the installed CLI's public namespace and resolves the Core
`/task/v2` public export from that CLI installation. Every maintenance command is
an actual new public-bin process. The partial-write scenario invokes the installed
public SDK with one ordinary filesystem rename failure, then uses actual bin
processes to observe pending and resume the original operation.

The probe retains two disposable Git repositories and all private inputs, plans,
receipts and a `report.json` containing subprocess arguments, exits, stdout/stderr,
candidate fingerprints, observed keys and archive byte/mode digests. The fixed
historical record has the ten-field legacy shape; it is never normalized before
public inspection or conversion. The normal scenario exercises installed Core
relocation, target-native Task selection, actual Completion/Closure and archive,
then checks the original formal entry and original operation receipt again.

On Windows the probe defaults to `python`; elsewhere it defaults to `python3`.
Set `TRELLIS_PROBE_PYTHON` to an explicit executable if the environment requires
one. The target-native scripts and Delivery workflow are copied from the installed
package's actual template build. The fixture disables automatic Git maintenance
locally and preserves an unrelated business file.

This evidence certifies only the public candidate and its native TS/Python
consumers on the executing platform. It does not certify historical business
qualification, Guru source decisions, Guru target installation or joint acceptance.
Package tarball hashes and the source commit should accompany the probe report;
a version label alone does not identify a fixed build.
