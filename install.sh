#!/usr/bin/env bash
#
# brunnr installer — sets up brunnr for use on this machine.
#
# Bootstrap (current — private repo):
#   gh repo clone momoshell/brunnr ~/.config/brunnr && bash ~/.config/brunnr/install.sh
#
# Bootstrap (future — once the repo is public):
#   curl -fsSL https://raw.githubusercontent.com/momoshell/brunnr/main/install.sh | bash
#
# Idempotent — safe to re-run.

set -euo pipefail

BRUNNR_REPO="${BRUNNR_REPO:-momoshell/brunnr}"
BRUNNR_HOME="${BRUNNR_HOME:-$HOME/.config/brunnr}"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

OS=""
PKG=""
case "$(uname -s)" in
  Darwin) OS=mac ; have brew      && PKG=brew ;;
  Linux)  OS=linux
          if   have apt-get; then PKG=apt
          elif have dnf;     then PKG=dnf
          elif have pacman;  then PKG=pacman
          fi ;;
  *) die "Unsupported OS: $(uname -s)" ;;
esac

install_hint() {
  case "$OS:$PKG:$1" in
    mac:brew:just)   echo "brew install just" ;;
    mac:brew:gh)     echo "brew install gh" ;;
    mac:brew:git)    echo "xcode-select --install   # ships git" ;;
    mac::*)          echo "install Homebrew first: https://brew.sh, then 'brew install $1'" ;;
    linux:apt:just)  echo "see https://just.systems  (no apt package on older distros)" ;;
    linux:apt:gh)    echo "sudo apt install gh" ;;
    linux:apt:git)   echo "sudo apt install git" ;;
    linux:dnf:*)     echo "sudo dnf install $1" ;;
    linux:pacman:*)  echo "sudo pacman -S $1" ;;
    *)               echo "see the tool's website for install instructions" ;;
  esac
}

require_tool() {
  local tool="$1"
  if have "$tool"; then return; fi
  warn "$tool is not installed."
  printf '   Install with:  %s\n' "$(install_hint "$tool")"
  if [ "$OS" = mac ] && [ "$PKG" = brew ] && [ -t 0 ]; then
    read -r -p "   Run 'brew install $tool' now? [y/N] " ans
    if [[ "$ans" =~ ^[Yy]$ ]]; then
      brew install "$tool"
      return
    fi
  fi
  die "$tool is required. Install it and re-run this script."
}

say "Checking prerequisites"
require_tool git
require_tool just
require_tool gh

say "Checking GitHub auth"
if ! gh auth status >/dev/null 2>&1; then
  warn "Not logged in to GitHub (required while $BRUNNR_REPO is private)."
  echo "   Run:  gh auth login"
  die "Run 'gh auth login' first, then re-run this installer."
fi

if [ -d "$BRUNNR_HOME/.git" ]; then
  say "brunnr already cloned at $BRUNNR_HOME — skipping clone"
elif [ -e "$BRUNNR_HOME" ]; then
  die "$BRUNNR_HOME exists but is not a git repo. Move or remove it, then re-run."
else
  say "Cloning $BRUNNR_REPO into $BRUNNR_HOME"
  mkdir -p "$(dirname "$BRUNNR_HOME")"
  gh repo clone "$BRUNNR_REPO" "$BRUNNR_HOME"
fi

ALIAS_LINE="alias brunnr='just -f $BRUNNR_HOME/justfile'"

case "$(basename "${SHELL:-bash}")" in
  zsh)  RC="$HOME/.zshrc" ;;
  bash) RC="$HOME/.bashrc" ;;
  fish) RC="$HOME/.config/fish/config.fish"
        ALIAS_LINE="alias brunnr \"just -f $BRUNNR_HOME/justfile\"" ;;
  *)    RC="" ;;
esac

if [ -z "$RC" ]; then
  warn "Unrecognized shell ($SHELL). Add this line to your shell rc manually:"
  echo "   $ALIAS_LINE"
elif grep -Fq "$ALIAS_LINE" "$RC" 2>/dev/null; then
  say "Shell alias already present in $RC"
else
  say "Adding shell alias to $RC"
  printf '\n# brunnr\n%s\n' "$ALIAS_LINE" >> "$RC"
fi

if ! have pi; then
  warn "Pi is not installed. brunnr installs catalog items into directories Pi reads."
  echo "   Install Pi: https://github.com/badlogic/pi-mono"
fi

say "Done."
echo "   Open a new shell (or run 'source $RC'), then try:  brunnr help"
