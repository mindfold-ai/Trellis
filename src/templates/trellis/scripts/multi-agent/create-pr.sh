#!/bin/bash
# =============================================================================
# Multi-Agent Pipeline: Create PR
# =============================================================================
# Usage:
#   ./create-pr.sh [feature-dir] [--dry-run]
#
# This script:
# 1. Stages and commits all changes (excluding agent-traces)
# 2. Pushes to origin
# 3. Creates a Draft PR using `gh pr create`
# 4. Updates feature.json with status="review", pr_url, and current_phase
#
# Note: This is the only action that performs git commit, as it's the final
# step after all implementation and checks are complete.
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../common/paths.sh"
source "$SCRIPT_DIR/../common/phase.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_ROOT=$(get_repo_root)

# =============================================================================
# Parse Arguments
# =============================================================================
TARGET_DIR=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [feature-dir] [--dry-run]"
      echo ""
      echo "Options:"
      echo "  --dry-run    Show what would be done without making changes"
      echo "  -h, --help   Show this help message"
      exit 0
      ;;
    *)
      if [[ -z "$TARGET_DIR" ]]; then
        TARGET_DIR="$1"
      fi
      shift
      ;;
  esac
done

# =============================================================================
# Get Feature Directory
# =============================================================================
if [[ -z "$TARGET_DIR" ]]; then
  # Try to get from .current-feature
  CURRENT_FEATURE_FILE="$REPO_ROOT/.trellis/.current-feature"
  if [[ -f "$CURRENT_FEATURE_FILE" ]]; then
    TARGET_DIR=$(cat "$CURRENT_FEATURE_FILE")
  fi

  if [[ -z "$TARGET_DIR" ]]; then
    echo -e "${RED}Error: No feature directory specified and no current feature set${NC}"
    echo "Usage: $0 [feature-dir] [--dry-run]"
    exit 1
  fi
fi

# Support relative paths
if [[ ! "$TARGET_DIR" = /* ]]; then
  TARGET_DIR="$REPO_ROOT/$TARGET_DIR"
fi

FEATURE_JSON="$TARGET_DIR/feature.json"
if [[ ! -f "$FEATURE_JSON" ]]; then
  echo -e "${RED}Error: feature.json not found at $TARGET_DIR${NC}"
  exit 1
fi

# =============================================================================
# Main
# =============================================================================
echo -e "${BLUE}=== Create PR ===${NC}"
if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "${YELLOW}[DRY-RUN MODE] No actual changes will be made${NC}"
fi
echo ""

# Read feature config
FEATURE_NAME=$(jq -r '.name' "$FEATURE_JSON")
BASE_BRANCH=$(jq -r '.base_branch // "main"' "$FEATURE_JSON")
SCOPE=$(jq -r '.scope // "core"' "$FEATURE_JSON")
DEV_TYPE=$(jq -r '.dev_type // "feature"' "$FEATURE_JSON")

# Map dev_type to commit prefix
case "$DEV_TYPE" in
  feature|frontend|backend|fullstack) COMMIT_PREFIX="feat" ;;
  bugfix|fix) COMMIT_PREFIX="fix" ;;
  refactor) COMMIT_PREFIX="refactor" ;;
  docs) COMMIT_PREFIX="docs" ;;
  test) COMMIT_PREFIX="test" ;;
  *) COMMIT_PREFIX="feat" ;;
esac

echo -e "Feature: ${FEATURE_NAME}"
echo -e "Base branch: ${BASE_BRANCH}"
echo -e "Scope: ${SCOPE}"
echo -e "Commit prefix: ${COMMIT_PREFIX}"
echo ""

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "Current branch: ${CURRENT_BRANCH}"

# Check for changes
echo -e "${YELLOW}Checking for changes...${NC}"

# Stage changes (even in dry-run to detect what would be committed)
git add -A

# Exclude agent traces and temp files
git reset ".trellis/agent-traces/" 2>/dev/null || true
git reset .agent-log .agent-prompt .agent-runner.sh 2>/dev/null || true

# Check if there are staged changes
if git diff --cached --quiet 2>/dev/null; then
  echo -e "${YELLOW}No staged changes to commit${NC}"

  # Check for unpushed commits
  UNPUSHED=$(git log "origin/${CURRENT_BRANCH}..HEAD" --oneline 2>/dev/null | wc -l | tr -d ' ' || echo "0")
  if [[ "$UNPUSHED" -eq 0 ]] 2>/dev/null; then
    # In dry-run, also reset the staging
    if [[ "$DRY_RUN" == "true" ]]; then
      git reset HEAD >/dev/null 2>&1 || true
    fi
    echo -e "${RED}No changes to create PR${NC}"
    exit 1
  fi
  echo -e "Found ${UNPUSHED} unpushed commit(s)"
else
  # Commit changes
  echo -e "${YELLOW}Committing changes...${NC}"
  COMMIT_MSG="${COMMIT_PREFIX}(${SCOPE}): ${FEATURE_NAME}"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "[DRY-RUN] Would commit with message: ${COMMIT_MSG}"
    echo -e "[DRY-RUN] Staged files:"
    git diff --cached --name-only | sed 's/^/  - /'
  else
    git commit -m "$COMMIT_MSG"
    echo -e "${GREEN}Committed: ${COMMIT_MSG}${NC}"
  fi
fi

# Push to remote
echo -e "${YELLOW}Pushing to remote...${NC}"
if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "[DRY-RUN] Would push to: origin/${CURRENT_BRANCH}"
else
  git push -u origin "$CURRENT_BRANCH"
  echo -e "${GREEN}Pushed to origin/${CURRENT_BRANCH}${NC}"
fi

# Create PR
echo -e "${YELLOW}Creating PR...${NC}"
PR_TITLE="${COMMIT_PREFIX}(${SCOPE}): ${FEATURE_NAME}"
PR_URL=""

if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "[DRY-RUN] Would create PR:"
  echo -e "  Title: ${PR_TITLE}"
  echo -e "  Base:  ${BASE_BRANCH}"
  echo -e "  Head:  ${CURRENT_BRANCH}"
  if [[ -f "$TARGET_DIR/prd.md" ]]; then
    echo -e "  Body:  (from prd.md)"
  fi
  PR_URL="https://github.com/example/repo/pull/DRY-RUN"
else
  # Check if PR already exists
  EXISTING_PR=$(gh pr list --head "$CURRENT_BRANCH" --base "$BASE_BRANCH" --json url --jq '.[0].url' 2>/dev/null || echo "")

  if [[ -n "$EXISTING_PR" ]]; then
    echo -e "${YELLOW}PR already exists: ${EXISTING_PR}${NC}"
    PR_URL="$EXISTING_PR"
  else
    # Read PRD as PR body
    PR_BODY=""
    if [[ -f "$TARGET_DIR/prd.md" ]]; then
      PR_BODY=$(cat "$TARGET_DIR/prd.md")
    fi

    # Create PR
    PR_URL=$(gh pr create \
      --draft \
      --base "$BASE_BRANCH" \
      --title "$PR_TITLE" \
      --body "$PR_BODY" \
      2>&1)

    echo -e "${GREEN}PR created: ${PR_URL}${NC}"
  fi
fi

# Update feature.json
echo -e "${YELLOW}Updating feature status...${NC}"
if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "[DRY-RUN] Would update feature.json:"
  echo -e "  status: review"
  echo -e "  pr_url: ${PR_URL}"
  echo -e "  current_phase: (set to create-pr phase)"
else
  # Get the phase number for create-pr action using common/phase.sh
  CREATE_PR_PHASE=$(get_phase_for_action "$FEATURE_JSON" "create-pr")
  if [[ -z "$CREATE_PR_PHASE" ]] || [[ "$CREATE_PR_PHASE" == "0" ]]; then
    CREATE_PR_PHASE=4  # Default fallback
  fi

  jq --arg url "$PR_URL" --argjson phase "$CREATE_PR_PHASE" \
    '.status = "review" | .pr_url = $url | .current_phase = $phase' "$FEATURE_JSON" > "${FEATURE_JSON}.tmp"
  mv "${FEATURE_JSON}.tmp" "$FEATURE_JSON"
  echo -e "${GREEN}Feature status updated to 'review', phase ${CREATE_PR_PHASE}${NC}"
fi

# In dry-run, reset the staging area
if [[ "$DRY_RUN" == "true" ]]; then
  git reset HEAD >/dev/null 2>&1 || true
fi

echo ""
echo -e "${GREEN}=== PR Created Successfully ===${NC}"
echo -e "PR URL: ${PR_URL}"
