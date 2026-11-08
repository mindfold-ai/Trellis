# Native Python lifecycle regression

`native-python-regression.mjs` tests the built public CLI in separate processes.
It does not import implementation helpers, simulate an OS, mock subprocesses,
change a target's version marker, install globally, or claim Agent autoload.
Both implementations initialize their own fresh repositories and subsequently
update those repositories with the same CLI build and version.

Build a checkout, then run from a checkout containing the driver:

```bash
pnpm install --frozen-lockfile
pnpm build
node packages/cli/scripts/native-python-regression.mjs --target=. --scenario=python3 --expect=pass --output=native-evidence/candidate
```

On native Windows, also run `--scenario=py`. A genuine installed Windows Python
launcher and registered Python >=3.9 are required. `--python=<executable>` and
`--launcher=<py.exe>` can identify the actual binaries explicitly. Python 3.12,
Node 20, Git, and Bash are supplied by the pinned CI runner setup.

The Python 3 scenario copies a genuine Windows CPython runtime and exposes the
real executable as `python3.exe`; its DLLs and standard library remain real.
The copied runtime directory is exposed directly, with `python.exe` and
`pythonw.exe` removed and no `._pth` isolation file. An infrastructure self-check
executes a real script importing a sibling module before any candidate cases,
ensuring ordinary script-directory import behavior remains intact.
The launcher scenario exposes a copied genuine `py.exe` that discovers its
registered runtime. Original PATH entries containing interpreter aliases are
removed. Unix system tools from filtered directories are projected as symlinks
into the private tools directory. Every scenario executes Python code to prove
the selected alias works and the other aliases fail, then records actual Python,
Git, Bash, Node and runner identities. Bad isolation is an infrastructure error.

The normal and explicit-override cases each cover:

- Public legacy init and same-version update, repeat-update stability, selected
  hook execution, user-edit/create-new/force conflict behavior and hook hashes.
- `maintain inspect-tools`, `prepare`, `preview`, `apply`, `recover`, `resume`.
  Apply and both recovery reads must pass real native contract/context checks;
  the original operation and recovery identities must remain unchanged.
- A separate fresh Delivery installation, update with native preflight, then
  workflow preview and force against the same custom marketplace and template
  ID. The driver creates a real local Git repository containing an index and
  the target's actual built Delivery workflow. Child-only Git `url.insteadOf`
  configuration maps its explicit HTTPS provider identity to that repository
  using real Git file transport; it does not claim GitHub/network transport
  evidence. The fixture source SHA and exact rewrite are recorded. Public
  provider parsing, index and template clones remain real, and the Delivery
  declaration invokes actual native preflight. Preview preserves user content and hashes; force
  applies the preview bytes, retains `.new`, and removes bundled hash ownership
  according to the existing custom-provider contract.

Probe-free explicit and skip-check branches also run without a visible Python;
skip-check retains the platform default and does not waive actual native
postvalidation. Automatic detection failures must precede managed writes for
both fresh init and existing-project update. Hook execution proves generated
commands run; it does not prove an Agent loaded the hook automatically.

For the exact affected baseline, build a **separate checkout with its own
dependencies** at `7bcbeaad31380e7a29c97898cb947c6120a61775`, then invoke this
driver against it. For example, on native Windows:

```bash
node packages/cli/scripts/native-python-regression.mjs --target=../baseline --scenario=python3 --expect=baseline-defect --output=native-evidence/baseline-python3
node packages/cli/scripts/native-python-regression.mjs --target=../baseline --scenario=py --expect=baseline-defect --output=native-evidence/baseline-py
```

The baseline must reach the precise `selection_lost` assertion after its own
successful legacy init/update. A dependency failure, missing runtime, invalid
PATH, unrelated CLI error, timeout, or generic nonzero exit never counts as
reproduction. Legacy init is intentional: it isolates selection loss before a
Delivery preflight can fail for a missing alias. Candidate coverage separately
exercises actual Delivery preflight and `py -3` argv execution. Baseline runs
stop at their first precise expected defect; candidate runs cover the full chain.

`CI` runs the baseline comparison automatically for PRs and main on
`windows-2022` (python3 and py). `ubuntu-24.04` and `macos-15` run the full
candidate python3 regression, recording baseline comparison as not applicable.
The affected static-alias selection defect is specific to Windows; the old
Unix baseline also lacks the newly required automatic-failure-before-update
guard, so the candidate's complete negative suite is not a baseline pass gate.
Matrix fail-fast is disabled. Windows baseline build/run failure does not
suppress the candidate run; the final comparison fails if either required
outcome is missing or invalid.
The same workflow supports `workflow_dispatch` with `baseline_ref` and
`candidate_ref` inputs for repeatable comparison.

Evidence artifacts contain one JSON file per subprocess with command, cwd,
raw exit/signal/error/stdout/stderr, plus `summary.json` with assertions, source
SHA, CLI version, full CLI/Core build-tree digests, driver digest, actual OS and
tool identities, and final classification. `passed`, `expected_baseline_defect`,
`baseline_unexpected_pass`, `candidate_failure`, and `infrastructure_failure`
are distinct outcomes. An externally cancelled run or missing artifact is
unverified. No host environment dump or credentials are captured. Temporary
projects are retained under the recorded work directory for local diagnosis;
CI runner disposal cleans them after artifact collection.
