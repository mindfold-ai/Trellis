#!/bin/bash
# =============================================================================
# Multi-Agent Pipeline: Cleanup Worktree
# =============================================================================
# Usage:
#   ./cleanup.sh <branch-name>      Remove specific worktree
#   ./cleanup.sh --list             List all worktrees
#   ./cleanup.sh --merged           Remove merged worktrees
#   ./cleanup.sh --all              Remove all worktrees (with confirmation)
#
# Options:
#   -y, --yes                       Skip confirmation prompts
#   --keep-branch                   Don't delete the git branch
#
# This script:
# 1. Archives feature directory to archive/{YYYY-MM}/
# 2. Removes agent from registry
# 3. Removes git worktree
# 4. Optionally deletes git branch
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/paths.sh"
source "$SCRIPT_DIR/../common/worktree.sh"
source "$SCRIPT_DIR/../common/developer.sh"
source "$SCRIPT_DIR/../common/backlog.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

PROJECT_ROOT=$(get_repo_root)
SKIP_CONFIRM=false
KEEP_BRANCH=false

# =============================================================================
# Parse Arguments
# =============================================================================
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    -y|--yes)
      SKIP_CONFIRM=true
      shift
      ;;
    --keep-branch)
      KEEP_BRANCH=true
      shift
      ;;
    --list|--merged|--all)
      ACTION="${1#--}"
      shift
      ;;
    -*)
      log_error "Unknown option: $1"
      exit 1
      ;;
    *)
      POSITIONAL_ARGS+=("$1")
      shift
      ;;
  esac
done

# =============================================================================
# List Worktrees
# =============================================================================
cmd_list() {
  echo -e "${BLUE}=== Git Worktrees ===${NC}"
  echo ""

  cd "$PROJECT_ROOT"
  git worktree list

  echo ""

  # Show registry info
  AGENTS_DIR=$(get_agents_dir)
  REGISTRY_FILE="${AGENTS_DIR}/registry.json"

  if [ -f "$REGISTRY_FILE" ]; then
    echo -e "${BLUE}=== Registered Agents ===${NC}"
    echo ""
    jq -r '.agents[] | "  \(.id): PID=\(.pid) [\(.worktree_path)]"' "$REGISTRY_FILE" 2>/dev/null || echo "  (none)"
    echo ""
  fi
}

# =============================================================================
# Archive Feature
# =============================================================================
archive_feature() {
  local worktree_path="$1"

  # Find feature directory from registry
  AGENTS_DIR=$(get_agents_dir)
  REGISTRY_FILE="${AGENTS_DIR}/registry.json"

  if [ ! -f "$REGISTRY_FILE" ]; then
    return 0
  fi

  FEATURE_DIR=$(jq -r --arg path "$worktree_path" '.agents[] | select(.worktree_path == $path) | .feature_dir' "$REGISTRY_FILE" 2>/dev/null)

  if [ -z "$FEATURE_DIR" ] || [ "$FEATURE_DIR" = "null" ]; then
    return 0
  fi

  FEATURE_DIR_ABS="${PROJECT_ROOT}/${FEATURE_DIR}"
  if [ ! -d "$FEATURE_DIR_ABS" ]; then
    return 0
  fi

  # Complete backlog issue if linked
  local feature_json="${FEATURE_DIR_ABS}/feature.json"
  if [ -f "$feature_json" ]; then
    local backlog_ref=$(jq -r '.backlog_ref // empty' "$feature_json")
    if [ -n "$backlog_ref" ]; then
      complete_backlog_issue "$backlog_ref" "$PROJECT_ROOT"
      log_info "Completed backlog issue: $backlog_ref"
    fi
  fi

  # Archive to archive/{YYYY-MM}/
  local features_dir=$(get_features_dir)
  local archive_dir="$features_dir/archive"
  local year_month=$(date +%Y-%m)
  local month_dir="$archive_dir/$year_month"

  mkdir -p "$month_dir"

  local feature_name=$(basename "$FEATURE_DIR")
  mv "$FEATURE_DIR_ABS" "$month_dir/"

  log_success "Archived feature: $feature_name -> archive/$year_month/"
}

# =============================================================================
# Remove from Registry
# =============================================================================
remove_from_registry() {
  local worktree_path="$1"

  AGENTS_DIR=$(get_agents_dir)
  REGISTRY_FILE="${AGENTS_DIR}/registry.json"

  if [ ! -f "$REGISTRY_FILE" ]; then
    return 0
  fi

  # Remove by worktree path
  local updated=$(jq --arg path "$worktree_path" '.agents = [.agents[] | select(.worktree_path != $path)]' "$REGISTRY_FILE")
  echo "$updated" | jq '.' > "$REGISTRY_FILE"

  log_info "Removed from registry"
}

# =============================================================================
# Cleanup from Registry Only (no worktree)
# =============================================================================
cleanup_registry_only() {
  local search="$1"

  AGENTS_DIR=$(get_agents_dir)
  REGISTRY_FILE="${AGENTS_DIR}/registry.json"

  if [ ! -f "$REGISTRY_FILE" ]; then
    log_error "No registry found"
    exit 1
  fi

  # Find agent by id or feature_dir containing search term (use -c for compact single-line JSON)
  local agent_info=$(jq -c --arg search "$search" '[.agents[] | select(.id == $search or (.feature_dir | contains($search)))] | first' "$REGISTRY_FILE" 2>/dev/null)

  if [ -z "$agent_info" ] || [ "$agent_info" = "null" ]; then
    log_error "No agent found in registry matching: $search"
    exit 1
  fi

  local agent_id=$(echo "$agent_info" | jq -r '.id')
  local feature_dir=$(echo "$agent_info" | jq -r '.feature_dir')
  local worktree_path=$(echo "$agent_info" | jq -r '.worktree_path')

  echo ""
  echo -e "${BLUE}=== Cleanup Agent (no worktree) ===${NC}"
  echo "  Agent ID:    $agent_id"
  echo "  Feature Dir: $feature_dir"
  echo ""

  # Confirmation
  if [ "$SKIP_CONFIRM" != "true" ]; then
    if [ -t 0 ]; then
      read -p "Archive feature and remove from registry? [y/N] " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Aborted"
        exit 0
      fi
    else
      log_error "Non-interactive mode detected. Use -y to skip confirmation."
      exit 1
    fi
  fi

  # 1. Archive feature directory if exists
  FEATURE_DIR_ABS="${PROJECT_ROOT}/${feature_dir}"
  if [ -d "$FEATURE_DIR_ABS" ]; then
    # Complete backlog issue if linked
    local feature_json_path="${FEATURE_DIR_ABS}/feature.json"
    if [ -f "$feature_json_path" ]; then
      local backlog_ref=$(jq -r '.backlog_ref // empty' "$feature_json_path")
      if [ -n "$backlog_ref" ]; then
        complete_backlog_issue "$backlog_ref" "$PROJECT_ROOT"
        log_info "Completed backlog issue: $backlog_ref"
      fi
    fi

    local features_dir=$(get_features_dir)
    local archive_dir="$features_dir/archive"
    local year_month=$(date +%Y-%m)
    local month_dir="$archive_dir/$year_month"

    mkdir -p "$month_dir"

    local feature_name=$(basename "$feature_dir")
    mv "$FEATURE_DIR_ABS" "$month_dir/"
    log_success "Archived feature: $feature_name -> archive/$year_month/"
  fi

  # 2. Remove from registry
  local updated=$(jq --arg id "$agent_id" '.agents = [.agents[] | select(.id != $id)]' "$REGISTRY_FILE")
  echo "$updated" | jq '.' > "$REGISTRY_FILE"
  log_success "Removed from registry: $agent_id"

  log_success "Cleanup complete"
}

# =============================================================================
# Cleanup Single Worktree
# =============================================================================
cleanup_worktree() {
  local branch="$1"

  cd "$PROJECT_ROOT"

  # Find worktree path for branch
  # porcelain format: worktree line comes BEFORE branch line, so use -B2
  local worktree_info=$(git worktree list --porcelain | grep -B2 "branch refs/heads/$branch" | head -3)
  local worktree_path=$(echo "$worktree_info" | grep "^worktree " | cut -d' ' -f2-)

  if [ -z "$worktree_path" ]; then
    # No worktree found, try to cleanup from registry only
    log_warn "No worktree found for: $branch"
    log_info "Trying to cleanup from registry..."
    cleanup_registry_only "$branch"
    return
  fi

  echo ""
  echo -e "${BLUE}=== Cleanup Worktree ===${NC}"
  echo "  Branch:   $branch"
  echo "  Worktree: $worktree_path"
  echo ""

  # Confirmation
  if [ "$SKIP_CONFIRM" != "true" ]; then
    # Check if running interactively
    if [ -t 0 ]; then
      read -p "Remove this worktree? [y/N] " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Aborted"
        exit 0
      fi
    else
      log_error "Non-interactive mode detected. Use -y to skip confirmation."
      exit 1
    fi
  fi

  # 1. Archive feature
  archive_feature "$worktree_path"

  # 2. Remove from registry
  remove_from_registry "$worktree_path"

  # 3. Remove worktree
  log_info "Removing worktree..."
  git worktree remove "$worktree_path" --force 2>/dev/null || rm -rf "$worktree_path"
  log_success "Worktree removed"

  # 4. Delete branch (optional)
  if [ "$KEEP_BRANCH" != "true" ]; then
    log_info "Deleting branch..."
    git branch -D "$branch" 2>/dev/null || log_warn "Could not delete branch (may be checked out elsewhere)"
  fi

  log_success "Cleanup complete for: $branch"
}

# =============================================================================
# Cleanup Merged Worktrees
# =============================================================================
cmd_merged() {
  cd "$PROJECT_ROOT"

  local main_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

  echo -e "${BLUE}=== Finding Merged Worktrees ===${NC}"
  echo ""

  local merged_branches=$(git branch --merged "$main_branch" | grep -v "^\*" | grep -v "$main_branch" | tr -d ' ')

  if [ -z "$merged_branches" ]; then
    log_info "No merged branches found"
    exit 0
  fi

  local worktree_branches=""
  while IFS= read -r branch; do
    if git worktree list | grep -q "\[$branch\]"; then
      worktree_branches="$worktree_branches $branch"
      echo "  - $branch"
    fi
  done <<< "$merged_branches"

  if [ -z "$worktree_branches" ]; then
    log_info "No merged worktrees found"
    exit 0
  fi

  echo ""

  if [ "$SKIP_CONFIRM" != "true" ]; then
    if [ -t 0 ]; then
      read -p "Remove these merged worktrees? [y/N] " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Aborted"
        exit 0
      fi
    else
      log_error "Non-interactive mode detected. Use -y to skip confirmation."
      exit 1
    fi
  fi

  for branch in $worktree_branches; do
    cleanup_worktree "$branch"
  done
}

# =============================================================================
# Cleanup All Worktrees
# =============================================================================
cmd_all() {
  cd "$PROJECT_ROOT"

  echo -e "${BLUE}=== All Worktrees ===${NC}"
  echo ""

  local worktrees=$(git worktree list --porcelain | grep "^worktree " | grep -v "$PROJECT_ROOT$" | cut -d' ' -f2-)

  if [ -z "$worktrees" ]; then
    log_info "No worktrees to remove"
    exit 0
  fi

  while IFS= read -r wt; do
    echo "  - $wt"
  done <<< "$worktrees"

  echo ""

  if [ "$SKIP_CONFIRM" != "true" ]; then
    if [ -t 0 ]; then
      echo -e "${RED}WARNING: This will remove ALL worktrees!${NC}"
      read -p "Are you sure? [y/N] " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Aborted"
        exit 0
      fi
    else
      log_error "Non-interactive mode detected. Use -y to skip confirmation."
      exit 1
    fi
  fi

  while IFS= read -r wt; do
    local branch=$(git worktree list | grep "$wt" | awk '{print $NF}' | tr -d '[]')
    if [ -n "$branch" ]; then
      cleanup_worktree "$branch"
    fi
  done <<< "$worktrees"
}

# =============================================================================
# Main
# =============================================================================
case "${ACTION:-}" in
  list)
    cmd_list
    ;;
  merged)
    cmd_merged
    ;;
  all)
    cmd_all
    ;;
  *)
    if [ ${#POSITIONAL_ARGS[@]} -eq 0 ]; then
      echo "Usage:"
      echo "  $0 <branch-name>      Remove specific worktree"
      echo "  $0 --list             List all worktrees"
      echo "  $0 --merged           Remove merged worktrees"
      echo "  $0 --all              Remove all worktrees"
      echo ""
      echo "Options:"
      echo "  -y, --yes             Skip confirmation"
      echo "  --keep-branch         Don't delete git branch"
      exit 1
    fi
    cleanup_worktree "${POSITIONAL_ARGS[0]}"
    ;;
esac
