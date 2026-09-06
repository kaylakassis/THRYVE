#!/bin/sh
# Xcode Cloud: runs once, right after the repository is cloned and before
# any xcodebuild step. Lives in ios/App/ci_scripts because Xcode Cloud
# only looks for ci_scripts next to the .xcworkspace it was pointed at.
#
# Why this exists: Xcode Cloud knows how to build an Xcode project, not a
# Capacitor one. Two things the archive needs are deliberately NOT in git
# (see ios/.gitignore) and have to be produced on the build machine:
#   - ios/App/App/public   (the web bundle, copied from dist/ by cap sync)
#   - ios/App/Pods         (native deps, installed by pod install)
# Without this script the archive fails within seconds because the
# workspace references a Pods project that does not exist.
#
# Build-time env the web bundle needs (set these in the Xcode Cloud
# workflow > Environment > Environment Variables):
#   VITE_API_BASE_URL              https://www.joinivy.ai        (required)
#   VITE_REVENUECAT_PUBLIC_KEY_IOS appl_...                   (required to
#                                  submit for sale; build only warns)
# scripts/check-ios-env.mjs enforces the first and warns on the second.
set -e
set -x

# Xcode Cloud images ship Homebrew (and CocoaPods), but not Node.
brew install node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"
node --version
npm --version
command -v pod >/dev/null 2>&1 || brew install cocoapods
pod --version

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci --no-audit --no-fund

# env preflight -> vite build -> copy into ios/ -> pod install
npm run ios:sync
