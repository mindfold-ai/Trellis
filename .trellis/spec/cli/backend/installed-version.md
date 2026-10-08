# Installed Version Boundary

The current CLI initializes new projects and reapplies its managed templates
only when the installed version exactly matches the CLI version. A different
or missing installed version is rejected before project files are read.

Published release manifest files remain historical records. The runtime does
not load them or use them to transform an installation.

The separate [migrate executor](./commands-migrate.md) accepts a reviewed private
projection for the supported core `0.6.x` / `0.7.0-castbox.N` predecessor one-way paths. Its old-record handling
does not relax these ordinary initialization/update or task schema boundaries.

Managed-template inventory and conflict behavior are specified in
[the update command](./commands-update.md). Release packaging and version
checks are specified in [Release Process](./release-process.md).
