import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandButtonStyle, brandTextColor, contrastRatio } from '../../src/lib/brandColor';

test('contrast ratio matches WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(1), '21.0');
  assert.equal(contrastRatio('#777777', '#FFFFFF').toFixed(2), '4.48');
});

test('accent buttons always get the more readable text colour', () => {
  assert.equal(brandTextColor('#1C1B19'), '#FFFFFF');
  assert.equal(brandTextColor('#FFD400'), '#1C1B19');
  // AURA oak: white is 3.95:1 and ink 4.36:1, so it gets black (5.3:1).
  assert.equal(brandTextColor('#9C7A52'), '#000000');
  for (let i = 0; i < 4096; i++) {
    const accent = '#' + [i >> 8, (i >> 4) & 15, i & 15].map((n) => (n * 17).toString(16).padStart(2, '0')).join('');
    assert.ok(contrastRatio(accent, brandTextColor(accent)) >= 4.5, `${accent} readable`);
  }
});

test('invalid or missing accents fall back to the default button style', () => {
  assert.equal(brandButtonStyle(null), undefined);
  assert.equal(brandButtonStyle('red'), undefined);
  assert.deepEqual(brandButtonStyle('#0055ff'), { background: '#0055ff', color: '#FFFFFF' });
});
