# Upstream Reference: Alibaba SmartResume

This directory is a source snapshot of [alibaba/SmartResume](https://github.com/alibaba/SmartResume), imported for Chinese resume parsing and PDF round-trip evaluation research.

- Source commit: `3b62157be4b07e1d89f03567536524cb89e4ea46`
- Imported on: 2026-08-14
- License: Apache-2.0 (see `LICENSE`)
- Scope: reference only; it is not installed into the Node/TypeScript runtime

The project is a layout-aware resume parser, not a proprietary Alibaba ATS scoring implementation. Its most relevant use here is parsing generated PDFs back into structured fields so we can measure whether contact details, companies, dates, education, and skills survive rendering.
