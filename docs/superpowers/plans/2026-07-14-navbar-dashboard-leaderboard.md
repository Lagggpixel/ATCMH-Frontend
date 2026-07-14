# Navbar Dashboard and Leaderboard Implementation Plan

1. Add failing route, navbar, rendering, and backend return-policy contract tests.
2. Add `/leaderboard` to the canonical route map and App Router tree.
3. Reuse the existing attendance leaderboard through `SharedDashboardPage` and correct its login return path.
4. Add Dashboard and Leaderboard links to the marketing header.
5. Allow only the exact public leaderboard path in the Dashboard backend return policy.
6. Run targeted tests, then the complete frontend test/lint/build and backend test suites.
