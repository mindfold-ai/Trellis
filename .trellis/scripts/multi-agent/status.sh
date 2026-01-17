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
    --progress)
      ACTION="progress"
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

# Get the last tool call from agent log
get_last_tool() {
  local log_file="$1"
  if [ ! -f "$log_file" ]; then
    echo ""
    return
  fi
  # Use tail -r on macOS, tac on Linux
  if command -v tac &>/dev/null; then
    tac "$log_file" 2>/dev/null | head -100 | jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' 2>/dev/null | head -1
  else
    tail -r "$log_file" 2>/dev/null | head -100 | jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' 2>/dev/null | head -1
  fi
}

# Get the last assistant text from agent log
get_last_message() {
  local log_file="$1"
  local max_len="${2:-100}"
  if [ ! -f "$log_file" ]; then
    echo ""
    return
  fi
  local text
  # Use tail -r on macOS, tac on Linux
  if command -v tac &>/dev/null; then
    text=$(tac "$log_file" 2>/dev/null | head -100 | jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' 2>/dev/null | head -1)
  else
    text=$(tail -r "$log_file" 2>/dev/null | head -100 | jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' 2>/dev/null | head -1)
  fi
  if [ -n "$text" ] && [ "$text" != "null" ]; then
    echo "${text:0:$max_len}"
  fi
}

# Get recent task notifications from agent log
get_recent_tasks() {
  local log_file="$1"
  local count="${2:-5}"
  if [ ! -f "$log_file" ]; then
    return
  fi
  tail -200 "$log_file" 2>/dev/null | jq -r 'select(.type=="system" and .subtype=="task_notification") | "\(.status)|\(.summary)"' 2>/dev/null | tail -"$count"
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
  $0 --progress <feature>    Quick progress view with recent activity
  $0 --watch <feature>       Watch agent log in real-time
  $0 --log <feature>         Show recent log entries
  $0 --registry              Show agent registry

Examples:
  $0 --detail my-feature
  $0 --progress my-feature
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

# Calculate elapsed time from ISO timestamp
calc_elapsed() {
  local started="$1"
  if [ -z "$started" ] || [ "$started" = "null" ]; then
    echo "N/A"
    return
  fi

  # Parse started time (handle both formats: with and without timezone)
  local start_epoch
  if command -v gdate &>/dev/null; then
    start_epoch=$(gdate -d "$started" +%s 2>/dev/null)
  else
    # Try to parse ISO format
    start_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${started%%+*}" +%s 2>/dev/null || date -d "$started" +%s 2>/dev/null)
  fi

  if [ -z "$start_epoch" ]; then
    echo "N/A"
    return
  fi

  local now_epoch=$(date +%s)
  local elapsed=$((now_epoch - start_epoch))

  if [ $elapsed -lt 60 ]; then
    echo "${elapsed}s"
  elif [ $elapsed -lt 3600 ]; then
    echo "$((elapsed / 60))m $((elapsed % 60))s"
  else
    echo "$((elapsed / 3600))h $((elapsed % 3600 / 60))m"
  fi
}

# Get phase info from feature.json
get_phase_info() {
  local feature_json="$1"
  if [ ! -f "$feature_json" ]; then
    echo "N/A"
    return
  fi

  local current_phase=$(jq -r '.current_phase // 0' "$feature_json")
  local total_phases=$(jq -r '.next_action | length // 0' "$feature_json")
  local action_name=$(jq -r --argjson phase "$current_phase" '.next_action[$phase - 1].action // "pending"' "$feature_json" 2>/dev/null)

  if [ "$current_phase" = "0" ] || [ "$current_phase" = "null" ]; then
    echo "0/${total_phases} (pending)"
  else
    echo "${current_phase}/${total_phases} (${action_name})"
  fi
}

# Count modified files in worktree
count_modified_files() {
  local worktree="$1"
  if [ -d "$worktree" ]; then
    cd "$worktree" && git status --short 2>/dev/null | wc -l | tr -d ' '
  else
    echo "0"
  fi
}

cmd_summary() {
  ensure_developer

  local features_dir=$(get_features_dir)
  if [ ! -d "$features_dir" ]; then
    echo "No features directory found"
    exit 0
  fi

  AGENTS_DIR=$(get_agents_dir)
  REGISTRY_FILE="${AGENTS_DIR}/registry.json"

  # Count running agents
  local running_count=0
  local total_agents=0
  if [ -f "$REGISTRY_FILE" ]; then
    total_agents=$(jq -r '.agents | length' "$REGISTRY_FILE" 2>/dev/null || echo "0")
    while read -r pid; do
      is_running "$pid" && ((running_count++))
    done < <(jq -r '.agents[].pid' "$REGISTRY_FILE" 2>/dev/null)
  fi

  echo -e "${BLUE}=== Multi-Agent Status ===${NC}"
  echo -e "  Agents: ${GREEN}${running_count}${NC} running / ${total_agents} registered"
  echo ""

  # Check if any agents are running and show detailed view
  local has_running_agent=false

  for d in "$features_dir"/*/; do
    [ ! -d "$d" ] && continue
    [[ "$(basename "$d")" == "archive" ]] && continue

    local name=$(basename "$d")
    local feature_json="$d/feature.json"
    local status="unknown"

    if [ -f "$feature_json" ]; then
      status=$(jq -r '.status // "unknown"' "$feature_json")
    fi

    # Check agent status
    local agent_info=""
    local pid=""
    local worktree=""
    local started=""
    local is_agent_running=false

    if [ -f "$REGISTRY_FILE" ]; then
      agent_info=$(jq -r --arg name "$name" '.agents[] | select(.feature_dir | contains($name))' "$REGISTRY_FILE" 2>/dev/null)
      if [ -n "$agent_info" ] && [ "$agent_info" != "null" ]; then
        pid=$(echo "$agent_info" | jq -r '.pid')
        worktree=$(echo "$agent_info" | jq -r '.worktree_path')
        started=$(echo "$agent_info" | jq -r '.started_at')
        if is_running "$pid"; then
          is_agent_running=true
          has_running_agent=true
        fi
      fi
    fi

    local color=$(status_color "$status")

    if [ "$is_agent_running" = true ]; then
      # Detailed view for running agents
      # Read feature.json from worktree (has live phase info)
      local feature_dir_rel=$(echo "$agent_info" | jq -r '.feature_dir')
      local worktree_feature_json="$worktree/$feature_dir_rel/feature.json"
      local phase_source="$feature_json"
      [ -f "$worktree_feature_json" ] && phase_source="$worktree_feature_json"

      local phase_info=$(get_phase_info "$phase_source")
      local elapsed=$(calc_elapsed "$started")
      local modified=$(count_modified_files "$worktree")
      local branch=$(jq -r '.branch // "N/A"' "$phase_source" 2>/dev/null)

      # Get recent activity from log
      local log_file="$worktree/.agent-log"
      local last_tool=$(get_last_tool "$log_file")

      echo -e "${GREEN}▶${NC} ${CYAN}${name}${NC} ${GREEN}[running]${NC}"
      echo -e "  Phase:    ${phase_info}"
      echo -e "  Elapsed:  ${elapsed}"
      echo -e "  Branch:   ${DIM}${branch}${NC}"
      echo -e "  Modified: ${modified} file(s)"
      if [ -n "$last_tool" ]; then
        echo -e "  Activity: ${YELLOW}${last_tool}${NC}"
      fi
      echo -e "  PID:      ${DIM}${pid}${NC}"
      echo ""
    elif [ -n "$agent_info" ] && [ "$agent_info" != "null" ]; then
      # Stopped agent
      echo -e "${RED}○${NC} ${name} ${RED}[stopped]${NC}"
      echo -e "  ${DIM}PID ${pid} is no longer running${NC}"
      echo ""
    else
      # No agent, just show status
      echo -e "  ${color}●${NC} ${name} (${status})"
    fi
  done

  if [ "$has_running_agent" = true ]; then
    echo -e "${DIM}─────────────────────────────────────${NC}"
    echo -e "${DIM}Use --progress <name> for quick activity view${NC}"
    echo -e "${DIM}Use --detail <name> for more info${NC}"
  fi
  echo ""
}

cmd_progress() {
  if [ -z "$TARGET" ]; then
    echo "Usage: $0 --progress <feature>"
    exit 1
  fi

  local agent=$(find_agent "$TARGET")
  if [ -z "$agent" ] || [ "$agent" = "null" ]; then
    echo "Agent not found: $TARGET"
    exit 1
  fi

  local id=$(echo "$agent" | jq -r '.id')
  local worktree=$(echo "$agent" | jq -r '.worktree_path')
  local log_file="$worktree/.agent-log"

  if [ ! -f "$log_file" ]; then
    echo "Log file not found: $log_file"
    exit 1
  fi

  echo ""
  echo -e "${BLUE}=== Progress: ${id} ===${NC}"
  echo ""

  # Recent task notifications
  echo -e "${CYAN}Recent Tasks:${NC}"
  local has_tasks=false
  while IFS='|' read -r status summary; do
    [ -z "$status" ] && continue
    has_tasks=true
    local icon
    case "$status" in
      completed) icon="${GREEN}✓${NC}" ;;
      failed) icon="${RED}✗${NC}" ;;
      *) icon="${YELLOW}○${NC}" ;;
    esac
    echo -e "  ${icon} ${summary}"
  done < <(get_recent_tasks "$log_file" 5)

  if [ "$has_tasks" = false ]; then
    echo -e "  ${DIM}(no task notifications yet)${NC}"
  fi
  echo ""

  # Current activity
  echo -e "${CYAN}Current Activity:${NC}"
  local last_tool=$(get_last_tool "$log_file")
  if [ -n "$last_tool" ]; then
    echo -e "  Tool: ${YELLOW}${last_tool}${NC}"
  else
    echo -e "  ${DIM}(no recent tool calls)${NC}"
  fi
  echo ""

  # Last message
  echo -e "${CYAN}Last Message:${NC}"
  local last_msg=$(get_last_message "$log_file" 200)
  if [ -n "$last_msg" ]; then
    echo -e "  \"${last_msg}...\""
  else
    echo -e "  ${DIM}(no recent messages)${NC}"
  fi
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
  progress)
    cmd_progress
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
