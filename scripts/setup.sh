#!/usr/bin/env bash
# =============================================================================
# JudgeKit Interactive Setup Wizard
#
# Orchestrates initial setup: admin credentials, language selection, dependency
# installation, database provisioning, seeding, and Docker image builds.
#
# Usage:
#   bash scripts/setup.sh              # Interactive mode
#   bash scripts/setup.sh --defaults   # Non-interactive with all defaults
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# Colors & helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

prompt() {
  local var_name="$1" prompt_text="$2" default="$3"
  local input
  echo -en "${CYAN}${prompt_text}${NC} ${DIM}[${default}]${NC}: "
  read -r input
  printf -v "$var_name" '%s' "${input:-$default}"
}

prompt_secret() {
  local var_name="$1" prompt_text="$2" default="$3"
  local input
  echo -en "${CYAN}${prompt_text}${NC} ${DIM}[${default}]${NC}: "
  read -rs input
  echo
  printf -v "$var_name" '%s' "${input:-$default}"
}

# ---------------------------------------------------------------------------
# Language presets
# ---------------------------------------------------------------------------
CORE_LANGS="cpp python jvm"
POPULAR_LANGS="$CORE_LANGS node rust go"
EXTENDED_LANGS="$POPULAR_LANGS ruby lua bash csharp php perl swift r haskell dart zig"
ALL_LANGS="cpp clang python node jvm rust go swift csharp r perl php ruby lua
  haskell dart zig nim ocaml elixir julia d racket v fortran pascal cobol
  brainfuck scala erlang commonlisp bash esoteric ada clojure prolog tcl awk
  scheme groovy octave crystal powershell postscript fsharp apl freebasic
  smalltalk b nasm bqn lolcode forth algol68 umjunsik haxe raku shakespeare
  snobol4 icon uiua odin objective-c deno bun gleam sml micropython squirrel
  rexx hy arturo janet c3 vala nelua hare koka lean picat mercury wat
  purescript modula2 factor minizinc curry clean roc carp grain pony
  chapel elm flix idris2 moonbit rescript"
# Normalize whitespace
ALL_LANGS=$(echo $ALL_LANGS | tr -s ' ')

preset_description() {
  case "$1" in
    core)     echo "C/C++, Python, Java/Kotlin (~1.2 GB)" ;;
    popular)  echo "Core + Node.js, Rust, Go (~4 GB)" ;;
    extended) echo "Popular + Ruby, Lua, Bash, C#, PHP, Perl, Swift, R, Haskell, Dart, Zig (~12 GB)" ;;
    all)      echo "All supported language images (~30 GB)" ;;
    none)     echo "No Docker images (web app only)" ;;
  esac
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
NON_INTERACTIVE=false
for arg in "$@"; do
  case "$arg" in
    --defaults) NON_INTERACTIVE=true ;;
    --help|-h)
      echo "Usage: $0 [--defaults]"
      echo ""
      echo "Options:"
      echo "  --defaults   Run with all defaults (admin/admin123, no Docker images)"
      exit 0
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         JudgeKit Setup Wizard            ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Admin credentials
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 1: Admin Credentials${NC}"
echo -e "${DIM}Configure the super admin account for first login.${NC}"
echo ""

if [[ "$NON_INTERACTIVE" == true ]]; then
  ADMIN_USERNAME="admin"
  ADMIN_PASSWORD="admin123"
  info "Using defaults: admin / admin123"
else
  prompt ADMIN_USERNAME "Admin username" "admin"
  prompt_secret ADMIN_PASSWORD "Admin password" "admin123"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 2: Language selection
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 2: Language Selection${NC}"
echo -e "${DIM}Choose which judge language Docker images to build.${NC}"
echo -e "${DIM}You can always build more later with: docker build -t judge-<lang> -f docker/Dockerfile.judge-<lang> .${NC}"
echo ""

if [[ "$NON_INTERACTIVE" == true ]]; then
  PRESET="none"
  SELECTED_LANGS=""
  info "Using default: none (no Docker images)"
else
  echo -e "  ${BOLD}1)${NC} core     — $(preset_description core)"
  echo -e "  ${BOLD}2)${NC} popular  — $(preset_description popular)"
  echo -e "  ${BOLD}3)${NC} extended — $(preset_description extended)"
  echo -e "  ${BOLD}4)${NC} all      — $(preset_description all)"
  echo -e "  ${BOLD}5)${NC} none     — $(preset_description none)"
  echo ""
  prompt PRESET_CHOICE "Select a preset (1-5)" "1"

  case "$PRESET_CHOICE" in
    1|core)     PRESET="core";     SELECTED_LANGS="$CORE_LANGS" ;;
    2|popular)  PRESET="popular";  SELECTED_LANGS="$POPULAR_LANGS" ;;
    3|extended) PRESET="extended"; SELECTED_LANGS="$EXTENDED_LANGS" ;;
    4|all)      PRESET="all";      SELECTED_LANGS="$ALL_LANGS" ;;
    5|none)     PRESET="none";     SELECTED_LANGS="" ;;
    *)          PRESET="core";     SELECTED_LANGS="$CORE_LANGS"; warn "Invalid choice, defaulting to core" ;;
  esac

  if [[ -n "$SELECTED_LANGS" ]]; then
    echo ""
    echo -e "${BOLD}Selected languages (${PRESET}):${NC}"
    echo -e "  ${GREEN}${SELECTED_LANGS}${NC}"
    echo ""
    echo -e "${DIM}You can add or remove individual languages.${NC}"
    echo -e "${DIM}  Add:    type language names separated by spaces (e.g. 'nim ocaml')${NC}"
    echo -e "${DIM}  Remove: prefix with '-' (e.g. '-rust -go')${NC}"
    echo -e "${DIM}  Press Enter to keep current selection.${NC}"
    echo ""
    prompt LANG_MODIFY "Add/remove languages" ""

    if [[ -n "$LANG_MODIFY" ]]; then
      for token in $LANG_MODIFY; do
        if [[ "$token" == -* ]]; then
          # Remove language
          lang="${token#-}"
          SELECTED_LANGS=$(echo "$SELECTED_LANGS" | sed "s/\b${lang}\b//g" | tr -s ' ' | sed 's/^ //;s/ $//')
        else
          # Add language — verify Dockerfile exists
          if [[ -f "docker/Dockerfile.judge-${token}" ]]; then
            if ! echo "$SELECTED_LANGS" | grep -qw "$token"; then
              SELECTED_LANGS="$SELECTED_LANGS $token"
            fi
          else
            warn "No Dockerfile found for '${token}', skipping"
          fi
        fi
      done
    fi
  fi
fi

# Normalize
SELECTED_LANGS=$(echo $SELECTED_LANGS | tr -s ' ' | sed 's/^ //;s/ $//')

if [[ -n "$SELECTED_LANGS" ]]; then
  LANG_COUNT=$(echo "$SELECTED_LANGS" | wc -w | tr -d ' ')
  echo -e "${BOLD}Final language selection (${LANG_COUNT} images):${NC}"
  echo -e "  ${GREEN}${SELECTED_LANGS}${NC}"
else
  echo -e "${BOLD}No Docker images will be built.${NC}"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 3: Install dependencies
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 3: Installing Dependencies${NC}"
info "Running npm install..."
npm install
success "Dependencies installed"
echo ""

# ---------------------------------------------------------------------------
# Step 4: Set up environment
# ---------------------------------------------------------------------------
if [[ ! -f ".env" ]]; then
  echo -e "${BOLD}Step 4: Environment Configuration${NC}"
  if [[ -f ".env.example" ]]; then
    cp .env.example .env
    AUTH_SECRET=$(openssl rand -base64 32)
    # Portable sed: try GNU sed first, fall back to macOS sed
    if sed --version >/dev/null 2>&1; then
      sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=${AUTH_SECRET}|" .env
    else
      sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=${AUTH_SECRET}|" .env
    fi
    success "Created .env with fresh AUTH_SECRET"
  else
    warn ".env.example not found, skipping .env creation"
  fi
else
  info "Using existing .env"
fi
echo ""

# ---------------------------------------------------------------------------
# Step 5: Database setup
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 5: Database Setup${NC}"
info "Pushing database schema..."
npm run db:push
success "Database schema ready"
echo ""

# ---------------------------------------------------------------------------
# Step 6: Seed data
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 6: Seeding Data${NC}"
info "Seeding admin user and sample data..."
ADMIN_USERNAME="$ADMIN_USERNAME" ADMIN_PASSWORD="$ADMIN_PASSWORD" npm run seed
success "Database seeded"
echo ""

# ---------------------------------------------------------------------------
# Step 7: Sync language configs
# ---------------------------------------------------------------------------
echo -e "${BOLD}Step 7: Syncing Language Configs${NC}"
info "Syncing language configurations to database..."
npm run languages:sync
success "Language configs synced"
echo ""

# ---------------------------------------------------------------------------
# Step 8: Build Docker images
# ---------------------------------------------------------------------------
if [[ -n "$SELECTED_LANGS" ]]; then
  echo -e "${BOLD}Step 8: Building Docker Images${NC}"
  BUILT=0
  FAILED=0
  FAILED_LANGS=""

  for lang in $SELECTED_LANGS; do
    dockerfile="docker/Dockerfile.judge-${lang}"
    if [[ ! -f "$dockerfile" ]]; then
      warn "Dockerfile not found: ${dockerfile}, skipping"
      FAILED=$((FAILED + 1))
      FAILED_LANGS="$FAILED_LANGS $lang"
      continue
    fi

    info "Building judge-${lang}..."
    if docker build -t "judge-${lang}" -f "$dockerfile" . ; then
      success "Built judge-${lang}"
      BUILT=$((BUILT + 1))
    else
      error "Failed to build judge-${lang}"
      FAILED=$((FAILED + 1))
      FAILED_LANGS="$FAILED_LANGS $lang"
    fi
  done

  echo ""
  success "Built ${BUILT} Docker images"
  if [[ $FAILED -gt 0 ]]; then
    warn "Failed to build ${FAILED} images:${FAILED_LANGS}"
  fi
else
  info "Skipping Docker image builds (none selected)"
fi
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║           Setup Complete!                ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Admin login:${NC}"
echo -e "    Username: ${GREEN}${ADMIN_USERNAME}${NC}"
echo -e "    Password: ${GREEN}${ADMIN_PASSWORD}${NC}"
echo -e "    ${DIM}(You will be asked to change the password on first login)${NC}"
echo ""
if [[ -n "$SELECTED_LANGS" ]]; then
  echo -e "  ${BOLD}Docker images:${NC} ${LANG_COUNT} built"
else
  echo -e "  ${BOLD}Docker images:${NC} none (build later with docker build -t judge-<lang> -f docker/Dockerfile.judge-<lang> .)"
fi
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "    ${CYAN}npm run dev${NC}          Start the dev server"
echo -e "    Open ${CYAN}http://localhost:3000${NC}"
echo ""
