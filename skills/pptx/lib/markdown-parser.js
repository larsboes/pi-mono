/**
 * Markdown Parser for PPTX Content
 * Converts Markdown to structured slide content
 */

class MarkdownParser {
  constructor() {
    this.slideSeparator = /^---+$/gm;
    this.headingPattern = /^(#{1,6})\s+(.+)$/;
    this.listPattern = /^([\s]*[-*])\s+(.+)$/;
    this.tablePattern = /^\|(.+)\|$/;
  }

  parse(content) {
    const slides = [];
    const sections = content.split(this.slideSeparator);

    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;

      const slide = this.parseSection(trimmed);
      if (slide) {
        slides.push(slide);
      }
    }

    return slides;
  }

  parseSection(text) {
    const lines = text.split('\n').map(l => l.trim());
    const slide = {
      title: null,
      subtitle: null,
      content: [],
      metadata: {},
      rawText: text
    };

    let currentList = null;
    let inTable = false;
    let tableLines = [];

    for (const line of lines) {
      // Parse headings
      const headingMatch = line.match(this.headingPattern);
      if (headingMatch) {
        // Flush any pending table
        if (inTable) {
          slide.content.push(this.parseTable(tableLines));
          tableLines = [];
          inTable = false;
        }

        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();

        if (level === 1 && !slide.title) {
          slide.title = text;
        } else if (level === 2 && !slide.subtitle) {
          slide.subtitle = text;
        } else {
          slide.content.push({
            type: 'heading',
            level,
            text
          });
        }
        continue;
      }

      // Parse tables
      if (line.startsWith('|')) {
        inTable = true;
        tableLines.push(line);
        continue;
      } else if (inTable) {
        slide.content.push(this.parseTable(tableLines));
        tableLines = [];
        inTable = false;
      }

      // Parse lists
      const listMatch = line.match(this.listPattern);
      if (listMatch) {
        const text = listMatch[2].trim();
        const level = listMatch[1].length;

        // Check for bold key (e.g., "**Key:** Value")
        const keyValueMatch = text.match(/^\*\*(.+?)\*\*[:\s]+(.+)$/);

        if (keyValueMatch) {
          slide.content.push({
            type: 'key-value',
            key: keyValueMatch[1],
            value: keyValueMatch[2]
          });
        } else {
          if (!currentList) {
            currentList = {
              type: 'list',
              items: []
            };
          }
          currentList.items.push({ text, level });
        }
        continue;
      } else if (currentList) {
        slide.content.push(currentList);
        currentList = null;
      }

      // Parse paragraphs
      if (line) {
        slide.content.push({
          type: 'paragraph',
          text: line
        });
      }
    }

    // Flush any remaining content
    if (currentList) {
      slide.content.push(currentList);
    }
    if (inTable && tableLines.length > 0) {
      slide.content.push(this.parseTable(tableLines));
    }

    // Extract metadata for layout detection
    slide.items = this.extractItems(slide);
    slide.hasNumbers = this.checkForNumbers(slide);
    slide.comparison = this.detectComparison(slide);

    return slide;
  }

  parseTable(lines) {
    const rows = [];
    for (const line of lines) {
      const cells = line
        .split('|')
        .map(c => c.trim())
        .filter(c => c);
      if (cells.length > 0 && !cells[0].match(/^[\-:]+$/)) {
        rows.push(cells);
      }
    }

    return {
      type: 'table',
      headers: rows[0] || [],
      rows: rows.slice(1)
    };
  }

  extractItems(slide) {
    const items = [];

    for (const block of slide.content) {
      if (block.type === 'list') {
        items.push(...block.items.map(i => i.text));
      } else if (block.type === 'key-value') {
        items.push(`${block.key}: ${block.value}`);
      } else if (block.type === 'heading') {
        items.push(block.text);
      }
    }

    return items;
  }

  checkForNumbers(slide) {
    const numberPattern = /\d+%|\d+M|\d+K|\$\d+|\d+\s*(million|billion|thousand)/i;
    const text = slide.content
      .map(c => c.text || (c.items && c.items.map(i => i.text).join(' ')) || '')
      .join(' ');
    return numberPattern.test(text);
  }

  detectComparison(slide) {
    const comparisonWords = ['vs', 'versus', 'vs.', 'alt', 'neu', 'legacy', 'zukunft'];
    const text = slide.content
      .map(c => c.text || '')
      .join(' ')
      .toLowerCase();

    return comparisonWords.some(w => text.includes(w));
  }

  // Helper to detect chart data in tables
  extractChartData(slide) {
    for (const block of slide.content) {
      if (block.type === 'table' && block.rows.length >= 2) {
        // Check if numeric data
        const numericCol = block.rows[0].findIndex((cell, i) => {
          if (i === 0) return false;
          return block.rows.every(row => !isNaN(parseFloat(row[i])));
        });

        if (numericCol > 0) {
          return {
            labels: block.rows.map(r => r[0]),
            values: block.rows.map(r => parseFloat(r[numericCol]))
          };
        }
      }
    }
    return null;
  }
}

module.exports = MarkdownParser;
