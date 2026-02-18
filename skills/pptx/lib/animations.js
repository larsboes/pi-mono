/**
 * Animations & Transitions for PPTX
 * Slide transitions (native) + Element animations (XML injection)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class AnimationEngine {
  constructor() {
    // PptxGenJS supported slide transitions
    this.slideTransitions = {
      'fade':    { type: 'fade' },
      'push':    { type: 'push',  dir: 'L' },
      'push-up': { type: 'push', dir: 'U' },
      'wipe':    { type: 'wipe',  dir: 'L' },
      'wipe-up': { type: 'wipe',  dir: 'U' },
      'cover':   { type: 'cover', dir: 'L' },
      'split':   { type: 'split', dir: 'H' },
      'none':    null
    };

    // Element animation templates (for XML injection)
    this.elementAnimations = {
      'fadeIn': {
        type: 'anim',
        preset: 10,
        name: 'Fade',
        duration: 500
      },
      'flyInLeft': {
        type: 'anim',
        preset: 2,
        name: 'Fly In',
        dir: 'l',
        duration: 500
      },
      'flyInBottom': {
        type: 'anim',
        preset: 2,
        name: 'Fly In',
        dir: 'u',
        duration: 500
      },
      'zoomIn': {
        type: 'anim',
        preset: 53,
        name: 'Grow/Shrink',
        duration: 400
      },
      'wipeRight': {
        type: 'anim',
        preset: 22,
        name: 'Wipe',
        dir: 'l',
        duration: 600
      }
    };
  }

  /**
   * Apply slide transition (native PptxGenJS)
   */
  applySlideTransition(slide, transitionName = 'fade', speed = 1.0) {
    const transition = this.slideTransitions[transitionName];
    if (!transition) return;

    slide.transition = {
      type: transition.type,
      dir: transition.dir,
      speed: speed
    };
  }

  /**
   * Apply transitions to all slides in a deck
   */
  applyDeckTransitions(slides, options = {}) {
    const defaultTransition = options.transition || 'fade';
    const speed = options.speed || 1.0;
    const skipFirst = options.skipFirst !== false; // Don't animate title slide

    slides.forEach((slide, i) => {
      if (skipFirst && i === 0) return;

      // Allow per-slide override
      const transition = slide._customTransition || defaultTransition;
      this.applySlideTransition(slide, transition, speed);
    });
  }

  /**
   * Inject element animations via XML post-processing
   * This modifies the PPTX file after creation
   */
  async injectElementAnimations(pptxPath, animationMap) {
    if (!animationMap || Object.keys(animationMap).length === 0) return;

    const tmpDir = path.join('/tmp', `pptx-anim-${Date.now()}`);

    try {
      // Unzip PPTX
      fs.mkdirSync(tmpDir, { recursive: true });
      execSync(`unzip -o "${pptxPath}" -d "${tmpDir}" 2>/dev/null`, { stdio: 'pipe' });

      // Process each slide's animations
      for (const [slideNum, animations] of Object.entries(animationMap)) {
        const slideXmlPath = path.join(tmpDir, 'ppt', 'slides', `slide${slideNum}.xml`);

        if (!fs.existsSync(slideXmlPath)) {
          console.warn(`  ⚠ Slide ${slideNum} XML not found, skipping animations`);
          continue;
        }

        let slideXml = fs.readFileSync(slideXmlPath, 'utf8');
        const animXml = this.generateAnimationXml(animations);

        // Insert before </p:cSld> or </p:sld>
        if (animXml) {
          // Add timing node if not present
          if (!slideXml.includes('<p:timing>')) {
            const insertPoint = slideXml.lastIndexOf('</p:cSld>');
            if (insertPoint > 0) {
              slideXml = slideXml.slice(0, insertPoint) + '</p:cSld>' + animXml + slideXml.slice(insertPoint + '</p:cSld>'.length);
            }
          }
          fs.writeFileSync(slideXmlPath, slideXml);
        }
      }

      // Rezip into PPTX
      const backupPath = pptxPath.replace('.pptx', '.backup.pptx');
      fs.copyFileSync(pptxPath, backupPath);

      execSync(`cd "${tmpDir}" && zip -r -q "${pptxPath}" .`, { stdio: 'pipe' });

      // Clean up
      execSync(`rm -rf "${tmpDir}"`, { stdio: 'pipe' });
      fs.unlinkSync(backupPath);

      console.log('  ✓ Element animations injected');
    } catch (err) {
      console.error('  ✖ Animation injection failed:', err.message);
      // Restore backup if exists
      const backupPath = pptxPath.replace('.pptx', '.backup.pptx');
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, pptxPath);
        fs.unlinkSync(backupPath);
      }
      // Clean up tmp
      execSync(`rm -rf "${tmpDir}" 2>/dev/null`, { stdio: 'pipe' });
    }
  }

  /**
   * Generate Office Open XML for animations
   */
  generateAnimationXml(animations) {
    if (!animations || animations.length === 0) return '';

    let xml = '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">';
    xml += '<p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq">';
    xml += '<p:childTnLst>';

    let tnId = 3;

    animations.forEach((anim, i) => {
      const config = this.elementAnimations[anim.effect] || this.elementAnimations['fadeIn'];
      const delay = anim.delay || (i * 200); // Stagger by default
      const duration = anim.duration || config.duration;
      const spId = anim.shapeId || (i + 2); // Shape IDs start at 2

      xml += `<p:par><p:cTn id="${tnId++}" fill="hold">`;
      xml += `<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>`;
      xml += '<p:childTnLst>';

      // Fade animation
      xml += `<p:par><p:cTn id="${tnId++}" presetID="${config.preset}" presetClass="entr" `;
      xml += `presetSubtype="0" fill="hold" nodeType="afterEffect">`;
      xml += `<p:stCondLst><p:cond delay="0"/></p:stCondLst>`;
      xml += '<p:childTnLst>';

      // Alpha animation (fade in from 0 to 100%)
      xml += `<p:set><p:cBhvr><p:cTn id="${tnId++}" dur="1" fill="hold">`;
      xml += '<p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>';
      xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`;
      xml += '<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>';
      xml += '</p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>';

      // Alpha fade
      xml += `<p:animEffect transition="in" filter="fade"><p:cBhvr>`;
      xml += `<p:cTn id="${tnId++}" dur="${duration}"/>`
      xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`;
      xml += '</p:cBhvr></p:animEffect>';

      xml += '</p:childTnLst></p:cTn></p:par>';
      xml += '</p:childTnLst></p:cTn></p:par>';
    });

    xml += '</p:childTnLst></p:cTn>';
    xml += '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>';
    xml += '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>';
    xml += '</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>';

    return xml;
  }

  /**
   * Create a preset animation plan for common slide types
   */
  createPreset(slideType) {
    const presets = {
      'title': [
        { effect: 'fadeIn', delay: 0, shapeId: 2 },       // Title
        { effect: 'fadeIn', delay: 300, shapeId: 3 },     // Subtitle
        { effect: 'wipeRight', delay: 500, shapeId: 4 }   // Accent bar
      ],
      'cards': [
        { effect: 'fadeIn', delay: 0, shapeId: 2 },       // Card 1
        { effect: 'fadeIn', delay: 200, shapeId: 3 },     // Card 2
        { effect: 'fadeIn', delay: 400, shapeId: 4 },     // Card 3
        { effect: 'fadeIn', delay: 600, shapeId: 5 }      // Card 4
      ],
      'bullets': [
        { effect: 'flyInLeft', delay: 0, shapeId: 2 },
        { effect: 'flyInLeft', delay: 150, shapeId: 3 },
        { effect: 'flyInLeft', delay: 300, shapeId: 4 },
        { effect: 'flyInLeft', delay: 450, shapeId: 5 }
      ],
      'process': [
        { effect: 'fadeIn', delay: 0, shapeId: 2 },
        { effect: 'wipeRight', delay: 300, shapeId: 3 },
        { effect: 'fadeIn', delay: 500, shapeId: 4 },
        { effect: 'wipeRight', delay: 700, shapeId: 5 }
      ]
    };

    return presets[slideType] || presets['bullets'];
  }
}

module.exports = AnimationEngine;
