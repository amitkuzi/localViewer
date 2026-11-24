<!-- BEGIN MANAGED RELEASE VERSION POLICY -->
## Release version and date (all projects)

- Every website, application, service, CLI and published release must have a version number that increases on every new release, plus its actual release date in ISO `YYYY-MM-DD` format. Follow the project's existing version scheme; use semantic versioning when none exists.
- Keep version and release date in one canonical project source. Derive or synchronize all displayed values, build/release metadata and changelog entries from that source. The release date is the release event date, not a content/data refresh date; record old dates only from evidence.
- Show version and release date in a user-accessible About, footer or equivalent screen; expose them through CLI version output or API health/version metadata where applicable. Include both in release artifacts and release notes.
- Before shipping, verify the increment and matching date across the built artifact, visible UI/API/CLI and release notes. After deployment, read back the deployed version/date and report the verification result.
- Report source changes, builds and deployed releases separately. Apply this policy to future work in every project, including Codex and Claude projects; deploying other projects still requires the user's authorized scope.
<!-- END MANAGED RELEASE VERSION POLICY -->
