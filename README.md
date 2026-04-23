> [!WARNING] Archived
> This project was here for the time that there was no better support for Typst inside Obisidian. As it uses the Typst CLI to render, it is highly inefficient.
> It has now been replaced with https://github.com/azyarashi/obsidian-typst-mate


# Obsidian Typst Math Renderer

An Obsidian plugin that replaces default math blocks with Typst-rendered math blocks using the Typst CLI.

## 🎉 Version 1.3.0 - Live Preview, Watch Mode & Better Errors!

This version adds three major features:

### ✨ New Features
1. **🔴 Live Preview Support** - Math now renders in Live Preview mode, not just Reading mode!
2. **⚡ Watch Mode** - Code blocks auto-recompile when you edit them (experimental)
3. **💬 Better Error Messages** - Clean, user-friendly error display instead of ugly boxes

See [RELEASE_v1.3.0.md](RELEASE_v1.3.0.md) for full details or [QUICKSTART_v1.3.0.md](QUICKSTART_v1.3.0.md) for a quick guide.

## 🚀 Version 1.2.0 - MathJax Override Architecture

This plugin uses a **MathJax override approach** to intercept all math rendering at the source, making it **100% reliable** with no timing issues. Inspired by [obsidian-wypst](https://github.com/0xbolt/obsidian-wypst) but uses the latest Typst CLI instead of outdated WASM.

**Key Benefits:**
- ✅ Catches all inline `$...$` and block `$$...$$` math
- ✅ Works in both Reading AND Live Preview modes
- ✅ No race conditions or timing issues
- ✅ Uses latest Typst CLI with full HTML feature support

See [MATHJAX_OVERRIDE.md](MATHJAX_OVERRIDE.md) for technical details.

## Features

- ✨ Render math equations using Typst's powerful typesetting engine
- 🔄 Automatic compilation of Typst code blocks
- 🎨 Beautiful, publication-quality math rendering
- 💱 **NEW:** Replaces native Obsidian math syntax ($...$ and $$...$$) with Typst
- 🎭 **NEW:** Automatic theme color matching (dark/light mode support)
- ⚙️ Configurable Typst CLI path
- 💾 Caching for improved performance

## Installation

### Prerequisites

1. Install Typst CLI from [https://github.com/typst/typst](https://github.com/typst/typst)
   - Follow the installation instructions for your platform
   - Make sure `typst` command is available in your PATH

### Plugin Installation

#### Manual Installation

1. Clone this repository or download the release
2. Copy the folder to your vault's `.obsidian/plugins/` directory
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

#### From Source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to compile the plugin
4. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugins folder

## Usage

### Basic Usage

Create a code block with `math` or `typst` language identifier:

\`\`\`math
$ sum_(i=1)^n i = (n(n+1))/2 $
\`\`\`

\`\`\`typst
$ integral_0^oo e^(-x^2) dif x = sqrt(pi)/2 $
\`\`\`

### Using Native Markdown Math Syntax

**NEW:** The plugin can also replace Obsidian's native math rendering!

Inline math:
```
This is an equation $x^2 + y^2 = z^2$ in the text.
```

Block math:
```
$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$
```

The plugin will automatically convert LaTeX syntax to Typst and render it with Typst's engine. Enable this in settings!

### Advanced Typst Features

You can use any Typst syntax inside the code blocks:

\`\`\`math
$ mat(
  1, 2, 3;
  4, 5, 6;
  7, 8, 9
) $
\`\`\`

\`\`\`typst
$ lim_(n -> oo) (1 + 1/n)^n = e $
\`\`\`

## Configuration

Go to Settings → Typst Math Renderer to configure:

- **Typst CLI Path**: Path to your Typst executable (default: `typst`)
- **Enable Inline Math**: Process inline math blocks ($...$) - **NEW!**
- **Enable Display Math**: Process display math blocks ($$...$$) - **NEW!**
- **Debug Mode**: Enable debug logging in the console

**Note:** When inline/display math are enabled, the plugin will replace Obsidian's native math rendering with Typst rendering. LaTeX syntax is automatically converted to Typst syntax.

## Development

### Building

```bash
npm install
npm run dev    # Development mode with watch
npm run build  # Production build
```

### Project Structure

```
.
├── main.ts              # Main plugin code
├── manifest.json        # Plugin manifest
├── package.json         # NPM dependencies
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
├── styles.css           # Plugin styles
└── versions.json        # Version compatibility
```

## Troubleshooting

### Typst CLI Not Found

If you see "Typst CLI not found" error:

1. Ensure Typst is installed: `typst --version`
2. Add Typst to your PATH
3. Or specify the full path in plugin settings

### Rendering Issues

- Check the debug mode in settings to see detailed logs
- Verify your Typst syntax is correct
- Try compiling the same code with Typst CLI directly

## Known Limitations

- Desktop only (requires Node.js child_process)
- Requires Typst CLI to be installed separately
- HTML output format is experimental in Typst

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT

## Credits

- [Typst](https://github.com/typst/typst) - The beautiful typesetting system
- [Obsidian](https://obsidian.md/) - The powerful note-taking app

## Support

If you encounter any issues or have suggestions, please file an issue on GitHub.
