#!/bin/bash
# Feature utility functions
#
# Usage: source this file in other scripts
#   source "$(dirname "$0")/common/feature-utils.sh"
#
# Provides:
#   is_safe_feature_path     - Validate feature path is safe to operate on
#   find_feature_by_name     - Find feature directory by name
#   complete_feature_backlog - Complete linked backlog issue
#   archive_feature_dir      - Archive feature to monthly directory

# Ensure dependencies are loaded
if ! type get_repo_root &>/dev/null; then
  echo "Error: paths.sh must be sourced before feature-utils.sh" >&2
  exit 1
fi

if ! type complete_backlog_issue &>/dev/null; then
  echo "Error: backlog.sh must be sourced before feature-utils.sh" >&2
  exit 1
fi

# =============================================================================
# Path Safety
# =============================================================================

# Check if a relative feature path is safe to operate on
# Args: feature_path (relative), repo_root
# Returns: 0 if safe, 1 if dangerous
# Outputs: error message to stderr if unsafe
is_safe_feature_path() {
  local feature_path="$1"
  local repo_root="${2:-$(get_repo_root)}"

  # Check empty or null
  if [[ -z "$feature_path" ]] || [[ "$feature_path" = "null" ]]; then
    echo "Error: empty or null feature path" >&2
    return 1
  fi

  # Reject absolute paths
  if [[ "$feature_path" = /* ]]; then
    echo "Error: absolute path not allowed: $feature_path" >&2
    return 1
  fi

  # Reject ".", "..", paths starting with "./" or "../", or containing ".."
  if [[ "$feature_path" = "." ]] || [[ "$feature_path" = ".." ]] || \
     [[ "$feature_path" = "./" ]] || [[ "$feature_path" == ./* ]] || \
     [[ "$feature_path" == *".."* ]]; then
    echo "Error: path traversal not allowed: $feature_path" >&2
    return 1
  fi

  # Final check: ensure resolved path is not the repo root
  local abs_path="${repo_root}/${feature_path}"
  if [[ -e "$abs_path" ]]; then
    local resolved=$(realpath "$abs_path" 2>/dev/null)
    local root_resolved=$(realpath "$repo_root" 2>/dev/null)
    if [[ "$resolved" = "$root_resolved" ]]; then
      echo "Error: path resolves to repo root: $feature_path" >&2
      return 1
    fi
  fi

  return 0
}

# =============================================================================
# Feature Lookup
# =============================================================================

# Find feature directory by name (exact or suffix match)
# Args: feature_name, features_dir
# Returns: absolute path to feature directory, or empty if not found
find_feature_by_name() {
  local feature_name="$1"
  local features_dir="$2"

  if [[ -z "$feature_name" ]] || [[ -z "$features_dir" ]]; then
    return 1
  fi

  # Try exact match first
  local feature_dir=$(find "$features_dir" -maxdepth 1 -type d -name "${feature_name}" 2>/dev/null | head -1)

  # Try suffix match (e.g., "my-feature" matches "250119-my-feature")
  if [[ -z "$feature_dir" ]]; then
    feature_dir=$(find "$features_dir" -maxdepth 1 -type d -name "*-${feature_name}" 2>/dev/null | head -1)
  fi

  if [[ -n "$feature_dir" ]] && [[ -d "$feature_dir" ]]; then
    echo "$feature_dir"
    return 0
  fi

  return 1
}

# =============================================================================
# Backlog Integration
# =============================================================================

# Complete the backlog issue linked to a feature
# Args: feature_dir_abs, [repo_root]
# Returns: 0 if completed or no backlog, 1 on error
complete_feature_backlog() {
  local feature_dir_abs="$1"
  local repo_root="${2:-$(get_repo_root)}"

  local feature_json="$feature_dir_abs/feature.json"

  if [[ ! -f "$feature_json" ]]; then
    return 0
  fi

  local backlog_ref=$(jq -r '.backlog_ref // empty' "$feature_json" 2>/dev/null)

  if [[ -n "$backlog_ref" ]]; then
    if complete_backlog_issue "$backlog_ref" "$repo_root"; then
      echo "$backlog_ref"
      return 0
    else
      return 1
    fi
  fi

  return 0
}

# =============================================================================
# Archive Operations
# =============================================================================

# Archive a feature directory to archive/{YYYY-MM}/
# Args: feature_dir_abs, [repo_root]
# Returns: 0 on success, 1 on error
# Outputs: archive destination path
archive_feature_dir() {
  local feature_dir_abs="$1"
  local repo_root="${2:-$(get_repo_root)}"

  if [[ ! -d "$feature_dir_abs" ]]; then
    echo "Error: feature directory not found: $feature_dir_abs" >&2
    return 1
  fi

  # Get features directory (parent of the feature)
  local features_dir=$(dirname "$feature_dir_abs")
  local archive_dir="$features_dir/archive"
  local year_month=$(date +%Y-%m)
  local month_dir="$archive_dir/$year_month"

  # Create archive directory
  mkdir -p "$month_dir"

  # Move feature to archive
  local feature_name=$(basename "$feature_dir_abs")
  mv "$feature_dir_abs" "$month_dir/"

  # Output the destination
  echo "$month_dir/$feature_name"
  return 0
}

# Complete archive workflow: complete backlog + archive directory
# Args: feature_dir_abs, [repo_root]
# Returns: 0 on success
# Outputs: lines with status info
archive_feature_complete() {
  local feature_dir_abs="$1"
  local repo_root="${2:-$(get_repo_root)}"

  if [[ ! -d "$feature_dir_abs" ]]; then
    echo "Error: feature directory not found: $feature_dir_abs" >&2
    return 1
  fi

  # Complete linked backlog
  local backlog_ref=$(complete_feature_backlog "$feature_dir_abs" "$repo_root")
  if [[ -n "$backlog_ref" ]]; then
    echo "backlog_completed:$backlog_ref"
  fi

  # Archive the directory
  local archive_dest
  if archive_dest=$(archive_feature_dir "$feature_dir_abs" "$repo_root"); then
    echo "archived_to:$archive_dest"
    return 0
  fi

  return 1
}
