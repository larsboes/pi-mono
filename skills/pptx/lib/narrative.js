/**
 * Narrative Engine
 * Implements SCQA Framework and Storytelling Quality Checks
 */

class NarrativeEngine {
  constructor() {
    this.frameworks = {
      scqa: ['situation', 'complication', 'question', 'answer'],
      pyramid: ['summary', 'argument', 'data'],
      pitch: ['problem', 'solution', 'market', 'team'],
      past_future: ['history', 'status_quo', 'future', 'roadmap']
    };
  }

  /**
   * Analyze the flow of slides and provide structural feedback
   */
  analyzeStoryline(slides) {
    const text = slides.map(s => s.rawText.toLowerCase()).join(' ');
    const titles = slides.map(s => (s.title || '').toLowerCase());
    
    const report = {
      score: 100,
      matches: [],
      suggestions: [],
      missingElements: []
    };

    // Check for Title Slide
    if (!slides[0].layoutType || slides[0].layoutType !== 'title') {
      report.score -= 15;
      report.suggestions.push("The first slide should be a dedicated Title slide.");
    }

    // SCQA Validation
    const hasSituation = titles.some(t => t.match(/status|ist-zustand|situation|ausgangslage/));
    const hasComplication = text.match(/problem|herausforderung|engpass|complication|schmerzpunkt/);
    const hasQuestion = text.match(/wie können wir|frage|zielsetzung|how might we/);
    const hasAnswer = text.match(/lösung|ansatz|solution|antwort/);

    if (!hasSituation) report.missingElements.push('Situation');
    if (!hasComplication) report.missingElements.push('Complication (The "Why")');
    if (!hasAnswer) report.missingElements.push('Answer (The "How")');

    if (report.missingElements.length > 0) {
      report.score -= (report.missingElements.length * 15);
      report.suggestions.push(`Missing core narrative elements: ${report.missingElements.join(', ')}.`);
    }

    // Logical Conclusion Check
    const hasNextSteps = text.match(/nächste schritte|roadmap|next steps|fazit/);
    if (!hasNextSteps) {
      report.score -= 10;
      report.suggestions.push("The deck ends without clear 'Next Steps' or a 'Roadmap'.");
    }

    // Call to Action
    const hasCTA = text.match(/entscheidung|freigabe|request|bitte um/);
    if (!hasCTA && report.score > 70) {
      report.suggestions.push("Consider adding a clear 'Call to Action' if this is a decision deck.");
    }

    return report;
  }

  /**
   * Suggest a storyline framework based on keywords
   */
  suggestFramework(markdown) {
    const text = markdown.toLowerCase();
    if (text.includes('invest') || text.includes('pitch')) return 'pitch';
    if (text.includes('problemanalyse')) return 'scqa';
    if (text.includes('bericht') || text.includes('review')) return 'past_future';
    return 'scqa'; // Default
  }
}

module.exports = NarrativeEngine;
