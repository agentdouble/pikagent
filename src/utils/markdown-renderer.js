/**
 * Markdown rendering helper — wraps markdown-it with highlight.js integration.
 * Single shared parser instance keeps memory footprint small.
 */

import MarkdownIt from 'markdown-it';

let md = null;

function getParser() {
  if (md) return md;
  md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(code, lang) {
      if (!window.hljs) return '';
      if (lang && window.hljs.getLanguage(lang)) {
        try {
          return window.hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } catch (_) {}
      }
      try {
        return window.hljs.highlightAuto(code).value;
      } catch (_) {
        return '';
      }
    },
  });
  return md;
}

/**
 * Render a markdown string to sanitized HTML.
 * @param {string} source
 * @returns {string} HTML
 */
export function renderMarkdown(source) {
  return getParser().render(source || '');
}
