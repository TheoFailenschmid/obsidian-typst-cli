import { ChildProcess, spawn } from "child_process";
import { promises as fs } from "fs";
import {
    App,
    editorLivePreviewField,
    loadMathJax,
    MarkdownPostProcessorContext,
    MarkdownView,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
} from "obsidian";
import * as os from "os";
import * as path from "path";

// Extend globalThis to include MathJax
declare global {
  var MathJax: any;
}

interface TypstMathSettings {
  typstPath: string;
  enableInlineMath: boolean;
  enableDisplayMath: boolean;
  debugMode: boolean;
  showDetailedErrors: boolean;
  useWatchMode: boolean;
  enableLivePreview: boolean;
}

const DEFAULT_SETTINGS: TypstMathSettings = {
  typstPath: "typst",
  enableInlineMath: true,
  enableDisplayMath: true,
  debugMode: false,
  showDetailedErrors: false,
  useWatchMode: false,
  enableLivePreview: true,
};

export default class TypstMathPlugin extends Plugin {
  settings: TypstMathSettings;
  private watchers: Map<string, ChildProcess> = new Map();
  private tempDir: string;
  private renderCache: Map<string, string> = new Map();
  private originalTex2chtml: any;

  async onload() {
    await this.loadSettings();

    // Create temp directory for Typst files
    this.tempDir = path.join(os.tmpdir(), "obsidian-typst-math");
    await this.ensureTempDir();

    // Register markdown post processor for math blocks
    this.registerMarkdownCodeBlockProcessor(
      "math",
      this.processMathBlock.bind(this)
    );
    this.registerMarkdownCodeBlockProcessor(
      "typst",
      this.processMathBlock.bind(this)
    );

    // Load MathJax and override its tex2chtml function
    await loadMathJax();

    if (!globalThis.MathJax) {
      new Notice("MathJax failed to load. Math rendering may not work.");
      console.error("MathJax failed to load.");
    } else {
      // Store original MathJax function
      this.originalTex2chtml = globalThis.MathJax.tex2chtml;

      // Override MathJax rendering
      globalThis.MathJax.tex2chtml = (latex: string, options: any) => {
        return this.renderWithTypst(latex, options);
      };

      // Force rerender of current view
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        // Rerender reading mode
        activeView.previewMode?.rerender(true);
        
        // If live preview is enabled, the MathJax override will work automatically
        // because Obsidian uses the same MathJax.tex2chtml in live preview
        if (this.settings.enableLivePreview) {
          // Trigger editor refresh to re-render math
          const editor = activeView.editor;
          if (editor) {
            // Force a subtle refresh by triggering a change event
            const cursor = editor.getCursor();
            editor.setCursor(cursor);
          }
        }
      }
    }

    // Add settings tab
    this.addSettingTab(new TypstMathSettingTab(this.app, this));

    console.log("Typst Math Plugin loaded");
  }

  async onunload() {
    // Restore original MathJax function
    if (this.originalTex2chtml && globalThis.MathJax) {
      globalThis.MathJax.tex2chtml = this.originalTex2chtml;
      // Force rerender of current view
      this.app.workspace.getActiveViewOfType(MarkdownView)?.previewMode.rerender(true);
    }

    // Clean up all watchers
    for (const [id, process] of this.watchers) {
      process.kill();
    }
    this.watchers.clear();

    // Clean up temp directory
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up temp directory:", error);
    }

    console.log("Typst Math Plugin unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error("Error creating temp directory:", error);
    }
  }

  private formatError(error: Error | string, isInline: boolean = false): string {
    const errorMsg = typeof error === 'string' ? error : error.message;
    
    // Clean up common error messages
    let friendlyMsg = 'There was an error with your Typst code';
    
    if (errorMsg.includes('ENOENT') || errorMsg.includes('not found')) {
      friendlyMsg = 'Typst CLI not found';
    } else if (errorMsg.includes('syntax error') || errorMsg.includes('unexpected')) {
      friendlyMsg = 'Syntax error in Typst code';
    } else if (errorMsg.includes('undefined')) {
      friendlyMsg = 'Undefined symbol or function';
    } else if (errorMsg.includes('type')) {
      friendlyMsg = 'Type error in expression';
    }
    
    const errorClass = isInline ? 'typst-error-inline' : 'typst-error';
    
    if (this.settings.showDetailedErrors) {
      return `<span class="${errorClass}">${friendlyMsg}</span><span class="typst-error-details">${errorMsg}</span>`;
    } else {
      return `<span class="${errorClass}">${friendlyMsg}</span>`;
    }
  }

  private async processMathBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) {
    const blockId = this.generateBlockId(source, ctx.sourcePath);

    // Check cache first
    if (this.renderCache.has(blockId)) {
      // Clear the element and add container with cached content
      el.empty();
      const container = el.createDiv({ cls: "typst-math-container" });
      container.innerHTML = this.renderCache.get(blockId)!;
      return;
    }

    // Clear the element first
    el.empty();
    
    // Create container for the rendered output
    const container = el.createDiv({ cls: "typst-math-container" });
    container.innerHTML =
      '<div class="typst-loading">Rendering with Typst...</div>';

    try {
      // Create Typst file
      const typstContent = this.wrapInTypstDocument(source);
      const typstFile = path.join(this.tempDir, `${blockId}.typ`);
      const htmlFile = path.join(this.tempDir, `${blockId}.html`);

      await fs.writeFile(typstFile, typstContent, "utf-8");

      // Start Typst render process (watch or compile)
      if (this.settings.useWatchMode) {
        await this.renderTypstWithWatch(typstFile, htmlFile, container, blockId);
      } else {
        await this.renderTypstToHtml(typstFile, htmlFile, container, blockId);
      }
    } catch (error) {
      container.innerHTML = this.formatError(error, false);
      if (this.settings.debugMode) {
        console.error("Typst rendering error:", error);
      }
    }
  }

  private renderWithTypst(latex: string, options: any): HTMLElement {
    // Check if this should be rendered with Typst based on settings
    const isBlock = options.display || false;
    
    if (isBlock && !this.settings.enableDisplayMath) {
      return this.originalTex2chtml(latex, options);
    }
    if (!isBlock && !this.settings.enableInlineMath) {
      return this.originalTex2chtml(latex, options);
    }

    // Check if we're in live preview mode and if it's enabled
    // The MathJax override works in both reading and live preview modes
    // so we don't need special handling here

    // Check if this contains LaTeX-specific commands that we should fallback for
    if (this.hasLatexCommand(latex)) {
      // For now, convert LaTeX to Typst
      // In the future, we could add a setting to fallback to LaTeX for these
    }

    // Convert LaTeX to Typst
    const typstContent = this.convertLatexToTypst(latex);
    const blockId = this.generateBlockId(typstContent, `math-${Date.now()}`);

    // Create container element
    const container = document.createElement(isBlock ? 'div' : 'span');
    container.className = isBlock ? 'typst-math-container' : 'typst-math-inline';
    container.innerHTML = '<span class="typst-loading">...</span>';

    // Render asynchronously
    this.renderTypstMath(typstContent, container, blockId, isBlock);

    return container;
  }

  private hasLatexCommand(expr: string): boolean {
    // Check for LaTeX-specific commands that might not convert well
    // For now, we'll try to convert everything
    // const regex = /\\begin|\\end/;
    // return regex.test(expr);
    return false;
  }

  private convertLatexToTypst(latex: string): string {
    // Basic LaTeX to Typst conversion
    // Remove outer $ or $$ delimiters if present
    let content = latex.trim();
    content = content.replace(/^\$\$/, '').replace(/\$\$$/, '');
    content = content.replace(/^\$/, '').replace(/\$$/, '');
    
    // Common LaTeX to Typst conversions
    const conversions: [RegExp, string][] = [
      // Fractions
      [/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)'],
      // Superscripts and subscripts (already mostly compatible)
      // Greek letters (mostly the same, just remove backslash)
      [/\\alpha\b/g, 'alpha'],
      [/\\beta\b/g, 'beta'],
      [/\\gamma\b/g, 'gamma'],
      [/\\delta\b/g, 'delta'],
      [/\\epsilon\b/g, 'epsilon'],
      [/\\zeta\b/g, 'zeta'],
      [/\\eta\b/g, 'eta'],
      [/\\theta\b/g, 'theta'],
      [/\\iota\b/g, 'iota'],
      [/\\kappa\b/g, 'kappa'],
      [/\\lambda\b/g, 'lambda'],
      [/\\mu\b/g, 'mu'],
      [/\\nu\b/g, 'nu'],
      [/\\xi\b/g, 'xi'],
      [/\\pi\b/g, 'pi'],
      [/\\rho\b/g, 'rho'],
      [/\\sigma\b/g, 'sigma'],
      [/\\tau\b/g, 'tau'],
      [/\\phi\b/g, 'phi'],
      [/\\chi\b/g, 'chi'],
      [/\\psi\b/g, 'psi'],
      [/\\omega\b/g, 'omega'],
      // Capital Greek
      [/\\Gamma\b/g, 'Gamma'],
      [/\\Delta\b/g, 'Delta'],
      [/\\Theta\b/g, 'Theta'],
      [/\\Lambda\b/g, 'Lambda'],
      [/\\Xi\b/g, 'Xi'],
      [/\\Pi\b/g, 'Pi'],
      [/\\Sigma\b/g, 'Sigma'],
      [/\\Phi\b/g, 'Phi'],
      [/\\Psi\b/g, 'Psi'],
      [/\\Omega\b/g, 'Omega'],
      // Common functions
      [/\\sin\b/g, 'sin'],
      [/\\cos\b/g, 'cos'],
      [/\\tan\b/g, 'tan'],
      [/\\log\b/g, 'log'],
      [/\\ln\b/g, 'ln'],
      [/\\exp\b/g, 'exp'],
      // Sums and integrals
      [/\\sum/g, 'sum'],
      [/\\prod/g, 'product'],
      [/\\int/g, 'integral'],
      [/\\infty\b/g, 'oo'],
      // Arrows
      [/\\rightarrow\b/g, '->'],
      [/\\leftarrow\b/g, '<-'],
      [/\\Rightarrow\b/g, '=>'],
      [/\\Leftarrow\b/g, '<='],
      // Operators
      [/\\times\b/g, 'times'],
      [/\\cdot\b/g, 'dot'],
      [/\\pm\b/g, 'plus.minus'],
      [/\\mp\b/g, 'minus.plus'],
      // Special sets
      [/\\mathbb\{R\}/g, 'RR'],
      [/\\mathbb\{N\}/g, 'NN'],
      [/\\mathbb\{Z\}/g, 'ZZ'],
      [/\\mathbb\{Q\}/g, 'QQ'],
      [/\\mathbb\{C\}/g, 'CC'],
      // Limits
      [/\\lim/g, 'lim'],
      [/\\to\b/g, '->'],
      // Parentheses (mostly the same)
      [/\\left\(/g, '('],
      [/\\right\)/g, ')'],
      [/\\left\[/g, '['],
      [/\\right\]/g, ']'],
      [/\\left\{/g, '{'],
      [/\\right\}/g, '}'],
      // Sqrt
      [/\\sqrt\{([^}]+)\}/g, 'sqrt($1)'],
      // Text
      [/\\text\{([^}]+)\}/g, '"$1"'],
    ];
    
    for (const [pattern, replacement] of conversions) {
      content = content.replace(pattern, replacement);
    }
    
    return content.trim();
  }

  private async renderTypstMath(
    mathContent: string,
    container: HTMLElement,
    blockId: string,
    isBlock: boolean
  ) {
    // Check cache first
    if (this.renderCache.has(blockId)) {
      container.innerHTML = this.renderCache.get(blockId)!;
      return;
    }

    try {
      // Wrap content in $ for math mode
      const wrappedContent = `$ ${mathContent} $`;
      const typstContent = this.wrapInTypstDocument(wrappedContent, isBlock);
      const typstFile = path.join(this.tempDir, `${blockId}.typ`);
      const htmlFile = path.join(this.tempDir, `${blockId}.html`);

      await fs.writeFile(typstFile, typstContent, "utf-8");

      // Render
      await this.renderTypstToHtml(typstFile, htmlFile, container, blockId);
    } catch (error) {
      container.innerHTML = this.formatError(error, true);
      if (this.settings.debugMode) {
        console.error("Typst rendering error:", error);
      }
    }
  }

  private wrapInTypstDocument(mathContent: string, isBlock: boolean = true): string {
    // Wrap the math content in a minimal Typst document
    // This assumes the user is writing Typst math syntax
    const sizeConfig = isBlock ? '16pt' : '14pt';
    return `
#set text(size: ${sizeConfig})
#show math.equation: html.frame
#show math.equation.where(block: false): box

${mathContent}
`;
  }

  private generateBlockId(source: string, sourcePath: string): string {
    // Generate a unique ID for this block
    const hash = this.simpleHash(source + sourcePath);
    return `block-${hash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async renderTypstToHtml(
    typstFile: string,
    htmlFile: string,
    container: HTMLElement,
    blockId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Kill existing watcher for this block if it exists
      if (this.watchers.has(blockId)) {
        this.watchers.get(blockId)?.kill();
        this.watchers.delete(blockId);
      }

      const args = [
        "compile",
        typstFile,
        htmlFile,
        "--features",
        "html",
        "--format",
        "html",
      ];

      if (this.settings.debugMode) {
        console.log(
          "Running Typst command:",
          this.settings.typstPath,
          args.join(" ")
        );
      }

      const typstProcess = spawn(this.settings.typstPath, args);

      let stderr = "";

      typstProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      typstProcess.on("close", async (code: number | null) => {
        if (code === 0) {
          try {
            // Read the generated HTML
            const html = await fs.readFile(htmlFile, "utf-8");

            // Extract the body content (Typst HTML includes full document)
            const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            const content = bodyMatch ? bodyMatch[1] : html;

            // Cache the result
            this.renderCache.set(blockId, content);

            // Update container
            container.innerHTML = content;

            resolve();
          } catch (error) {
            container.innerHTML = this.formatError(error, false);
            reject(error);
          }
        } else {
          const errorMsg = stderr || `Typst process exited with code ${code}`;
          container.innerHTML = this.formatError(errorMsg, false);
          reject(new Error(errorMsg));
        }
      });

      typstProcess.on("error", (error: Error) => {
        container.innerHTML = this.formatError(error, false);
        reject(error);
      });
    });
  }

  private async renderTypstWithWatch(
    typstFile: string,
    htmlFile: string,
    container: HTMLElement,
    blockId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Kill existing watcher for this block if it exists
      if (this.watchers.has(blockId)) {
        this.watchers.get(blockId)?.kill();
        this.watchers.delete(blockId);
      }

      const args = [
        "watch",
        typstFile,
        htmlFile,
        "--features",
        "html",
        "--format",
        "html",
      ];

      if (this.settings.debugMode) {
        console.log(
          "Running Typst watch:",
          this.settings.typstPath,
          args.join(" ")
        );
      }

      const typstProcess = spawn(this.settings.typstPath, args);
      this.watchers.set(blockId, typstProcess);

      let stderr = "";
      let hasRendered = false;

      // Watch for file changes and update
      const checkForUpdates = async () => {
        try {
          const html = await fs.readFile(htmlFile, "utf-8");
          const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
          const content = bodyMatch ? bodyMatch[1] : html;

          // Cache and update
          this.renderCache.set(blockId, content);
          container.innerHTML = content;

          if (!hasRendered) {
            hasRendered = true;
            resolve();
          }
        } catch (error) {
          // File might not exist yet, wait for next update
          if (this.settings.debugMode) {
            console.log("Waiting for Typst to generate output...");
          }
        }
      };

      typstProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
        
        // Check if there's an error in the output
        if (stderr.includes('error:')) {
          container.innerHTML = this.formatError(stderr, false);
        }
      });

      typstProcess.stdout.on("data", (data: Buffer) => {
        const output = data.toString();
        if (this.settings.debugMode) {
          console.log("Typst watch output:", output);
        }
        
        // Typst watch prints updates, check for new HTML
        if (output.includes('written to') || output.includes('compiled')) {
          setTimeout(checkForUpdates, 100);
        }
      });

      // Initial check after a short delay
      setTimeout(checkForUpdates, 500);

      typstProcess.on("close", (code: number | null) => {
        this.watchers.delete(blockId);
        if (code !== 0 && code !== null && !hasRendered) {
          const errorMsg = stderr || `Typst watch exited with code ${code}`;
          container.innerHTML = this.formatError(errorMsg, false);
          reject(new Error(errorMsg));
        }
      });

      typstProcess.on("error", (error: Error) => {
        this.watchers.delete(blockId);
        container.innerHTML = this.formatError(error, false);
        reject(error);
      });
    });
  }
}

class TypstMathSettingTab extends PluginSettingTab {
  plugin: TypstMathPlugin;

  constructor(app: App, plugin: TypstMathPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Typst Math Renderer Settings" });

    new Setting(containerEl)
      .setName("Typst CLI path")
      .setDesc('Path to the Typst executable (e.g., "typst" or full path)')
      .addText((text: any) =>
        text
          .setPlaceholder("typst")
          .setValue(this.plugin.settings.typstPath)
          .onChange(async (value: string) => {
            this.plugin.settings.typstPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Enable inline math")
      .setDesc("Process inline math blocks ($...$)")
      .addToggle((toggle: any) =>
        toggle
          .setValue(this.plugin.settings.enableInlineMath)
          .onChange(async (value: boolean) => {
            this.plugin.settings.enableInlineMath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Enable display math")
      .setDesc("Process display math blocks ($$...$$)")
      .addToggle((toggle: any) =>
        toggle
          .setValue(this.plugin.settings.enableDisplayMath)
          .onChange(async (value: boolean) => {
            this.plugin.settings.enableDisplayMath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Debug mode")
      .setDesc("Enable debug logging in the console")
      .addToggle((toggle: any) =>
        toggle
          .setValue(this.plugin.settings.debugMode)
          .onChange(async (value: boolean) => {
            this.plugin.settings.debugMode = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show detailed errors")
      .setDesc("Display detailed Typst error messages (useful for debugging)")
      .addToggle((toggle: any) =>
        toggle
          .setValue(this.plugin.settings.showDetailedErrors)
          .onChange(async (value: boolean) => {
            this.plugin.settings.showDetailedErrors = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Use watch mode")
      .setDesc("Enable watch mode for code blocks (auto-recompile on changes) - experimental")
      .addToggle((toggle: any) =>
        toggle
          .setValue(this.plugin.settings.useWatchMode)
          .onChange(async (value: boolean) => {
            this.plugin.settings.useWatchMode = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Enable live preview")
      .setDesc("Render Typst math in live preview mode (works automatically via MathJax override)")
      .addToggle((toggle: any) =>
        toggle
          .setValue(this.plugin.settings.enableLivePreview)
          .onChange(async (value: boolean) => {
            this.plugin.settings.enableLivePreview = value;
            await this.plugin.saveSettings();
            new Notice("Reload Obsidian for this change to take full effect");
          })
      );

    containerEl.createEl("h3", { text: "Usage" });
    containerEl.createEl("p", {
      text: "Create a code block with ```math or ```typst and write your Typst math syntax inside.",
    });
    containerEl.createEl("pre", {
      text: "```math\n$ sum_(i=1)^n i = (n(n+1))/2 $\n```",
    });

    containerEl.createEl("h3", { text: "Installation" });
    containerEl.createEl("p", {
      text: "Make sure you have Typst CLI installed. Visit https://github.com/typst/typst for installation instructions.",
    });
  }
}
