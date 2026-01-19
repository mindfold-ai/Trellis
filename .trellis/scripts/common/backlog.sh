#!/bin/bash
# Backlog utility functions
#
# Usage: source this file in other scripts
#   source "$(dirname "$0")/common/backlog.sh"
#
# Provides:
#   create_backlog_issue   - Create backlog JSON file
#   delete_backlog_issue   - Delete backlog file
#   list_backlog_issues    - List all backlog issues
#   get_backlog_stats      - Get P0/P1/P2/P3 counts

# Ensure paths.sh is loaded
if ! type get_repo_root &>/dev/null; then
  echo "Error: paths.sh must be sourced before backlog.sh" >&2
  exit 1
fi

# =============================================================================
# Helper Functions
# =============================================================================

# Convert title to slug (only works with ASCII)
_slugify() {
  local result=$(echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
  echo "$result"
}

# Ensure backlog directory exists
_ensure_backlog_dir() {
  local repo_root="${1:-$(get_repo_root)}"
  local backlog_dir=$(get_backlog_dir "$repo_root")
  if [[ ! -d "$backlog_dir" ]]; then
    mkdir -p "$backlog_dir"
  fi
}

# =============================================================================
# Public Functions
# =============================================================================

# Create a backlog issue
# Args: title, assignee, priority, [slug], [description], [creator]
# Returns: issue ID (e.g., "260119-my-feature")
create_backlog_issue() {
  local title="$1"
  local assignee="$2"
  local priority="${3:-P2}"
  local slug="$4"
  local description="${5:-}"
  local creator="${6:-$assignee}"
  local repo_root="${7:-$(get_repo_root)}"

  # Validate required fields
  if [[ -z "$title" ]] || [[ -z "$assignee" ]]; then
    echo "Error: title and assignee are required" >&2
    return 1
  fi

  # Validate priority
  if [[ ! "$priority" =~ ^P[0-3]$ ]]; then
    echo "Error: priority must be P0, P1, P2, or P3" >&2
    return 1
  fi

  # Validate assignee exists
  local assignee_dir="$repo_root/$DIR_WORKFLOW/$DIR_PROGRESS/$assignee"
  if [[ ! -d "$assignee_dir" ]]; then
    echo "Error: developer '$assignee' not found" >&2
    return 1
  fi

  _ensure_backlog_dir "$repo_root"

  # Generate slug if not provided
  if [[ -z "$slug" ]]; then
    slug=$(_slugify "$title")
  fi

  # Validate slug
  if [[ -z "$slug" ]]; then
    echo "Error: could not generate slug from title" >&2
    return 1
  fi

  # Generate ID
  local date_prefix=$(generate_backlog_id)
  local id="${date_prefix}-${slug}"
  local backlog_dir=$(get_backlog_dir "$repo_root")
  local issue_file="$backlog_dir/${id}.json"

  # Check if file exists
  if [[ -f "$issue_file" ]]; then
    echo "Error: issue already exists: ${id}.json" >&2
    return 1
  fi

  # Create issue JSON
  local created_at=$(date -Iseconds)
  cat > "$issue_file" << EOF
{
  "id": "$id",
  "title": "$title",
  "description": "$description",
  "priority": "$priority",
  "status": "in_progress",
  "assigned_to": "$assignee",
  "created_by": "$creator",
  "created_at": "$created_at"
}
EOF

  # Return the ID
  echo "$id"
}

# Complete a backlog issue (set status to done)
# Args: backlog_ref (e.g., "260119-my-feature.json")
complete_backlog_issue() {
  local backlog_ref="$1"
  local repo_root="${2:-$(get_repo_root)}"

  if [[ -z "$backlog_ref" ]]; then
    return 0
  fi

  local backlog_dir=$(get_backlog_dir "$repo_root")
  local backlog_file="$backlog_dir/$backlog_ref"

  if [[ -f "$backlog_file" ]]; then
    local completed_at=$(date -Iseconds)
    jq --arg completed_at "$completed_at" '.status = "done" | .completed_at = $completed_at' "$backlog_file" > "${backlog_file}.tmp"
    mv "${backlog_file}.tmp" "$backlog_file"
    return 0
  fi

  return 1
}

# Delete a backlog issue by filename
# Args: backlog_ref (e.g., "260119-my-feature.json")
delete_backlog_issue() {
  local backlog_ref="$1"
  local repo_root="${2:-$(get_repo_root)}"

  if [[ -z "$backlog_ref" ]]; then
    return 0
  fi

  local backlog_dir=$(get_backlog_dir "$repo_root")
  local backlog_file="$backlog_dir/$backlog_ref"

  if [[ -f "$backlog_file" ]]; then
    rm -f "$backlog_file"
    return 0
  fi

  return 1
}

# List backlog issues
# Args: [filter_priority], [filter_status]
# Output: formatted list to stdout
list_backlog_issues() {
  local filter_priority="$1"
  local filter_status="$2"
  local repo_root="${3:-$(get_repo_root)}"

  local backlog_dir=$(get_backlog_dir "$repo_root")

  if [[ ! -d "$backlog_dir" ]]; then
    return 0
  fi

  for f in "$backlog_dir"/*.json; do
    if [[ -f "$f" ]]; then
      local id=$(jq -r '.id' "$f")
      local title=$(jq -r '.title' "$f")
      local priority=$(jq -r '.priority // "P2"' "$f")
      local status=$(jq -r '.status // "open"' "$f")
      local assignee=$(jq -r '.assigned_to' "$f")

      # Apply filters
      if [[ -n "$filter_priority" ]] && [[ "$priority" != "$filter_priority" ]]; then
        continue
      fi
      if [[ -n "$filter_status" ]] && [[ "$status" != "$filter_status" ]]; then
        continue
      fi

      echo "$priority|$id|$title|$status|$assignee"
    fi
  done
}

# Get backlog statistics
# Output: "P0:N P1:N P2:N P3:N Total:N"
get_backlog_stats() {
  local repo_root="${1:-$(get_repo_root)}"
  local backlog_dir=$(get_backlog_dir "$repo_root")

  local p0=0 p1=0 p2=0 p3=0 total=0

  if [[ -d "$backlog_dir" ]]; then
    for f in "$backlog_dir"/*.json; do
      if [[ -f "$f" ]]; then
        local priority=$(jq -r '.priority // "P2"' "$f" 2>/dev/null)
        case "$priority" in
          P0) ((p0++)) ;;
          P1) ((p1++)) ;;
          P2) ((p2++)) ;;
          P3) ((p3++)) ;;
        esac
        ((total++))
      fi
    done
  fi

  echo "P0:$p0 P1:$p1 P2:$p2 P3:$p3 Total:$total"
}
