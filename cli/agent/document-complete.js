'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const DOC_EXT = new Set(['.md', '.markdown', '.txt', '.docx', '.doc', '.pdf']);

function atToken(text) {
  const match = String(text).match(/(?:^|\s)(@(?:"[^"]*|[^"\s]*))$/);
  return match ? match[1] : null;
}

function quoteAt(displayPath) {
  if (displayPath.includes(' ')) return `@"${displayPath}"`;
  return `@${displayPath}`;
}

function places(home) {
  return [
    { label: '文档', folder: 'Documents' },
    { label: '桌面', folder: 'Desktop' },
    { label: '下载', folder: 'Downloads' },
  ].filter((place) => {
    try {
      return fs.statSync(path.join(home, place.folder)).isDirectory();
    } catch {
      return false;
    }
  });
}

function documentEntries(home) {
  const docs = path.join(home, 'Documents');
  let names = [];
  try {
    names = fs.readdirSync(docs);
  } catch {
    return [];
  }
  const entries = [];
  names.forEach((name) => {
    if (name.startsWith('.') || name === 'node_modules') return;
    const full = path.join(docs, name);
    let isDir = false;
    try {
      isDir = fs.statSync(full).isDirectory();
    } catch {
      return;
    }
    if (!isDir && !DOC_EXT.has(path.extname(name).toLowerCase())) return;
    entries.push({ name, isDir });
  });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  return entries.slice(0, 12);
}

function matches(text, query) {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

function parentToken(token) {
  let query = token.startsWith('@') ? token.slice(1) : token;
  if (query.startsWith('"') && query.endsWith('"')) query = query.slice(1, -1);
  if (!query.includes('/') && !query.startsWith('~')) return null;
  const trimmed = query.endsWith('/') ? query.slice(0, -1) : query;
  const slash = trimmed.lastIndexOf('/');
  if (slash <= 0) return '@';
  const parent = trimmed.slice(0, slash + 1);
  if (parent === '~/' || parent === '/') return '@';
  return quoteAt(parent);
}

function expandHome(input, home) {
  if (input === '~') return home;
  if (input.startsWith('~/')) return path.join(home, input.slice(2));
  return input;
}

function pathSuggestions(query, home = os.homedir()) {
  if (!query.includes('/') && !query.startsWith('~')) return null;
  const slash = query.lastIndexOf('/');
  const displayBase = query.slice(0, slash + 1);
  const remainder = query.slice(slash + 1);
  const dir = expandHome(displayBase, home).replace(/\/+$/, '');
  try {
    if (!fs.statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  const items = [];
  const parent = parentToken(`@${query}`);
  if (parent && !remainder) {
    items.push({
      value: parent,
      label: '../',
      description: parent === '@' ? '上一级' : parent.slice(1),
    });
  }
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return items;
  }
  names.forEach((name) => {
    if (name.startsWith('.') || name === 'node_modules') return;
    if (remainder && !matches(name, remainder)) return;
    const full = path.join(dir, name);
    let isDir = false;
    try {
      isDir = fs.statSync(full).isDirectory();
    } catch {
      return;
    }
    if (!isDir && !DOC_EXT.has(path.extname(name).toLowerCase())) return;
    const display = `${displayBase}${name}${isDir ? '/' : ''}`;
    items.push({
      value: quoteAt(display),
      label: `${name}${isDir ? '/' : ''}`,
      description: display,
    });
  });
  const parentCount = items[0]?.label === '../' ? 1 : 0;
  const entries = items.slice(parentCount);
  entries.sort((a, b) => {
    const aDir = a.label.endsWith('/') ? 0 : 1;
    const bDir = b.label.endsWith('/') ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.label.localeCompare(b.label, 'zh');
  });
  return items.slice(0, parentCount).concat(entries).slice(0, 50);
}

function documentSuggestions(query, home = os.homedir()) {
  if (query.includes('/') || query.includes('~')) return [];
  const items = [];
  places(home).forEach((place) => {
    if (!matches(place.label, query) && !matches(place.folder, query)) return;
    items.push({
      value: quoteAt(`~/${place.folder}/`),
      label: `${place.label}/`,
      description: `~/${place.folder}`,
    });
  });
  documentEntries(home).forEach((entry) => {
    if (!matches(entry.name, query)) return;
    const display = `~/Documents/${entry.name}${entry.isDir ? '/' : ''}`;
    items.push({
      value: quoteAt(display),
      label: `${entry.name}${entry.isDir ? '/' : ''}`,
      description: display,
    });
  });
  return items;
}

function mergeSuggestions(extra, builtin, token) {
  const builtinItems = builtin?.items || [];
  const seen = new Set(extra.map((item) => item.value));
  const items = extra.concat(builtinItems.filter((item) => !seen.has(item.value)));
  if (!items.length) return null;
  return { prefix: builtin?.prefix || token, items };
}

function createDocumentAutocomplete(current, home = os.homedir()) {
  return {
    triggerCharacters: ['@'],
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const before = (lines[cursorLine] || '').slice(0, cursorCol);
      const token = atToken(before);
      if (!token || token.startsWith('@"')) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }
      const query = token.slice(1);
      const scoped = pathSuggestions(query, home);
      if (scoped) return { prefix: token, items: scoped };
      const builtin = await current.getSuggestions(lines, cursorLine, cursorCol, options);
      return mergeSuggestions(documentSuggestions(query, home), builtin, token);
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

function acceptAutocompleteSelection(editor) {
  const selected = editor.autocompleteList.getSelectedItem();
  if (!selected || !editor.autocompleteProvider) return;
  editor.pushUndoSnapshot();
  editor.lastAction = null;
  const result = editor.autocompleteProvider.applyCompletion(
    editor.state.lines,
    editor.state.cursorLine,
    editor.state.cursorCol,
    selected,
    editor.autocompletePrefix,
  );
  editor.state.lines = result.lines;
  editor.state.cursorLine = result.cursorLine;
  editor.setCursorCol(result.cursorCol);
  editor.cancelAutocomplete();
  if (editor.onChange) editor.onChange(editor.getText());
}

function moveToParent(editor) {
  const line = editor.state.lines[editor.state.cursorLine] || '';
  const before = line.slice(0, editor.state.cursorCol);
  const token = atToken(before);
  const parent = token && parentToken(token);
  if (!parent) return false;
  const start = before.length - token.length;
  editor.state.lines[editor.state.cursorLine] = `${before.slice(0, start)}${parent}${line.slice(editor.state.cursorCol)}`;
  editor.setCursorCol(start + parent.length);
  editor.cancelAutocomplete();
  if (editor.onChange) editor.onChange(editor.getText());
  return true;
}

function attachDrillEditor(ctx, CustomEditor) {
  if (!CustomEditor || !ctx.ui || typeof ctx.ui.setEditorComponent !== 'function' || ctx.mode !== 'tui') return;
  class DrillEditor extends CustomEditor {
    handleInput(data) {
      const selected = this.isShowingAutocomplete() ? this.autocompleteList?.getSelectedItem() : null;
      const intoDirectory = Boolean(selected?.label?.endsWith('/'));
      if (intoDirectory && this.keybindings.matches(data, 'tui.editor.cursorRight')) {
        acceptAutocompleteSelection(this);
        this.requestAutocomplete({ force: true, explicitTab: false });
        return;
      }
      if (this.isShowingAutocomplete() && this.keybindings.matches(data, 'tui.editor.cursorLeft') && moveToParent(this)) {
        this.requestAutocomplete({ force: true, explicitTab: false });
        return;
      }
      super.handleInput(data);
      if (intoDirectory && (
        this.keybindings.matches(data, 'tui.select.confirm')
        || this.keybindings.matches(data, 'tui.input.tab')
      )) {
        this.requestAutocomplete({ force: true, explicitTab: false });
      }
    }
  }
  ctx.ui.setEditorComponent((tui, theme, keybindings) => new DrillEditor(tui, theme, keybindings));
}

function installDocumentAutocomplete(pi) {
  if (typeof pi.on !== 'function') return;
  let installed = false;
  pi.on('session_start', (_event, ctx) => {
    if (installed || !ctx.ui || typeof ctx.ui.addAutocompleteProvider !== 'function') return;
    installed = true;
    ctx.ui.addAutocompleteProvider((current) => createDocumentAutocomplete(current));
    const editorFile = path.join(__dirname, '..', '..', 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'modes', 'interactive', 'components', 'custom-editor.js');
    import(pathToFileURL(editorFile).href)
      .then((mod) => attachDrillEditor(ctx, mod.CustomEditor))
      .catch(() => {});
  });
}

module.exports = {
  atToken,
  documentSuggestions,
  pathSuggestions,
  parentToken,
  mergeSuggestions,
  createDocumentAutocomplete,
  installDocumentAutocomplete,
};
