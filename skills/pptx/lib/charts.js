/**
 * Chart Generator for PPTX
 * Converts data (inline, CSV, markdown tables) to PptxGenJS charts
 */

const PptxGenJS = require('pptxgenjs');
const fs = require('fs');

class ChartGenerator {
  constructor(template) {
    this.template = template;
    this.defaultColors = [
      'E20074', '262626', '4A7C59', '2563EB',
      'D97706', 'DC2626', '7C3AED', '059669'
    ];
  }

  /**
   * Parse inline data string: "Q1:45,Q2:67,Q3:89"
   */
  parseInlineData(dataStr) {
    const pairs = dataStr.split(',').map(s => s.trim());
    const labels = [];
    const values = [];

    for (const pair of pairs) {
      const [label, value] = pair.split(':').map(s => s.trim());
      labels.push(label);
      values.push(parseFloat(value) || 0);
    }

    return { labels, datasets: [{ name: 'Data', values }] };
  }

  /**
   * Parse CSV file into chart data
   */
  parseCSV(filePath, xCol, yCol) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(s => s.trim());

    const xIdx = xCol ? headers.indexOf(xCol) : 0;
    const yIndices = yCol
      ? [headers.indexOf(yCol)]
      : headers.map((_, i) => i).filter(i => i !== xIdx);

    const labels = [];
    const datasets = yIndices.map(i => ({ name: headers[i], values: [] }));

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(s => s.trim());
      labels.push(cells[xIdx]);
      yIndices.forEach((yIdx, di) => {
        datasets[di].values.push(parseFloat(cells[yIdx]) || 0);
      });
    }

    return { labels, datasets };
  }

  /**
   * Parse markdown table into chart data
   */
  parseMarkdownTable(tableBlock) {
    if (!tableBlock || tableBlock.type !== 'table') return null;

    const headers = tableBlock.headers;
    const rows = tableBlock.rows;

    // Find numeric columns
    const numericCols = [];
    for (let c = 1; c < headers.length; c++) {
      const allNumeric = rows.every(row => {
        const val = (row[c] || '').replace(/[%$MKk+,]/g, '');
        return !isNaN(parseFloat(val));
      });
      if (allNumeric) numericCols.push(c);
    }

    if (numericCols.length === 0) return null;

    const labels = rows.map(r => r[0]);
    const datasets = numericCols.map(c => ({
      name: headers[c],
      values: rows.map(r => {
        const val = (r[c] || '0').replace(/[%$MKk+,]/g, '');
        return parseFloat(val) || 0;
      })
    }));

    return { labels, datasets };
  }

  /**
   * Auto-detect best chart type based on data
   */
  autoDetectType(data) {
    const { labels, datasets } = data;
    const count = labels.length;
    const seriesCount = datasets.length;

    // Pie/Doughnut for composition (single series, < 8 items)
    if (seriesCount === 1 && count <= 7) {
      return count <= 4 ? 'doughnut' : 'pie';
    }

    // Bar for comparison (< 10 items)
    if (count <= 10 && seriesCount <= 3) {
      return 'bar';
    }

    // Line for trends (> 4 data points)
    if (count > 4) {
      return 'line';
    }

    return 'bar';
  }

  /**
   * Add chart to a slide
   */
  addChart(slide, pptx, data, options = {}) {
    const type = options.type || this.autoDetectType(data);
    const colors = this.getChartColors(data.datasets.length);

    // Format data for PptxGenJS
    const chartData = data.datasets.map((ds, i) => ({
      name: ds.name,
      labels: data.labels,
      values: ds.values
    }));

    // Chart type mapping
    const chartTypeMap = {
      'bar': pptx.charts.BAR,
      'bar3d': pptx.charts.BAR3D,
      'line': pptx.charts.LINE,
      'pie': pptx.charts.PIE,
      'doughnut': pptx.charts.DOUGHNUT,
      'radar': pptx.charts.RADAR,
      'area': pptx.charts.AREA
    };

    const pptxChartType = chartTypeMap[type] || pptx.charts.BAR;

    // Chart options
    const chartOpts = {
      x: options.x || 0.5,
      y: options.y || 1.5,
      w: options.w || 9,
      h: options.h || 4,
      showTitle: !!options.title,
      title: options.title || '',
      titleColor: this.template ? this.template.getColor('text') : '262626',
      titleFontSize: 14,
      showValue: options.showValue !== false,
      valueFontSize: 10,
      catAxisLabelColor: this.template ? this.template.getColor('text') : '262626',
      catAxisLabelFontSize: 11,
      valAxisLabelColor: this.template ? this.template.getColor('text') : '262626',
      valAxisLabelFontSize: 10,
      chartColors: colors,
      legendPos: data.datasets.length > 1 ? 'b' : 'none',
      legendFontSize: 10
    };

    // Type-specific options
    if (type === 'bar') {
      chartOpts.barDir = options.horizontal ? 'bar' : 'col';
      chartOpts.barGapWidthPct = 80;
      chartOpts.catAxisOrientation = 'minMax';
      chartOpts.valAxisOrientation = 'minMax';
      chartOpts.showLegend = data.datasets.length > 1;
    }

    if (type === 'line') {
      chartOpts.lineSize = 3;
      chartOpts.lineSmooth = false;
      chartOpts.showMarker = true;
      chartOpts.markerSize = 6;
    }

    if (type === 'pie' || type === 'doughnut') {
      chartOpts.showPercent = true;
      chartOpts.showValue = false;
      chartOpts.showLegend = true;
      chartOpts.legendPos = 'r';
      if (type === 'doughnut') {
        chartOpts.holeSize = 50;
      }
    }

    if (type === 'radar') {
      chartOpts.radarStyle = 'filled';
    }

    slide.addChart(pptxChartType, chartData, chartOpts);
  }

  /**
   * Create standalone chart slide
   */
  createChartSlide(pptx, data, options = {}) {
    const slide = pptx.addSlide();
    const bgColor = this.template ? this.template.getColor('background') : 'FFFFFF';
    slide.background = { color: bgColor };

    // Title
    if (options.title) {
      const textColor = this.template ? this.template.getColor('text') : '262626';
      slide.addText(options.title, {
        x: 0.5, y: 0.3, w: 9, h: 0.6,
        fontSize: 28, bold: true, color: textColor,
        fontFace: this.template ? this.template.getFont('heading') : 'Arial'
      });
    }

    this.addChart(slide, pptx, data, {
      ...options,
      y: options.title ? 1.2 : 0.5,
      h: options.title ? 4.3 : 5
    });

    return slide;
  }

  getChartColors(count) {
    const templateColors = this.template ? [
      this.template.getColor('primary'),
      this.template.getColor('secondary'),
      this.template.getColor('accent'),
      this.template.getColor('success'),
      this.template.getColor('warning'),
      this.template.getColor('info')
    ] : [];

    const colors = [...new Set([...templateColors, ...this.defaultColors])];
    return colors.slice(0, Math.max(count, 3));
  }
}

module.exports = ChartGenerator;
