#!/bin/bash
# =============================================================================
# Phase Management Utilities
# =============================================================================
# Centralized phase tracking for multi-agent pipeline
#
# Usage:
#   source common/phase.sh
#
#   get_current_phase "$feature_json"          # Returns current phase number
#   get_total_phases "$feature_json"           # Returns total phase count
#   get_phase_action "$feature_json" "$phase"  # Returns action name for phase
#   get_phase_info "$feature_json"             # Returns "N/M (action)" format
#   set_phase "$feature_json" "$phase"         # Sets current_phase
#   advance_phase "$feature_json"              # Advances to next phase
#   get_phase_for_action "$feature_json" "$action"  # Returns phase number for action
# =============================================================================

# Get current phase number
get_current_phase() {
  local feature_json="$1"
  if [ ! -f "$feature_json" ]; then
    echo "0"
    return
  fi
  jq -r '.current_phase // 0' "$feature_json"
}

# Get total number of phases
get_total_phases() {
  local feature_json="$1"
  if [ ! -f "$feature_json" ]; then
    echo "0"
    return
  fi
  jq -r '.next_action | length // 0' "$feature_json"
}

# Get action name for a specific phase
get_phase_action() {
  local feature_json="$1"
  local phase="$2"
  if [ ! -f "$feature_json" ]; then
    echo "unknown"
    return
  fi
  jq -r --argjson phase "$phase" '.next_action[] | select(.phase == $phase) | .action // "unknown"' "$feature_json"
}

# Get formatted phase info: "N/M (action)"
get_phase_info() {
  local feature_json="$1"
  if [ ! -f "$feature_json" ]; then
    echo "N/A"
    return
  fi

  local current_phase=$(get_current_phase "$feature_json")
  local total_phases=$(get_total_phases "$feature_json")
  local action_name=$(get_phase_action "$feature_json" "$current_phase")

  if [ "$current_phase" = "0" ] || [ "$current_phase" = "null" ]; then
    echo "0/${total_phases} (pending)"
  else
    echo "${current_phase}/${total_phases} (${action_name})"
  fi
}

# Set current phase to a specific value
set_phase() {
  local feature_json="$1"
  local phase="$2"

  if [ ! -f "$feature_json" ]; then
    echo "Error: feature.json not found: $feature_json" >&2
    return 1
  fi

  jq --argjson phase "$phase" '.current_phase = $phase' "$feature_json" > "${feature_json}.tmp"
  mv "${feature_json}.tmp" "$feature_json"
}

# Advance to next phase
advance_phase() {
  local feature_json="$1"

  if [ ! -f "$feature_json" ]; then
    echo "Error: feature.json not found: $feature_json" >&2
    return 1
  fi

  local current=$(get_current_phase "$feature_json")
  local total=$(get_total_phases "$feature_json")
  local next=$((current + 1))

  if [ "$next" -gt "$total" ]; then
    echo "Warning: Already at final phase" >&2
    return 0
  fi

  set_phase "$feature_json" "$next"
}

# Get phase number for a specific action name
get_phase_for_action() {
  local feature_json="$1"
  local action="$2"

  if [ ! -f "$feature_json" ]; then
    echo "0"
    return
  fi

  jq -r --arg action "$action" '.next_action[] | select(.action == $action) | .phase // 0' "$feature_json"
}

# Map subagent type to action name
# Used by hooks to determine which action a subagent corresponds to
map_subagent_to_action() {
  local subagent_type="$1"

  case "$subagent_type" in
    implement) echo "implement" ;;
    check) echo "check" ;;
    debug) echo "debug" ;;
    research) echo "research" ;;
    # finish uses check agent but is a different action
    *) echo "$subagent_type" ;;
  esac
}

# Check if a phase is completed (current_phase > phase)
is_phase_completed() {
  local feature_json="$1"
  local phase="$2"

  local current=$(get_current_phase "$feature_json")
  [ "$current" -gt "$phase" ]
}

# Check if we're at a specific action
is_current_action() {
  local feature_json="$1"
  local action="$2"

  local current=$(get_current_phase "$feature_json")
  local action_phase=$(get_phase_for_action "$feature_json" "$action")

  [ "$current" = "$action_phase" ]
}
