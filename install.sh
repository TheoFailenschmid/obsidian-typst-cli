#!/bin/bash
# Installation script for Obsidian Typst Math Renderer Plugin

echo "🎨 Obsidian Typst Math Renderer - Installation Script"
echo "======================================================"
echo ""

# Check if Typst is installed
if ! command -v typst &> /dev/null; then
    echo "⚠️  Warning: Typst CLI not found!"
    echo "   Please install Typst from: https://github.com/typst/typst"
    echo "   Installation guides:"
    echo "   - Windows: winget install --id Typst.Typst"
    echo "   - macOS: brew install typst"
    echo "   - Linux: Download from GitHub releases"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ Typst CLI found: $(typst --version)"
fi

echo ""

# Ask for vault location
read -p "Enter your Obsidian vault path: " vault_path

# Expand tilde if present
vault_path="${vault_path/#\~/$HOME}"

# Check if vault exists
if [ ! -d "$vault_path" ]; then
    echo "❌ Error: Vault directory not found: $vault_path"
    exit 1
fi

# Create plugin directory
plugin_dir="$vault_path/.obsidian/plugins/obsidian-typst-math"
echo ""
echo "📁 Creating plugin directory: $plugin_dir"
mkdir -p "$plugin_dir"

# Copy plugin files
echo "📄 Copying plugin files..."
cp main.js "$plugin_dir/"
cp manifest.json "$plugin_dir/"
cp styles.css "$plugin_dir/"

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Open Obsidian"
echo "2. Go to Settings → Community Plugins"
echo "3. Disable 'Safe Mode' if enabled"
echo "4. Click 'Reload plugins' or restart Obsidian"
echo "5. Enable 'Typst Math Renderer'"
echo "6. Configure the plugin in Settings → Typst Math Renderer"
echo ""
echo "📚 Read QUICKSTART.md for usage instructions"
echo "📖 Check EXAMPLES.md for syntax examples"
echo ""
echo "Happy typesetting! 🎉"
