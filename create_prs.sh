#!/bin/bash

# Ensure GitHub CLI is installed and authenticated
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI (gh) is not installed. Please install it first."
    exit 1
fi

EMAILS=(
  "osbornromeo@gmail.com"
)

MESSAGES=(
  "refactor: simplify generic types"
  "docs: update API usage examples"
  "chore: bump internal dependency versions"
  "style: standard formatting cleanup"
  "fix: handle undefined edge cases"
)

PR_TITLES=(
  "Refactor generic type signatures"
  "Update API documentation examples"
  "Bump internal tool versions"
  "Format codebase to standard"
  "Fix undefined edge case handling"
)

BRANCH_PREFIX="contrib-update"

for i in "${!EMAILS[@]}"; do
  email="${EMAILS[$i]}"
  name="${email%%@*}"
  
  # Create a unique branch name
  branch_name="${BRANCH_PREFIX}-${name//./-}-$(date +%s)"
  
  echo "Processing PR for $name <$email>..."
  
  # Checkout main and pull latest
  git checkout main
  git pull origin main
  
  # Create and checkout new branch
  git checkout -b "$branch_name"
  
  # Random number of commits between 1 and 3
  num_commits=$((RANDOM % 3 + 1))
  
  for ((c=1; c<=$num_commits; c++)); do
    msg_index=$((RANDOM % ${#MESSAGES[@]}))
    commit_msg="${MESSAGES[$msg_index]}"
    git commit --allow-empty --author="$name <$email>" -m "$commit_msg" > /dev/null
  done
  
  # Push the branch
  git push origin "$branch_name"
  
  # Pick a random title for the PR
  title_index=$((RANDOM % ${#PR_TITLES[@]}))
  pr_title="${PR_TITLES[$title_index]}"
  
  # Create the PR using gh CLI
  gh pr create --title "chore: ${pr_title} (${name})" --body "Automated contribution via empty commits for ${name}." --base main --head "$branch_name"
  
  echo "Successfully created PR for $name!"
done

# Switch back to main
git checkout main
echo "Finished!"
