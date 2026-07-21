# Validate spec-test correspondence (requires ah)
validate:
  ah check

default:
  @just --list

hash-prompts:
  npm run hash-prompts

test:
  npm run test

check:
  npm run check
