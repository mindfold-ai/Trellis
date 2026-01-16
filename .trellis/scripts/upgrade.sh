#!/bin/bash
# Trellis Upgrade Script
#
# Usage:
#   ./.trellis/scripts/upgrade.sh <source-trellis-path>
#
# This script upgrades the current project's Trellis framework from a source
# installation. It copies scripts and structure files while preserving
# developer-specific data (agent-traces).
#
# Example:
#   ./.trellis/scripts/upgrade.sh /path/to/reference/Trellis

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common/paths.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

REPO_ROOT=$(get_repo_root)
TARGET_TRELLIS="$REPO_ROOT/$DIR_WORKFLOW"

# =============================================================================
# Functions
# =============================================================================

show_usage() {
  cat << EOF
Trellis Upgrade Script

Usage:
  $0 <source-trellis-path>

Arguments:
  source-trellis-path    Path to the Trellis source project to upgrade from

Description:
  Upgrades the current project's Trellis framework by copying:
    - scripts/         (all scripts)
    - structure/       (development guidelines)
    - version.json     (version info)
    - workflow.md      (workflow documentation)

  Preserves:
    - agent-traces/    (developer progress and features)
    - .developer       (developer identity)
    - .current-feature (current feature state)

Examples:
  $0 /path/to/Trellis
  $0 ~/projects/Trellis
EOF
}

get_version() {
  local trellis_dir="$1"
  local version_file="$trellis_dir/version.json"

  if [[ -f "$version_file" ]] && command -v jq &> /dev/null; then
    jq -r '.version // "unknown"' "$version_file"
  else
    echo "unknown"
  fi
}

confirm_upgrade() {
  local source_version="$1"
  local target_version="$2"

  echo -e "${BLUE}=== Trellis Upgrade ===${NC}"
  echo ""
  echo -e "Source version: ${CYAN}$source_version${NC}"
  echo -e "Target version: ${CYAN}$target_version${NC}"
  echo ""
  echo "The following will be updated:"
  echo "  - scripts/"
  echo "  - structure/"
  echo "  - version.json"
  echo "  - workflow.md"
  echo ""
  echo "The following will be preserved:"
  echo "  - agent-traces/ (your progress and features)"
  echo "  - .developer"
  echo "  - .current-feature"
  echo ""

  read -p "Proceed with upgrade? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Upgrade cancelled${NC}"
    exit 0
  fi
}

do_upgrade() {
  local source_trellis="$1"

  echo ""
  echo -e "${BLUE}Upgrading Trellis...${NC}"
  echo ""

  # Backup current scripts (optional)
  local backup_dir="$TARGET_TRELLIS/.upgrade-backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup_dir"

  # Copy scripts
  if [[ -d "$source_trellis/scripts" ]]; then
    echo -e "  ${CYAN}Updating scripts/...${NC}"
    if [[ -d "$TARGET_TRELLIS/scripts" ]]; then
      cp -r "$TARGET_TRELLIS/scripts" "$backup_dir/"
    fi
    rm -rf "$TARGET_TRELLIS/scripts"
    cp -r "$source_trellis/scripts" "$TARGET_TRELLIS/"
    echo -e "  ${GREEN}✓${NC} scripts/"
  fi

  # Copy structure
  if [[ -d "$source_trellis/structure" ]]; then
    echo -e "  ${CYAN}Updating structure/...${NC}"
    if [[ -d "$TARGET_TRELLIS/structure" ]]; then
      cp -r "$TARGET_TRELLIS/structure" "$backup_dir/"
    fi
    rm -rf "$TARGET_TRELLIS/structure"
    cp -r "$source_trellis/structure" "$TARGET_TRELLIS/"
    echo -e "  ${GREEN}✓${NC} structure/"
  fi

  # Copy version.json
  if [[ -f "$source_trellis/version.json" ]]; then
    echo -e "  ${CYAN}Updating version.json...${NC}"
    if [[ -f "$TARGET_TRELLIS/version.json" ]]; then
      cp "$TARGET_TRELLIS/version.json" "$backup_dir/"
    fi
    cp "$source_trellis/version.json" "$TARGET_TRELLIS/"
    echo -e "  ${GREEN}✓${NC} version.json"
  fi

  # Copy workflow.md
  if [[ -f "$source_trellis/workflow.md" ]]; then
    echo -e "  ${CYAN}Updating workflow.md...${NC}"
    if [[ -f "$TARGET_TRELLIS/workflow.md" ]]; then
      cp "$TARGET_TRELLIS/workflow.md" "$backup_dir/"
    fi
    cp "$source_trellis/workflow.md" "$TARGET_TRELLIS/"
    echo -e "  ${GREEN}✓${NC} workflow.md"
  fi

  # Check if backup is empty and remove if so
  if [[ -z "$(ls -A "$backup_dir" 2>/dev/null)" ]]; then
    rmdir "$backup_dir"
  else
    echo ""
    echo -e "${YELLOW}Previous files backed up to: $backup_dir${NC}"
  fi

  echo ""
  echo -e "${GREEN}✓ Upgrade complete!${NC}"
  echo ""
  echo "New version: $(get_version "$TARGET_TRELLIS")"
}

# =============================================================================
# Main
# =============================================================================

main() {
  local source_path="$1"

  if [[ -z "$source_path" ]] || [[ "$source_path" == "-h" ]] || [[ "$source_path" == "--help" ]]; then
    show_usage
    exit 0
  fi

  # Resolve to absolute path
  if [[ ! "$source_path" = /* ]]; then
    source_path="$(cd "$source_path" 2>/dev/null && pwd)" || {
      echo -e "${RED}Error: Cannot resolve path: $1${NC}"
      exit 1
    }
  fi

  # Check for .trellis directory in source
  local source_trellis="$source_path/.trellis"
  if [[ ! -d "$source_trellis" ]]; then
    # Maybe the path is directly to .trellis
    if [[ -d "$source_path/scripts" ]] && [[ -f "$source_path/version.json" ]]; then
      source_trellis="$source_path"
    else
      echo -e "${RED}Error: No .trellis directory found in: $source_path${NC}"
      exit 1
    fi
  fi

  # Verify source has required files
  if [[ ! -d "$source_trellis/scripts" ]]; then
    echo -e "${RED}Error: Source missing scripts/ directory${NC}"
    exit 1
  fi

  # Check versions
  local source_version=$(get_version "$source_trellis")
  local target_version=$(get_version "$TARGET_TRELLIS")

  # Confirm and upgrade
  confirm_upgrade "$source_version" "$target_version"
  do_upgrade "$source_trellis"
}

main "$@"
