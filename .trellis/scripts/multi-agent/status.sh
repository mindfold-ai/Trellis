#!/bin/bash
# =============================================================================
# Multi-Agent Pipeline: Status Monitor
# =============================================================================
# Usage:
#   ./status.sh                     Show summary of all features (default)
#   ./status.sh --list              List all worktrees and agents
#   ./status.sh --detail <feature>  Detailed feature status
#   ./status.sh --watch <feature>   Watch agent log in real-time
#   ./status.sh --log <feature>     Show recent log entries
#   ./status.sh --registry          Show agent registry
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/paths.sh"
source "$SCRIPT_DIR/../common/worktree.sh"
source "$SCRIPT_DIR/../common/developer.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

PROJECT_ROOT=$(get_repo_root)

# =============================================================================
# Parse Arguments
# =============================================================================
ACTION="summary"
TARGET=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --list)
      ACTION="list"
      shift
      ;;
    --detail)
      ACTION="detail"
      TARGET="$2"
      shift 2
      ;;
    --watch)
      ACTION="watch"
      TARGET="$2"
      shift 2
      ;;
    --log)
      ACTION="log"
      TARGET="$2"
      shift 2
      ;;
    --registry)
      ACTION="registry"
      shift
      ;;
    -h|--help)
      ACTION="help"
      shift
      ;;
    *)
      TARGET="$1"
      shift
      ;;
  esac
done

# =============================================================================
# Helper Functions
# =============================================================================

# Check if PID is running
is_running() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# Get status color
status_color() {
  local status="$1"
  case "$status" in
    completed) echo "${GREEN}" ;;
    in_progress) echo "${BLUE}" ;;
    planning) echo "${YELLOW}" ;;
    *) echo "${DIM}" ;;
  esac
}

# Find agent by feature name or ID
find_agent() {
  local search="$1"
  AGENTS_DIR=$(get_agents_dir)
  REGISTRY_FILE="${AGENTS_DIR}/registry.json"

  if [ ! -f "$REGISTRY_FILE" ]; then
    return 1
  fi

  # Try exact ID match first
  local agent=$(jq -r --arg id "$search" '.agents[] | select(.id == $id)' "$REGISTRY_FILE" 2>/dev/null)

  # Try partial match on feature_dir
  if [ -z "$agent" ] || [ "$agent" = "null" ]; then
    agent=$(jq -r --arg search "$search" '.agents[] | select(.feature_dir | contains($search))' "$REGISTRY_FILE" 2>/dev/null | head -1)
  fi

  echo "$agent"
}

# =============================================================================
# Commands
# =============================================================================

cmd_help() {
  cat << EOF
Multi-Agent Pipeline: Status Monitor

Usage:
  $0                         Show summary of all features
  $0 --list                  List all worktrees and agents
  $0 --detail <feature>      Detailed feature status
  $0 --watch <feature>       Watch agent log in real-time
  $0 --log <feature>         Show recent log entries
  $0 --registry              Show agent registry

Examples:
  $0 --detail my-feature
  $0 --watch 16-worktree-support
  $0 --log worktree-support
EOF
}

cmd_list() {
  echo -e "${BLUE}=== Git Worktrees ===${NC}"
  echo ""
  cd "$PROJECT_ROOT"
  git worktree list
  echo ""

  echo -e "${BLUE}=== Registered Agents ===${NC}"
  echo ""

  AGENTS_DIR=$(get_agents_dir)
  REGISTRY_FILE="${AGENTS_DIR}/registry.json"

  if [ ! -f "$REGISTRY_FILE" ]; then
    echo "  (no registry found)"
    return
  fi

  local agents=$(jq -r '.agents[]' "$REGISTRY_FILE" 2>/dev/null)
  if [ -z "$agents" ]; then
    echo "  (no agents registered)"
    return
  fi

  jq -r '.agents[] | "\(.id)|\(.pid)|\(.worktree_path)|\(.started_at)"' "$REGISTRY_FILE" 2>/dev/null | while IFS='|' read -r id pid wt started; do
    local status_icon
    if is_running "$pid"; then
      status_icon="${GREEN}●${NC}"
    else
      status_icon="${RED}○${NC}"
    fi
    echo -e "  $status_icon $id (PID: $pid)"
    echo -e "    ${DIM}Worktree: $wt${NC}"
    echo -e "    ${DIM}Started:  $started${NC}"
    echo ""
  done
}

cmd_summary() {
  ensure_developer

  local features_dir=$(get_features_dir)
  if [ ! -d "$features_dir" ]; then
    echo "No features directory found"
    exit 0
  fi

  echo -e "${BLUE}=== Feature Summary ===${NC}"
  echo ""

  AGENTS_DIR=$(get_agents_dir)
  REGISTRY_FILE="${AGENTS_DIR}/registry.json"

  for d in "$features_dir"/*/; do
    [ ! -d "$d" ] && continue
    [[ "$(basename "$d")" == "archive" ]] && continue

    local name=$(basename "$d")
    local feature_json="$d/feature.json"
    local status="unknown"
    local agent_status=""

    if [ -f "$feature_json" ]; then
      status=$(jq -r '.status // "unknown"' "$feature_json")
    fi

    # Check agent status
    if [ -f "$REGISTRY_FILE" ]; then
      local agent_info=$(jq -r --arg name "$name" '.agents[] | select(.feature_dir | contains($name))' "$REGISTRY_FILE" 2>/dev/null)
      if [ -n "$agent_info" ] && [ "$agent_info" != "null" ]; then
        local pid=$(echo "$agent_info" | jq -r '.pid')
        if is_running "$pid"; then
          agent_status=" ${GREEN}[agent running]${NC}"
        else
          agent_status=" ${RED}[agent stopped]${NC}"
        fi
      fi
    fi

    local color=$(status_color "$status")
    echo -e "  ${color}●${NC} $name ($status)$agent_status"
  done

  echo ""
}

cmd_detail() {
  if [ -z "$TARGET" ]; then
    echo "Usage: $0 --detail <feature>"
    exit 1
  fi

  local agent=$(find_agent "$TARGET")
  if [ -z "$agent" ] || [ "$agent" = "null" ]; then
    echo "Agent not found: $TARGET"
    exit 1
  fi

  local id=$(echo "$agent" | jq -r '.id')
  local pid=$(echo "$agent" | jq -r '.pid')
  local worktree=$(echo "$agent" | jq -r '.worktree_path')
  local feature_dir=$(echo "$agent" | jq -r '.feature_dir')
  local started=$(echo "$agent" | jq -r '.started_at')

  echo -e "${BLUE}=== Agent Detail: $id ===${NC}"
  echo ""
  echo "  ID:          $id"
  echo "  PID:         $pid"
  echo "  Worktree:    $worktree"
  echo "  Feature Dir: $feature_dir"
  echo "  Started:     $started"
  echo ""

  # Status
  if is_running "$pid"; then
    echo -e "  Status:      ${GREEN}Running${NC}"
  else
    echo -e "  Status:      ${RED}Stopped${NC}"
  fi

  # Feature info
  local feature_json="$PROJECT_ROOT/$feature_dir/feature.json"
  if [ -f "$feature_json" ]; then
    echo ""
    echo -e "${BLUE}=== Feature Info ===${NC}"
    echo ""
    local status=$(jq -r '.status // "unknown"' "$feature_json")
    local branch=$(jq -r '.branch // "N/A"' "$feature_json")
    local base=$(jq -r '.base_branch // "N/A"' "$feature_json")
    echo "  Status:      $status"
    echo "  Branch:      $branch"
    echo "  Base Branch: $base"
  fi

  # Git changes
  if [ -d "$worktree" ]; then
    echo ""
    echo -e "${BLUE}=== Git Changes ===${NC}"
    echo ""
    cd "$worktree"
    local changes=$(git status --short 2>/dev/null | head -10)
    if [ -n "$changes" ]; then
      echo "$changes" | sed 's/^/  /'
      local total=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
      if [ "$total" -gt 10 ]; then
        echo "  ... and $((total - 10)) more"
      fi
    else
      echo "  (no changes)"
    fi
  fi

  echo ""
}

cmd_watch() {
  if [ -z "$TARGET" ]; then
    echo "Usage: $0 --watch <feature>"
    exit 1
  fi

  local agent=$(find_agent "$TARGET")
  if [ -z "$agent" ] || [ "$agent" = "null" ]; then
    echo "Agent not found: $TARGET"
    exit 1
  fi

  local worktree=$(echo "$agent" | jq -r '.worktree_path')
  local log_file="$worktree/.agent-log"

  if [ ! -f "$log_file" ]; then
    echo "Log file not found: $log_file"
    exit 1
  fi

  echo -e "${BLUE}Watching:${NC} $log_file"
  echo -e "${DIM}Press Ctrl+C to stop${NC}"
  echo ""

  tail -f "$log_file"
}

cmd_log() {
  if [ -z "$TARGET" ]; then
    echo "Usage: $0 --log <feature>"
    exit 1
  fi

  local agent=$(find_agent "$TARGET")
  if [ -z "$agent" ] || [ "$agent" = "null" ]; then
    echo "Agent not found: $TARGET"
    exit 1
  fi

  local worktree=$(echo "$agent" | jq -r '.worktree_path')
  local log_file="$worktree/.agent-log"

  if [ ! -f "$log_file" ]; then
    echo "Log file not found: $log_file"
    exit 1
  fi

  echo -e "${BLUE}=== Recent Log: $TARGET ===${NC}"
  echo ""

  # Parse and format JSON log entries
  tail -50 "$log_file" | while IFS= read -r line; do
    local type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null)
    [ -z "$type" ] && continue

    case "$type" in
      system)
        local subtype=$(echo "$line" | jq -r '.subtype // ""' 2>/dev/null)
        echo -e "${CYAN}[SYSTEM]${NC} $subtype"
        ;;
      user)
        local content=$(echo "$line" | jq -r '.message.content // empty' 2>/dev/null)
        if [ -n "$content" ] && [ "$content" != "null" ]; then
          echo -e "${GREEN}[USER]${NC} ${content:0:200}"
        fi
        ;;
      assistant)
        # Extract text or tool use
        local text=$(echo "$line" | jq -r '.message.content[0].text // empty' 2>/dev/null)
        local tool=$(echo "$line" | jq -r '.message.content[0].name // empty' 2>/dev/null)

        if [ -n "$text" ] && [ "$text" != "null" ]; then
          # Truncate long text
          local display="${text:0:300}"
          [ ${#text} -gt 300 ] && display="$display..."
          echo -e "${BLUE}[ASSISTANT]${NC} $display"
        elif [ -n "$tool" ] && [ "$tool" != "null" ]; then
          echo -e "${YELLOW}[TOOL]${NC} $tool"
        fi
        ;;
      result)
        local tool_name=$(echo "$line" | jq -r '.tool // "unknown"' 2>/dev/null)
        echo -e "${DIM}[RESULT]${NC} $tool_name completed"
        ;;
    esac
  done
}

cmd_registry() {
  AGENTS_DIR=$(get_agents_dir)
  REGISTRY_FILE="${AGENTS_DIR}/registry.json"

  echo -e "${BLUE}=== Agent Registry ===${NC}"
  echo ""
  echo "File: $REGISTRY_FILE"
  echo ""

  if [ -f "$REGISTRY_FILE" ]; then
    jq '.' "$REGISTRY_FILE"
  else
    echo "(registry not found)"
  fi
}

# =============================================================================
# Main
# =============================================================================
case "$ACTION" in
  help)
    cmd_help
    ;;
  list)
    cmd_list
    ;;
  summary)
    cmd_summary
    ;;
  detail)
    cmd_detail
    ;;
  watch)
    cmd_watch
    ;;
  log)
    cmd_log
    ;;
  registry)
    cmd_registry
    ;;
esac
