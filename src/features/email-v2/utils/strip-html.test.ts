import { stripHtml } from './strip-html';

describe('stripHtml', () => {
  it('should return empty string for null/undefined input', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });

  it('should remove HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
    expect(stripHtml('<div><span>Test</span></div>')).toBe('Test');
  });

  it('should decode HTML entities', () => {
    expect(stripHtml('Hello &amp; World')).toBe('Hello & World');
    expect(stripHtml('Price: &euro;10')).toBe('Price: €10');
  });

  it('should collapse multiple whitespace characters', () => {
    expect(stripHtml('Hello    World')).toBe('Hello World');
    expect(stripHtml('Line1\n\nLine2')).toBe('Line1 Line2');
  });

  it('should trim whitespace', () => {
    expect(stripHtml('  Hello World  ')).toBe('Hello World');
  });

  it('should handle complex HTML with multiple elements', () => {
    const html = `
      <table class="container" cellpadding="0">
        <tr>
          <td><strong>Important:</strong></td>
        </tr>
        <tr>
          <td>Message with &amp; entities</td>
        </tr>
      </table>
    `;
    expect(stripHtml(html)).toBe('Important: Message with & entities');
  });
});