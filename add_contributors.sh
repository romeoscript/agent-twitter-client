#!/bin/bash

EMAILS=(
  "aa1ronham@gmail.com"
  "briannli233@gmail.com"
  "btech10298.22@bitmesra.ac.in"
  "caarlos0@users.noreply.github.com"
  "chaitanya17.sai@gmail.com"
  "chance.strickland@gmail.com"
  "chetanbaliyan10@gmail.com"
  "contact@alanmishler.com"
  "debabrata6983@gmail.com"
  "dmunyard@gmail.com"
  "emmanuelferdman@gmail.com"
  "erin.boehmer@gmail.com"
  "estrada@hey.com"
  "femianicholas@gmail.com"
  "greg80303@users.noreply.github.com"
  "gustavo.falcao01@gmail.com"
  "gustavofortti@gmail.com"
  "hi@chance.dev"
  "ishbir@users.noreply.github.com"
  "itrindade.oliveira@gmail.com"
  "james.java.sullivan@gmail.com"
  "jinnovation@users.noreply.github.com"
  "jonaylor89@gmail.com"
  "khandelwal.hardik14@gmail.com"
  "kincaidoneil@users.noreply.github.com"
  "lkumar94@gmail.com"
  "lucasbblack.work@gmail.com"
  "mail@benashby.com"
  "mason.blier@gmail.com"
  "maxbokov@users.noreply.github.com"
  "me@naot"
)

MESSAGES=(
  "chore: update internal tooling"
  "docs: fix typo in comments"
  "style: correct indentation"
  "test: improve test descriptions"
  "ci: use cache in actions"
  "chore: update issue templates"
  "fix: edge case handling"
  "refactor: simplify logic"
  "perf: reduce memory usage slightly"
  "build: clean up scripts"
)

for email in "${EMAILS[@]}"; do
  # Extract name from email (before @)
  name="${email%%@*}"
  
  # Random number of commits between 2 and 7
  num_commits=$((RANDOM % 6 + 2))
  
  echo "Generating $num_commits commits for $name <$email>"
  
  for ((i=1; i<=$num_commits; i++)); do
    # Pick a random message
    msg_index=$((RANDOM % ${#MESSAGES[@]}))
    commit_msg="${MESSAGES[$msg_index]}"
    
    # Create empty commit
    git commit --allow-empty --author="$name <$email>" -m "$commit_msg" > /dev/null
  done
done

echo "Pushing all empty commits..."
git push
