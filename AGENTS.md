# Theme Rules

## Shopify-First Engineering

- Always implement features using native Shopify theme architecture and APIs first (Liquid, sections, blocks, snippets, schema settings, metafields, menus, locales, and Theme Editor settings).
- Prefer Shopify-supported patterns over custom scripts, custom pipelines, or framework abstractions that bypass the platform.
- Avoid hacky or brittle workarounds that go against the spirit of Shopify's system.
- Keep implementations simple, maintainable, and idiomatic to Online Store 2.0.
- When multiple approaches are possible, choose the one that is most native to Shopify and easiest for merchants to manage in the Theme Editor.
- Use color variables only for colors in CSS. Do not hard-code color values in sections/components.
- Use semantic spacing tokens only (for example `--sb-space-2` to `--sb-space-128`) instead of raw pixel/rem spacing values in component styles.
- Use sentence case for UI copy labels and headings (for example `Section title`).
- Keep Theme Editor helper/documentation copy minimal and direct.
- When new assets are provided, always rename them to clean, Shopify-safe, usage-based filenames that match the element/component they are used in.
- For media upload guidance in Theme Editor, use the setting `info` on the media uploader field (not separate paragraph rows) with concise target wording in this format: `Target minimum WxH at Nx export (WxH).`
- For block-based sections, always provide at least one default block in presets/templates so the section is visible by default in Theme Editor.
- For newly created sections with a title setting, always provide a placeholder default title.
