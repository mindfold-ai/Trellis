#!/bin/bash
# =============================================================================
# Multi-Agent Pipeline: Start Worktree Agent
# =============================================================================
# Usage: ./start.sh <feature-dir>
# Example: ./start.sh .trellis/agent-traces/taosu/features/16-my-feature
#
# This script:
# 1. Creates worktree (if not exists) with dependency install
# 2. Copies environment files (from worktree.yaml config)
# 3. Sets .current-feature in worktree
# 4. Starts claude agent in background
# 5. Registers agent to registry.json
#
# Prerequisites:
#   - feature.json must exist with 'branch' field
#   - .claude/agents/dispatch.md must exist
#
# Configuration: .trellis/worktree.yaml
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
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Constants
# =============================================================================
PROJECT_ROOT=$(get_repo_root)
DISPATCH_MD_PATH=".claude/agents/dispatch.md"

# =============================================================================
# Parse Arguments
# =============================================================================
FEATURE_DIR=$1
if [ -z "$FEATURE_DIR" ]; then
  log_error "Feature directory required"
  echo "Usage: $0 <feature-dir>"
  echo "Example: $0 .trellis/agent-traces/taosu/features/16-my-feature"
  exit 1
fi

# Normalize paths
if [[ "$FEATURE_DIR" = /* ]]; then
  FEATURE_DIR_RELATIVE="${FEATURE_DIR#$PROJECT_ROOT/}"
  FEATURE_DIR_ABS="$FEATURE_DIR"
else
  FEATURE_DIR_RELATIVE="$FEATURE_DIR"
  FEATURE_DIR_ABS="${PROJECT_ROOT}/${FEATURE_DIR}"
fi

FEATURE_JSON="${FEATURE_DIR_ABS}/feature.json"

# =============================================================================
# Validation
# =============================================================================
if [ ! -f "$FEATURE_JSON" ]; then
  log_error "feature.json not found at ${FEATURE_JSON}"
  exit 1
fi

DISPATCH_MD="${PROJECT_ROOT}/${DISPATCH_MD_PATH}"
if [ ! -f "$DISPATCH_MD" ]; then
  log_error "dispatch.md not found at ${DISPATCH_MD}"
  exit 1
fi

CONFIG_FILE=$(get_worktree_config "$PROJECT_ROOT")
if [ ! -f "$CONFIG_FILE" ]; then
  log_error "worktree.yaml not found at ${CONFIG_FILE}"
  exit 1
fi

# =============================================================================
# Read Feature Config
# =============================================================================
echo ""
echo -e "${BLUE}=== Multi-Agent Pipeline: Start ===${NC}"
log_info "Feature: ${FEATURE_DIR_ABS}"

BRANCH=$(jq -r '.branch' "$FEATURE_JSON")
FEATURE_NAME=$(jq -r '.name' "$FEATURE_JSON")
WORKTREE_PATH=$(jq -r '.worktree_path // empty' "$FEATURE_JSON")

if [ -z "$BRANCH" ] || [ "$BRANCH" = "null" ]; then
  log_error "branch field not set in feature.json"
  log_info "Please set branch field first, e.g.:"
  log_info "  jq '.branch = \"feature/my-feature\"' feature.json > tmp && mv tmp feature.json"
  exit 1
fi

log_info "Branch: ${BRANCH}"
log_info "Name: ${FEATURE_NAME}"

# =============================================================================
# Step 1: Create Worktree (if not exists)
# =============================================================================
if [ -z "$WORKTREE_PATH" ] || [ ! -d "$WORKTREE_PATH" ]; then
  log_info "Step 1: Creating worktree..."

  # Record current branch as base_branch (PR target)
  BASE_BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current)
  log_info "Base branch (PR target): ${BASE_BRANCH}"

  # Calculate worktree path
  WORKTREE_BASE=$(get_worktree_base_dir "$PROJECT_ROOT")
  mkdir -p "$WORKTREE_BASE"
  WORKTREE_BASE="$(cd "$WORKTREE_BASE" && pwd)"
  WORKTREE_PATH="${WORKTREE_BASE}/${BRANCH}"

  # Create parent directory
  mkdir -p "$(dirname "$WORKTREE_PATH")"
  cd "$PROJECT_ROOT"

  # Create branch if not exists
  if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    log_info "Branch exists, checking out..."
    git worktree add "$WORKTREE_PATH" "$BRANCH"
  else
    log_info "Creating new branch: $BRANCH"
    git worktree add -b "$BRANCH" "$WORKTREE_PATH"
  fi

  log_success "Worktree created: ${WORKTREE_PATH}"

  # Update feature.json with worktree_path and base_branch
  jq --arg path "$WORKTREE_PATH" --arg base "$BASE_BRANCH" \
    '.worktree_path = $path | .base_branch = $base' "$FEATURE_JSON" > "${FEATURE_JSON}.tmp"
  mv "${FEATURE_JSON}.tmp" "$FEATURE_JSON"

  # ----- Copy environment files -----
  log_info "Copying environment files..."
  cd "$WORKTREE_PATH"

  COPY_LIST=$(get_worktree_copy_files "$PROJECT_ROOT")
  COPY_COUNT=0

  while IFS= read -r item; do
    [ -z "$item" ] && continue

    SOURCE="${PROJECT_ROOT}/${item}"
    TARGET="${WORKTREE_PATH}/${item}"

    if [ -f "$SOURCE" ]; then
      mkdir -p "$(dirname "$TARGET")"
      cp "$SOURCE" "$TARGET"
      ((COPY_COUNT++))
    fi
  done <<< "$COPY_LIST"

  if [ $COPY_COUNT -gt 0 ]; then
    log_success "Copied $COPY_COUNT file(s)"
  fi

  # ----- Copy feature directory (may not be committed yet) -----
  log_info "Copying feature directory..."
  FEATURE_TARGET_DIR="${WORKTREE_PATH}/${FEATURE_DIR_RELATIVE}"
  mkdir -p "$(dirname "$FEATURE_TARGET_DIR")"
  cp -r "$FEATURE_DIR_ABS" "$(dirname "$FEATURE_TARGET_DIR")/"
  log_success "Feature directory copied to worktree"

  # ----- Run post_create hooks -----
  log_info "Running post_create hooks..."

  POST_CREATE=$(get_worktree_post_create_hooks "$PROJECT_ROOT")
  HOOK_COUNT=0

  while IFS= read -r cmd; do
    [ -z "$cmd" ] && continue

    log_info "  Running: $cmd"
    if eval "$cmd"; then
      ((HOOK_COUNT++))
    else
      log_error "Hook failed: $cmd"
      exit 1
    fi
  done <<< "$POST_CREATE"

  if [ $HOOK_COUNT -gt 0 ]; then
    log_success "Ran $HOOK_COUNT hook(s)"
  fi

else
  log_info "Step 1: Using existing worktree: ${WORKTREE_PATH}"
fi

# =============================================================================
# Step 2: Set .current-feature in Worktree
# =============================================================================
log_info "Step 2: Setting current feature in worktree..."

mkdir -p "${WORKTREE_PATH}/$DIR_WORKFLOW"
echo "$FEATURE_DIR_RELATIVE" > "${WORKTREE_PATH}/$DIR_WORKFLOW/$FILE_CURRENT_FEATURE"
log_success "Current feature set: ${FEATURE_DIR_RELATIVE}"

# =============================================================================
# Step 3: Prepare and Start Claude Agent
# =============================================================================
log_info "Step 3: Starting Claude agent..."

# Extract dispatch.md content (skip frontmatter)
DISPATCH_PROMPT=$(awk '
  BEGIN { in_frontmatter = 0; started = 0 }
  /^---$/ {
    if (!started) { in_frontmatter = 1; started = 1; next }
    else if (in_frontmatter) { in_frontmatter = 0; next }
  }
  !in_frontmatter { print }
' "$DISPATCH_MD")

# Update feature status
jq '.status = "in_progress"' "$FEATURE_JSON" > "${FEATURE_JSON}.tmp"
mv "${FEATURE_JSON}.tmp" "$FEATURE_JSON"

cd "$WORKTREE_PATH"

LOG_FILE="${WORKTREE_PATH}/.agent-log"
PROMPT_FILE="${WORKTREE_PATH}/.agent-prompt"
RUNNER_SCRIPT="${WORKTREE_PATH}/.agent-runner.sh"

touch "$LOG_FILE"
echo "$DISPATCH_PROMPT" > "$PROMPT_FILE"

# Create runner script
cat > "$RUNNER_SCRIPT" << 'RUNNER_EOF'
#!/bin/bash
cd "$(dirname "$0")"
export https_proxy="${AGENT_HTTPS_PROXY:-}"
export http_proxy="${AGENT_HTTP_PROXY:-}"
export all_proxy="${AGENT_ALL_PROXY:-}"

claude -p --dangerously-skip-permissions --output-format stream-json --verbose < .agent-prompt
RUNNER_EOF
chmod +x "$RUNNER_SCRIPT"

# Start agent in background
AGENT_HTTPS_PROXY="${https_proxy:-}" \
AGENT_HTTP_PROXY="${http_proxy:-}" \
AGENT_ALL_PROXY="${all_proxy:-}" \
nohup "$RUNNER_SCRIPT" > "$LOG_FILE" 2>&1 &
AGENT_PID=$!

log_success "Agent started with PID: ${AGENT_PID}"

# =============================================================================
# Step 4: Register to Registry
# =============================================================================
log_info "Step 4: Registering agent to registry..."

DEVELOPER=$(get_developer)
AGENTS_DIR=$(get_agents_dir)
mkdir -p "$AGENTS_DIR"

REGISTRY_FILE="${AGENTS_DIR}/registry.json"

# Generate agent ID
FEATURE_ID=$(jq -r '.id // empty' "$FEATURE_JSON")
if [ -z "$FEATURE_ID" ]; then
  FEATURE_ID=$(echo "$BRANCH" | sed 's/\//-/g')
fi

# Read or create registry
if [ -f "$REGISTRY_FILE" ]; then
  REGISTRY=$(cat "$REGISTRY_FILE")
else
  REGISTRY='{"agents":[]}'
fi

# Remove old record with same ID
REGISTRY=$(echo "$REGISTRY" | jq --arg id "$FEATURE_ID" '.agents = [.agents[] | select(.id != $id)]')

# Add new agent record
STARTED_AT=$(date -Iseconds)
NEW_AGENT=$(jq -n \
  --arg id "$FEATURE_ID" \
  --arg worktree "$WORKTREE_PATH" \
  --arg pid "$AGENT_PID" \
  --arg started_at "$STARTED_AT" \
  --arg feature_dir "$FEATURE_DIR_RELATIVE" \
  '{
    id: $id,
    worktree_path: $worktree,
    pid: ($pid | tonumber),
    started_at: $started_at,
    feature_dir: $feature_dir
  }')

REGISTRY=$(echo "$REGISTRY" | jq --argjson agent "$NEW_AGENT" '.agents += [$agent]')
echo "$REGISTRY" | jq '.' > "$REGISTRY_FILE"

log_success "Agent registered: ${FEATURE_ID}"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${GREEN}=== Agent Started ===${NC}"
echo ""
echo "  ID:        $FEATURE_ID"
echo "  PID:       $AGENT_PID"
echo "  Worktree:  $WORKTREE_PATH"
echo "  Feature:   $FEATURE_DIR_RELATIVE"
echo "  Log:       $LOG_FILE"
echo "  Registry:  $REGISTRY_FILE"
echo ""
echo -e "${YELLOW}To monitor:${NC} tail -f $LOG_FILE"
echo -e "${YELLOW}To stop:${NC}    kill $AGENT_PID"
