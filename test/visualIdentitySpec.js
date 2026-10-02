const fs = require('fs');
const path = require('path');

describe('Badcoin visual identity shell', () => {
  const root = path.resolve(__dirname, '..');
  const styles = fs.readFileSync(path.join(root, 'public', 'css', 'style.scss'), 'utf8');
  const layout = fs.readFileSync(path.join(root, 'views', 'layout.pug'), 'utf8');

  it('defines the canonical Badcoin palette', () => {
    ['#0b0b0f', '#14141a', '#ff1b1b', '#ff0033', '#f4f4f4', '#a5a5a5']
      .forEach((value) => expect(styles).toContain(value));
  });

  it('defines the Badcoin body and display font stacks', () => {
    expect(styles).toContain('--bad-font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
    expect(styles).toContain('--bad-font-display: "Arial Black", "Helvetica Neue", Arial, sans-serif');
  });

  it('keeps the shared shell behind stable Badcoin hooks', () => {
    ['body.badcoin-shell', 'badcoin-shell-header', 'badcoin-shell-sidebar', 'badcoin-search-submit', 'badcoin-shell-footer']
      .forEach((hook) => expect(layout).toContain(hook));
  });

  it('provides one neutral reusable five-algorithm badge primitive', () => {
    expect(styles).toContain('.badcoin-algorithm-badge');
    expect(styles).toContain('background: var(--bad-surface-alt)');
    expect(styles).toContain('border: 1px solid var(--bad-border)');
  });

  it('preserves visible keyboard focus styling', () => {
    expect(styles).toContain('.badcoin-shell :focus-visible');
    expect(styles).toContain('outline: 2px solid var(--bad-accent)');
  });
});
