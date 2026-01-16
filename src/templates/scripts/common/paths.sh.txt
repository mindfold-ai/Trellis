#!/bin/bash
# Common path utilities for Trellis workflow
#
# Usage: source this file in other scripts
#   source "$(dirname "$0")/common/paths.sh"
#
# Provides:
#   get_repo_root          - Get repository root directory
#   get_developer          - Get developer name
#   get_features_dir       - Get features directory
#   get_progress_dir       - Get progress directory
#   get_active_progress_file - Get current progress file

# =============================================================================
# Path Constants (change here to rename directories)
# =============================================================================

# Directory names
DIR_WORKFLOW=".trellis"
DIR_PROGRESS="agent-traces"
DIR_FEATURES="features"
DIR_ARCHIVE="archive"
DIR_STRUCTURE="structure"
DIR_SCRIPTS="scripts"

# File names
FILE_DEVELOPER=".developer"
FILE_CURRENT_FEATURE=".current-feature"
FILE_FEATURE_JSON="feature.json"

# =============================================================================
# Repository Root
# =============================================================================

get_repo_root() {
  # Find the nearest directory containing .trellis/ folder
  # This handles nested git repos correctly (e.g., test project inside another repo)
  local current="$PWD"

  while [[ "$current" != "/" ]]; do
    if [[ -d "$current/$DIR_WORKFLOW" ]]; then
      echo "$current"
      return
    fi
    current=$(dirname "$current")
  done

  # Fallback to current directory if no .trellis/ found
  echo "$PWD"
}

# =============================================================================
# Developer
# =============================================================================

get_developer() {
  local repo_root="${1:-$(get_repo_root)}"
  local dev_file="$repo_root/$DIR_WORKFLOW/$FILE_DEVELOPER"

  if [[ -f "$dev_file" ]]; then
    grep "^name=" "$dev_file" 2>/dev/null | cut -d'=' -f2
  fi
}

check_developer() {
  local developer=$(get_developer "$1")
  [[ -n "$developer" ]]
}

# =============================================================================
# Features Directory
# =============================================================================

get_features_dir() {
  local repo_root="${1:-$(get_repo_root)}"
  local developer=$(get_developer "$repo_root")

  if [[ -n "$developer" ]]; then
    echo "$repo_root/$DIR_WORKFLOW/$DIR_PROGRESS/$developer/$DIR_FEATURES"
  fi
}

# =============================================================================
# Progress Directory
# =============================================================================

get_progress_dir() {
  local repo_root="${1:-$(get_repo_root)}"
  local developer=$(get_developer "$repo_root")

  if [[ -n "$developer" ]]; then
    echo "$repo_root/$DIR_WORKFLOW/$DIR_PROGRESS/$developer"
  fi
}

# =============================================================================
# Progress File
# =============================================================================

get_active_progress_file() {
  local repo_root="${1:-$(get_repo_root)}"
  local progress_dir=$(get_progress_dir "$repo_root")

  if [[ -z "$progress_dir" ]] || [[ ! -d "$progress_dir" ]]; then
    echo ""
    return
  fi

  local latest=""
  local highest=0
  for f in "$progress_dir"/traces-*.md; do
    if [[ -f "$f" ]]; then
      local num=$(basename "$f" | sed 's/traces-//' | sed 's/\.md//')
      if [[ "$num" =~ ^[0-9]+$ ]] && [[ "$num" -gt "$highest" ]]; then
        highest=$num
        latest="$f"
      fi
    fi
  done

  if [[ -n "$latest" ]]; then
    echo "$latest"
  fi
}

count_lines() {
  local file="$1"
  if [[ -f "$file" ]]; then
    wc -l < "$file" | tr -d ' '
  else
    echo "0"
  fi
}

# =============================================================================
# Current Feature Management
# =============================================================================

# Get .current-feature file path
_get_current_feature_file() {
  local repo_root="${1:-$(get_repo_root)}"
  echo "$repo_root/$DIR_WORKFLOW/$FILE_CURRENT_FEATURE"
}

# Get current feature directory path (relative to repo_root)
get_current_feature() {
  local repo_root="${1:-$(get_repo_root)}"
  local current_file=$(_get_current_feature_file "$repo_root")

  if [[ -f "$current_file" ]]; then
    cat "$current_file" 2>/dev/null
  fi
}

# Get current feature directory absolute path
get_current_feature_abs() {
  local repo_root="${1:-$(get_repo_root)}"
  local relative=$(get_current_feature "$repo_root")

  if [[ -n "$relative" ]]; then
    echo "$repo_root/$relative"
  fi
}

# Set current feature
# Args: $1 - feature directory path (relative to repo_root)
set_current_feature() {
  local feature_path="$1"
  local repo_root="${2:-$(get_repo_root)}"
  local current_file=$(_get_current_feature_file "$repo_root")

  if [[ -z "$feature_path" ]]; then
    echo "Error: feature path is required" >&2
    return 1
  fi

  # Verify feature directory exists
  local full_path="$repo_root/$feature_path"
  if [[ ! -d "$full_path" ]]; then
    echo "Error: feature directory not found: $feature_path" >&2
    return 1
  fi

  echo "$feature_path" > "$current_file"
}

# Clear current feature
clear_current_feature() {
  local repo_root="${1:-$(get_repo_root)}"
  local current_file=$(_get_current_feature_file "$repo_root")

  if [[ -f "$current_file" ]]; then
    rm -f "$current_file"
  fi
}

# Check if has current feature
has_current_feature() {
  local current=$(get_current_feature "$1")
  [[ -n "$current" ]]
}
