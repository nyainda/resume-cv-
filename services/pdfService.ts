
// This requires `jspdf` to be loaded globally, which is done in index.html
// Fix: Import `FontName` and correct path for types.
import { CVData, PersonalInfo, TemplateName, FontName } from '../types';

declare const jspdf: any;

interface DownloadCVProps {
    cvData: CVData;
    personalInfo: PersonalInfo;
    template: TemplateName;
    font: FontName;
    fileName?: string;
    jobDescription?: string; // For ATS optimization
}

// Helper function to decode HTML entities for PDF rendering
const decodeHtmlEntities = (text: string): string => {
    if (typeof document === 'undefined' || !text) return text;
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
};

// Helper function to strip HTML tags and decode entities for plain-text PDF rendering
const stripHtml = (html: string): string => {
    if (!html) return '';
    if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, '');
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
};

// --- PDF GENERATION LOGIC ---

// A set of helper functions to build PDFs programmatically
const pdfHelpers = (doc: any) => {
    let y = 0;

    const checkPageBreak = (heightNeeded: number, margin: number) => {
        const pageHeight = doc.internal.pageSize.getHeight();
        if (y + heightNeeded > pageHeight - margin) {
            doc.addPage();
            y = margin;
            return true;
        }
        return false;
    };

    const writeText = (text: string | string[], x: number, startY: number, options: any = {}) => {
        const { font = 'Helvetica', style = 'normal', size = 10, color = [0, 0, 0], width = 0, align = 'left', link = '' } = options;
        doc.setFont(font, style);
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);

        const lines = width > 0 ? doc.splitTextToSize(decodeHtmlEntities(text as string), width) : text;

        if (link) {
            doc.textWithLink(lines, x, startY, { url: link, align });
        } else {
            doc.text(lines, x, startY, { align });
        }

        // Calculate height of the text block just written
        // leading factor 1.15 is standard for jsPDF
        const lineHeight = size * 1.15;
        const lineCount = Array.isArray(lines) ? lines.length : (text.toString().match(/\n/g) || []).length + 1;

        return lineCount * lineHeight;
    };

    return {
        y,
        checkPageBreak,
        setY: (newY: number) => { y = newY; },
        getY: () => y,
        writeText,
    };
};

const embedATSData = (doc: any, text: string, pageWidth: number, cvData?: CVData): boolean => {
    if (!text || !text.trim()) return false;

    // ── ATS POWER STRATEGY v2 ─────────────────────────────────────────────────
    // Modern ATS (Greenhouse, Lever, Workday, Taleo, iCIMS, SAP SF) rank by:
    //   1. Exact keyword / phrase match frequency
    //   2. Semantic relevance (skills + job titles cluster)
    //   3. Quantified achievement density
    //   4. Role-to-requirement alignment
    //   5. PDF metadata keyword fields
    // ─────────────────────────────────────────────────────────────────────────

    // --- Helpers ---
    const STOP_WORDS = new Set([
        'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
        'from','as','is','was','are','be','been','being','have','has','had','do',
        'does','did','will','would','should','could','may','might','must','can',
        'this','that','these','those','we','you','they','it','its','our','your',
        'their','i','he','she','not','also','such','more','into','than','about',
        'other','some','which','when','who','all','each','been','were','able',
    ]);

    /** Extract high-value single words (length > 3, not stop words) */
    const extractUnigrams = (src: string): string[] => {
        const freq: Record<string, number> = {};
        src.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).forEach(w => {
            if (w.length > 3 && !STOP_WORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
        });
        return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w]) => w);
    };

    /** Extract 2-word and 3-word phrases — phrase matching scores very highly in ATS */
    const extractPhrases = (src: string): string[] => {
        const tokens = src.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
        const bigramFreq: Record<string, number> = {};
        const trigramFreq: Record<string, number> = {};
        for (let i = 0; i < tokens.length - 1; i++) {
            if (STOP_WORDS.has(tokens[i]) || STOP_WORDS.has(tokens[i + 1])) continue;
            const bi = `${tokens[i]} ${tokens[i + 1]}`;
            bigramFreq[bi] = (bigramFreq[bi] || 0) + 1;
            if (i < tokens.length - 2 && !STOP_WORDS.has(tokens[i + 2])) {
                const tri = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
                trigramFreq[tri] = (trigramFreq[tri] || 0) + 1;
            }
        }
        const bigrams = Object.entries(bigramFreq).filter(([, f]) => f > 1).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([p]) => p);
        const trigrams = Object.entries(trigramFreq).filter(([, f]) => f > 1).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([p]) => p);
        return [...trigrams, ...bigrams];
    };

    /** Total professional experience in years */
    const yearsOfExperience = (): number => {
        if (!cvData?.experience?.length) return 0;
        const totalMonths = cvData.experience.reduce((sum, job) => {
            const start = new Date(job.startDate);
            const end = job.endDate.toLowerCase() === 'present' ? new Date() : new Date(job.endDate);
            return sum + Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
        }, 0);
        return Math.round(totalMonths / 12);
    };

    /** Pull quantified achievements from experience bullets */
    const quantifiedAchievements = (): string[] => {
        if (!cvData?.experience) return [];
        const hits: string[] = [];
        cvData.experience.forEach(job => {
            job.responsibilities.forEach(r => {
                if (/\d+[%$kKmM]?|\$[\d,]+|increased|improved|reduced|grew|achieved|delivered|saved|generated/i.test(r)) {
                    hits.push(r.slice(0, 120));
                }
            });
        });
        return hits.slice(0, 8);
    };

    // --- Build the ATS corpus ---
    const unigrams = extractUnigrams(text);
    const phrases  = extractPhrases(text);
    const achievements = quantifiedAchievements();
    const yoe = yearsOfExperience();

    let atsText = '';

    // Block 1 — Candidate identity (ATS parser anchor)
    atsText += 'CANDIDATE PROFILE. ';
    if (cvData?.summary) atsText += cvData.summary + ' ';

    // Block 2 — Experience signal
    if (yoe > 0) atsText += `${yoe} years of professional experience. `;
    if (cvData?.experience?.length) {
        atsText += 'Professional roles: ' + cvData.experience.map(e => `${e.jobTitle} at ${e.company}`).join('; ') + '. ';
    }

    // Block 3 — Skills (exact-match powerhouse)
    if (cvData?.skills?.length) {
        atsText += 'Core skills and competencies: ' + cvData.skills.join(', ') + '. ';
        // Repeat top skills to increase keyword density
        atsText += 'Key technical skills: ' + (cvData.skills.slice(0, 8).join(', ')) + '. ';
    }

    // Block 4 — Quantified achievements (ATS ranks metrics highly)
    if (achievements.length) {
        atsText += 'Key achievements and results: ' + achievements.join(' ') + ' ';
    }

    // Block 5 — Education
    if (cvData?.education?.length) {
        atsText += 'Education: ' + cvData.education.map(e => `${e.degree} ${e.school} ${e.year}`).join('; ') + '. ';
    }

    // Block 6 — JD phrase matching (highest-value ATS signals)
    if (phrases.length) {
        atsText += 'Relevant expertise: ' + phrases.join(', ') + '. ';
    }

    // Block 7 — JD keyword density layer
    if (unigrams.length) {
        atsText += 'Qualified in: ' + unigrams.join(' ') + '. ';
        // Second pass for density boost (ATS rewards repetition)
        atsText += unigrams.slice(0, 20).join(' ') + '. ';
    }

    // Block 8 — Full job description (allows ATS to score full semantic context)
    atsText += 'POSITION REQUIREMENTS AND RESPONSIBILITIES: ' + text + ' ';

    // Block 9 — Skills × JD cross-match sentence
    if (cvData?.skills?.length && phrases.length) {
        atsText += `Candidate demonstrates strong alignment with ${phrases.slice(0, 5).join(', ')} through proven experience in ${cvData.skills.slice(0, 5).join(', ')}. `;
    }

    // Block 10 — Projects (hidden bonus content)
    if (cvData?.projects?.length) {
        atsText += 'Projects and deliverables: ' + cvData.projects.map(p => `${p.name}: ${p.description}`).join('; ') + '. ';
    }

    // --- Inject PDF keyword metadata (parsers read XMP/DocInfo fields) ---
    const metaKeywords = [
        ...(cvData?.skills?.slice(0, 10) || []),
        ...unigrams.slice(0, 10),
        ...phrases.slice(0, 5),
    ].join(', ');

    try {
        doc.setProperties({
            keywords: metaKeywords,
        });
    } catch { /* ignore if already set */ }

    // --- Render invisible text in the PDF ---
    // White on white: visually invisible, but ATS text-extraction engines read every character.
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(1.5);  // 1.5 pt — below human visibility threshold, above ATS parsing floor

    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 2;
    const usableWidth = pageWidth - margin * 2;

    const lines = doc.splitTextToSize(atsText, usableWidth);

    // Distribute across 4 zones to survive partial-page ATS extraction
    const quarter = Math.ceil(lines.length / 4);
    doc.text(lines.slice(0, quarter), margin, margin + 2);                     // zone A: top
    doc.text(lines.slice(quarter, quarter * 2), margin, pageHeight / 2 - 10); // zone B: mid-top
    doc.text(lines.slice(quarter * 2, quarter * 3), margin, pageHeight / 2);  // zone C: mid-bottom
    doc.text(lines.slice(quarter * 3), margin, pageHeight - margin - 5);      // zone D: bottom

    doc.setTextColor(0, 0, 0);
    return true;
};

const fontMap: Record<FontName, string> = {
    'inter': 'Helvetica',
    'helvetica': 'Helvetica',
    'century-gothic': 'Helvetica',
    'trebuchet': 'Helvetica',
    'lora': 'Times-Roman',
    'times-new-roman': 'Times-Roman',
    'georgia': 'Times-Roman',
    'garamond': 'Times-Roman',
    'palatino': 'Times-Roman',
    'roboto-mono': 'Courier',
};

/**
 * Convert a CSS hex colour (#rrggbb or #rgb) to an [R, G, B] tuple.
 * Returns the fallback tuple unchanged if the hex string is invalid.
 */
function hexToRgb(hex: string, fallback: [number, number, number]): [number, number, number] {
    if (!hex) return fallback;
    const clean = hex.replace('#', '');
    const full = clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const generatePdfForTemplate = (
    template: TemplateName,
    doc: any,
    cvData: CVData,
    personalInfo: PersonalInfo,
    font: FontName
) => {
    const h = pdfHelpers(doc);
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    const contentWidth = pageWidth - 2 * margin;
    const selectedFont = fontMap[font] || 'Helvetica';

    // Resolve user-chosen accent colour for all templates that support it.
    // Falls back to per-template defaults when no custom colour is selected.
    const accentHex = cvData.accentColor ?? null;

    // Common function to draw a section title
    const drawSectionTitle = (title: string, options: any = {}) => {
        const { yPos, xPos = margin, width = contentWidth, font = selectedFont, size = 10, style = 'bold', color = [30, 41, 59], align = 'left', lineColor = [203, 213, 224], lineWidth = 0.5, yMarginBottom = 15, yMarginTop = 15 } = options;
        h.setY(yPos + yMarginTop);
        h.checkPageBreak(size + yMarginBottom, margin);

        h.writeText(title.toUpperCase(), xPos, h.getY(), { font, size, style, color, align, width });
        h.setY(h.getY() + size * 0.5);

        if (lineWidth > 0) {
            doc.setDrawColor(lineColor[0], lineColor[1], lineColor[2]);
            doc.setLineWidth(lineWidth);
            let lineX = xPos;
            if (align === 'center') lineX = (pageWidth / 2) - width / 2;
            if (align === 'right') lineX = xPos - width;
            doc.line(lineX, h.getY(), lineX + width, h.getY());
        }
        h.setY(h.getY() + yMarginBottom);
    };

    const drawSkillsBlock = (skills: string[], yPos: number, width: number = contentWidth, xPos: number = margin, align: 'left' | 'center' | 'right' = 'left', color: number[] = [45, 55, 72]) => {
        if (!skills || skills.length === 0) return 0;

        // Cap at 15 skills for clean 3×5 grid layout
        const capped = skills.slice(0, 15).map(s => decodeHtmlEntities(s).trim()).filter(Boolean);
        const cols = 3;
        const perCol = Math.ceil(capped.length / cols);
        const gutter = 8;
        const colW = (width - (cols - 1) * gutter) / cols;
        const startY = yPos;
        let tallest = 0;

        for (let ci = 0; ci < cols; ci++) {
            const colSkills = capped.slice(ci * perCol, (ci + 1) * perCol);
            const colX = xPos + ci * (colW + gutter);
            let cy = startY;
            colSkills.forEach(skill => {
                const line = `\u2022  ${skill}`;
                const lH = h.writeText(line, colX, cy, {
                    font: selectedFont,
                    size: 9.5,
                    color,
                    width: colW,
                });
                cy += lH + 2;
            });
            tallest = Math.max(tallest, cy - startY);
        }
        return tallest;
    };

    // --- TEMPLATE-SPECIFIC IMPLEMENTATIONS ---

    const drawLanguagesSection = (yPos: number, drawTitle: (title: string, opts: any) => void, opts: any = {}) => {
        if (!cvData.languages || cvData.languages.length === 0) return;
        drawTitle("Languages", { yPos, ...opts.title });
        const langText = cvData.languages.map(l => `${l.name} (${l.proficiency})`).join(' • ');
        const height = h.writeText(langText, margin, h.getY(), { font: selectedFont, size: 10, color: [45, 55, 72], width: contentWidth, ...opts.text });
        h.setY(h.getY() + height + 10);
    };

    const professional = () => {
        h.setY(margin);

        // Compact Header
        doc.setFont(selectedFont, 'bold');
        doc.setFontSize(24);
        doc.setTextColor(15, 23, 42);
        const nameWidth = doc.getTextWidth(personalInfo.name);
        doc.text(personalInfo.name, pageWidth / 2, h.getY(), { align: 'center' });
        h.setY(h.getY() + 20); // Reduced spacing after name

        const contactInfo = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join('  •  ');
        h.writeText(contactInfo, pageWidth / 2, h.getY(), { font: selectedFont, size: 9, color: [71, 85, 105], align: 'center' });
        h.setY(h.getY() + 14);

        const links = [personalInfo.linkedin, personalInfo.website, personalInfo.github].filter(Boolean).join('  •  ');
        if (links) {
            h.writeText(links, pageWidth / 2, h.getY(), { font: selectedFont, size: 9, color: [37, 99, 235], align: 'center' });
            h.setY(h.getY() + 18);
        } else {
            h.setY(h.getY() + 6);
        }

        doc.setDrawColor(203, 213, 224);
        doc.setLineWidth(0.5);
        doc.line(margin, h.getY(), pageWidth - margin, h.getY());

        // Slightly reduced top margin for first section
        drawSectionTitle("Professional Summary", { yPos: h.getY(), font: selectedFont, lineWidth: 0, yMarginTop: 12, yMarginBottom: 8 });
        const summaryHeight = h.writeText(cvData.summary, margin, h.getY(), { font: selectedFont, size: 10, color: [45, 55, 72], width: contentWidth });
        h.setY(h.getY() + summaryHeight + 8);

        drawSectionTitle("Skills", { yPos: h.getY(), font: selectedFont, lineWidth: 1 });
        const skillsHeight = drawSkillsBlock(cvData.skills, h.getY());
        h.setY(h.getY() + skillsHeight + 8);

        drawSectionTitle("Experience", { yPos: h.getY(), font: selectedFont, lineWidth: 1 });
        cvData.experience.forEach(job => {
            h.checkPageBreak(80, margin);
            h.writeText(job.jobTitle, margin, h.getY(), { font: selectedFont, style: 'bold', size: 12, color: [15, 23, 42] });
            h.writeText(job.dates, pageWidth - margin, h.getY(), { font: selectedFont, size: 9, color: [71, 85, 105], align: 'right' });
            h.setY(h.getY() + 14);
            h.writeText(job.company, margin, h.getY(), { font: selectedFont, style: 'bold', size: 11, color: [71, 85, 105] });
            h.setY(h.getY() + 16);
            job.responsibilities.forEach(resp => {
                const bulletPoint = `• ${decodeHtmlEntities(resp)}`;
                const respHeight = h.writeText(bulletPoint, margin + 5, h.getY(), { font: selectedFont, size: 10, color: [45, 55, 72], width: contentWidth - 10 });
                h.checkPageBreak(respHeight + 3, margin);
                h.setY(h.getY() + respHeight + 3);
            });
            h.setY(h.getY() + 15);
        });


        drawLanguagesSection(h.getY(), drawSectionTitle, { title: { font: selectedFont, lineWidth: 1 } });

        drawSectionTitle("Education", { yPos: h.getY(), font: selectedFont, lineWidth: 1 });
        cvData.education.forEach(edu => {
            h.checkPageBreak(50, margin);
            h.writeText(edu.degree, margin, h.getY(), { font: selectedFont, style: 'bold', size: 12, color: [15, 23, 42] });
            h.writeText(edu.year, pageWidth - margin, h.getY(), { font: selectedFont, size: 9, color: [71, 85, 105], align: 'right' });
            h.setY(h.getY() + 14);
            h.writeText(edu.school, margin, h.getY(), { font: selectedFont, size: 11, color: [71, 85, 105] });
            h.setY(h.getY() + 14);
            if (edu.description) {
                const descHeight = h.writeText(edu.description, margin, h.getY(), { font: selectedFont, style: 'italic', size: 9, color: [71, 85, 105], width: contentWidth });
                h.setY(h.getY() + descHeight + 5);
            }
            h.setY(h.getY() + 15);
        });

        // Projects & Publications
        if (cvData.publications && cvData.publications.length > 0) {
            drawSectionTitle("Publications", { yPos: h.getY(), font: selectedFont, lineWidth: 1 });
            cvData.publications.forEach(pub => {
                h.checkPageBreak(50, margin);
                h.writeText(pub.title, margin, h.getY(), { font: selectedFont, style: 'bold', size: 11, color: [15, 23, 42], width: contentWidth });
                h.setY(h.getY() + 14);
                h.writeText(pub.authors.join(', '), margin, h.getY(), { font: selectedFont, size: 9, color: [45, 55, 72], width: contentWidth });
                h.setY(h.getY() + 12);
                h.writeText(`${pub.journal}, ${pub.year}`, margin, h.getY(), { font: selectedFont, style: 'italic', size: 9, color: [71, 85, 105] });
                h.setY(h.getY() + 18);
            });
        }

        if (cvData.projects && cvData.projects.length > 0) {
            drawSectionTitle("Projects", { yPos: h.getY(), font: selectedFont, lineWidth: 1 });
            cvData.projects.forEach(proj => {
                h.checkPageBreak(45, margin);
                h.writeText(proj.name, margin, h.getY(), { font: selectedFont, style: 'bold', size: 11, color: [15, 23, 42] });
                if (proj.link) {
                    const linkWidth = doc.getTextWidth(proj.name);
                    h.writeText('[Link]', margin + linkWidth + 10, h.getY(), { font: selectedFont, size: 9, color: [37, 99, 235], link: proj.link });
                }
                h.setY(h.getY() + 14);
                const descHeight = h.writeText(proj.description, margin, h.getY(), { font: selectedFont, size: 10, width: contentWidth, color: [45, 55, 72] });
                h.setY(h.getY() + descHeight + 15);
            });
        }
    };

    const twoColumn = (sidebarColor: [number, number, number], mainColor: [number, number, number]) => {
        const sidebarWidth = pageWidth * 0.33;
        const mainContentX = sidebarWidth + margin / 2;
        const mainContentWidth = pageWidth - sidebarWidth - margin;

        const drawSidebar = (startY: number) => {
            doc.setFillColor(sidebarColor[0], sidebarColor[1], sidebarColor[2]);
            doc.rect(0, 0, sidebarWidth, pageHeight, 'F');
            h.setY(startY);

            // Add circular profile photo if available
            if (personalInfo.photo) {
                try {
                    const photoSize = 70; // Diameter of circular photo
                    const photoX = (sidebarWidth - photoSize) / 2;
                    const photoY = h.getY();

                    // Draw white circle background
                    doc.setFillColor(255, 255, 255);
                    doc.circle(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2, 'F');

                    // Add photo as circular image
                    doc.saveGraphicsState();
                    doc.circle(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2, 'S');
                    doc.clip();
                    doc.addImage(personalInfo.photo, 'JPEG', photoX, photoY, photoSize, photoSize);
                    doc.restoreGraphicsState();

                    h.setY(photoY + photoSize + 15);
                } catch (error) {
                    // If photo fails to load, continue without it
                    console.error('Failed to add photo to PDF:', error);
                }
            }

            const nameHeight = h.writeText(personalInfo.name, sidebarWidth / 2, h.getY(), { font: selectedFont, size: personalInfo.photo ? 16 : 20, style: 'bold', color: [255, 255, 255], width: sidebarWidth - margin, align: 'center' });
            h.setY(h.getY() + nameHeight + (personalInfo.photo ? 15 : 20));

            const drawSidebarSection = (title: string, contentRenderer: () => number) => {
                if (h.getY() > pageHeight - 50) return;
                h.setY(h.getY() + 12);
                h.writeText(title.toUpperCase(), margin / 2, h.getY(), { font: selectedFont, size: 9, style: 'bold', color: [220, 220, 220], width: sidebarWidth - margin });
                h.setY(h.getY() + 4);
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.5);
                doc.line(margin / 2, h.getY(), sidebarWidth - margin / 2, h.getY());
                h.setY(h.getY() + 8);

                const height = contentRenderer();
                h.setY(h.getY() + height);
            };

            const contactItems = [personalInfo.email, personalInfo.phone, personalInfo.location, personalInfo.linkedin, personalInfo.website, personalInfo.github].filter(Boolean) as string[];

            drawSidebarSection("Contact", () => {
                let totalH = 0;
                contactItems.forEach(item => {
                    const itemHeight = h.writeText(item, margin / 2, h.getY() + totalH, { font: selectedFont, size: 8, color: [255, 255, 255], width: sidebarWidth - margin });
                    totalH += itemHeight + 3;
                });
                return totalH;
            });

            // Use Skills Block for compact sidebar — cap at 15
            drawSidebarSection("Skills", () => {
                let totalH = 0;
                cvData.skills.slice(0, 15).forEach(skill => {
                    const sH = h.writeText(`• ${skill}`, margin / 2, h.getY() + totalH, { font: selectedFont, size: 8, color: [255, 255, 255], width: sidebarWidth - margin });
                    totalH += sH + 2;
                });
                return totalH;
            });

            drawSidebarSection("Languages", () => {
                return h.writeText(cvData.languages?.map(l => `${l.name}: ${l.proficiency}`).join('\n') || '', margin / 2, h.getY(), { font: selectedFont, size: 8, color: [255, 255, 255], width: sidebarWidth - margin });
            });

            drawSidebarSection("Education", () => {
                let totalH = 0;
                cvData.education.forEach(e => {
                    totalH += h.writeText(`${e.degree}`, margin / 2, h.getY() + totalH, { font: selectedFont, size: 9, style: 'bold', color: [255, 255, 255], width: sidebarWidth - margin });
                    totalH += 3;
                    totalH += h.writeText(`${e.school}, ${e.year}`, margin / 2, h.getY() + totalH, { font: selectedFont, size: 7, color: [220, 220, 220], width: sidebarWidth - margin });
                    totalH += 8;
                });
                return totalH;
            });
        };

        let mainY = margin;
        const checkMainPageBreak = (heightNeeded: number) => {
            if (mainY + heightNeeded > pageHeight - margin) {
                doc.addPage();
                drawSidebar(margin);
                mainY = margin;
            }
        };

        drawSidebar(margin + 20);

        const drawMainSectionTitle = (title: string) => {
            checkMainPageBreak(30);
            h.writeText(title.toUpperCase(), mainContentX, mainY, { font: selectedFont, size: 12, style: 'bold', color: mainColor });
            mainY += 6;
            doc.setDrawColor(mainColor[0], mainColor[1], mainColor[2]);
            doc.setLineWidth(1);
            doc.line(mainContentX, mainY, pageWidth - margin / 2, mainY);
            mainY += 18;
        };

        drawMainSectionTitle("Professional Summary");
        const summaryHeight = h.writeText(cvData.summary, mainContentX, mainY, { font: selectedFont, size: 10, width: mainContentWidth, color: [45, 55, 72] });
        mainY += summaryHeight + 20;

        drawMainSectionTitle("Experience");
        cvData.experience.forEach(job => {
            checkMainPageBreak(70);
            h.writeText(job.jobTitle, mainContentX, mainY, { font: selectedFont, size: 11, style: 'bold', color: [30, 41, 59] });
            h.writeText(job.dates, pageWidth - margin / 2, mainY, { font: selectedFont, size: 9, color: [100, 116, 139], align: 'right' });
            mainY += 14;
            h.writeText(job.company, mainContentX, mainY, { font: selectedFont, size: 10, style: 'bold', color: [45, 55, 72] });
            mainY += 12;
            job.responsibilities.forEach(resp => {
                const bulletPoint = `• ${decodeHtmlEntities(resp)}`;
                const respHeight = h.writeText(bulletPoint, mainContentX + 5, mainY, { font: selectedFont, size: 10, width: mainContentWidth - 10, color: [45, 55, 72] });
                checkMainPageBreak(respHeight + 3);
                mainY += respHeight + 3;
            });
            mainY += 20;
        });

        if (cvData.projects && cvData.projects.length > 0) {
            drawMainSectionTitle("Projects");
            cvData.projects.forEach(proj => {
                checkMainPageBreak(50);
                h.writeText(proj.name, mainContentX, mainY, { font: selectedFont, size: 11, style: 'bold', color: [30, 41, 59] });
                if (proj.link) {
                    const linkWidth = doc.getTextWidth(proj.name);
                    h.writeText('[Link]', mainContentX + linkWidth + 5, mainY, { font: selectedFont, size: 9, color: [37, 99, 235], link: proj.link });
                }
                mainY += 14;
                const descHeight = h.writeText(proj.description, mainContentX, mainY, { font: selectedFont, size: 10, width: mainContentWidth, color: [45, 55, 72] });
                mainY += descHeight + 15;
            });
        }

        if (cvData.publications && cvData.publications.length > 0) {
            drawMainSectionTitle("Publications");
            cvData.publications.forEach(pub => {
                checkMainPageBreak(50);
                h.writeText(pub.title, mainContentX, mainY, { font: selectedFont, style: 'bold', size: 10, color: [30, 41, 59], width: mainContentWidth });
                mainY += 12;
                h.writeText(pub.authors.join(', '), mainContentX, mainY, { font: selectedFont, size: 9, color: [45, 55, 72], width: mainContentWidth });
                mainY += 12;
                h.writeText(`${pub.journal}, ${pub.year}`, mainContentX, mainY, { font: selectedFont, style: 'italic', size: 9, color: [71, 85, 105] });
                mainY += 18;
            });
        }
    };

    const minimalist = () => {
        h.setY(margin);

        // Photo for Minimalist (Top Right)
        if (personalInfo.photo) {
            try {
                const photoSize = 60;
                const photoX = pageWidth - margin - photoSize;
                const photoY = margin;

                doc.setDrawColor(241, 245, 249);
                doc.setFillColor(255, 255, 255);
                doc.circle(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2, 'FD');

                doc.saveGraphicsState();
                doc.circle(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2, 'S');
                doc.clip();
                doc.addImage(personalInfo.photo, 'JPEG', photoX, photoY, photoSize, photoSize);
                doc.restoreGraphicsState();
            } catch (e) { console.error(e); }
        }

        // Minimalist Header
        doc.setFont(selectedFont, 'bold');
        doc.setFontSize(28);
        doc.setTextColor(15, 23, 42);
        h.writeText(personalInfo.name, margin, h.getY(), { width: personalInfo.photo ? contentWidth - 80 : contentWidth });
        h.setY(h.getY() + 28);

        const contactInfo = [personalInfo.email, personalInfo.phone, personalInfo.location, personalInfo.linkedin].filter(Boolean).join('  ·  ');
        h.writeText(contactInfo, margin, h.getY(), { font: selectedFont, size: 9, color: [71, 85, 105] });
        h.setY(h.getY() + 20);

        const drawMinSection = (title: string) => drawSectionTitle(title, { yPos: h.getY(), xPos: margin, size: 10, style: 'bold', color: [100, 116, 139], yMarginBottom: 10, yMarginTop: 10, lineWidth: 0.5, lineColor: [226, 232, 240], font: selectedFont });

        drawMinSection("Profile");
        const summaryHeight = h.writeText(cvData.summary, margin, h.getY(), { font: selectedFont, size: 10, width: contentWidth, color: [45, 55, 72] });
        h.setY(h.getY() + summaryHeight + 12);

        drawMinSection("Experience");
        const dateWidth = 70;
        const expContentWidth = contentWidth - dateWidth - 10;
        cvData.experience.forEach(job => {
            h.checkPageBreak(60, margin);
            const startExpY = h.getY();
            h.writeText(job.dates, margin, startExpY, { font: selectedFont, size: 9, style: 'bold', color: [45, 55, 72], width: dateWidth });

            let expY = startExpY;
            expY += h.writeText(job.jobTitle, margin + dateWidth + 10, expY, { font: selectedFont, size: 10, style: 'bold', color: [30, 41, 59] });
            expY += h.writeText(job.company, margin + dateWidth + 10, expY, { font: selectedFont, size: 9, color: [71, 85, 105] });
            expY += 4;
            let totalRespHeight = 0;
            job.responsibilities.forEach(resp => {
                const bulletPoint = `• ${decodeHtmlEntities(resp)}`;
                const respHeight = h.writeText(bulletPoint, margin + dateWidth + 10, expY + totalRespHeight, { font: selectedFont, size: 10, width: expContentWidth, color: [45, 55, 72] });
                totalRespHeight += respHeight + 3;
            });
            h.setY(Math.max(startExpY + 10, expY + totalRespHeight + 12));
        });

        if (cvData.education && cvData.education.length > 0) {
            drawMinSection("Education");
            cvData.education.forEach(edu => {
                h.checkPageBreak(40, margin);
                const startEduY = h.getY();
                h.writeText(edu.year, margin, startEduY, { font: selectedFont, size: 9, style: 'bold', color: [45, 55, 72], width: dateWidth });

                let eduY = startEduY;
                eduY += h.writeText(edu.degree, margin + dateWidth + 10, eduY, { font: selectedFont, size: 10, style: 'bold', color: [30, 41, 59] });
                eduY += h.writeText(edu.school, margin + dateWidth + 10, eduY, { font: selectedFont, size: 9, color: [71, 85, 105] });
                h.setY(Math.max(startEduY + 10, eduY + 10));
            });
        }

        // Skills Block
        drawMinSection("Skills");
        const skillsHeight = drawSkillsBlock(cvData.skills, h.getY(), contentWidth, margin);
        h.setY(h.getY() + skillsHeight + 15);

        if (cvData.languages && cvData.languages.length > 0) {
            drawMinSection("Languages");
            const langText = cvData.languages.map(l => `${l.name} (${l.proficiency})`).join(' • ');
            const langHeight = h.writeText(langText, margin, h.getY(), { font: selectedFont, size: 10, color: [45, 55, 72], width: contentWidth });
            h.setY(h.getY() + langHeight + 15);
        }

        if (cvData.projects && cvData.projects.length > 0) {
            drawMinSection("Projects");
            cvData.projects.forEach(proj => {
                h.checkPageBreak(40, margin);
                const startProjY = h.getY();
                let projY = startProjY;

                projY += h.writeText(proj.name, margin + dateWidth + 10, projY, { font: selectedFont, size: 10, style: 'bold', color: [30, 41, 59] });
                if (proj.link) {
                    const linkWidth = doc.getTextWidth(proj.name);
                    h.writeText('[Link]', margin + dateWidth + 10 + linkWidth + 5, startProjY, { font: selectedFont, size: 8, color: [37, 99, 235], link: proj.link });
                }

                const descHeight = h.writeText(proj.description, margin + dateWidth + 10, projY, { font: selectedFont, size: 9, width: expContentWidth, color: [45, 55, 72] });
                h.setY(projY + descHeight + 12);
            });
        }

        if (cvData.publications && cvData.publications.length > 0) {
            drawMinSection("Publications");
            cvData.publications.forEach(pub => {
                h.checkPageBreak(40, margin);
                const startPubY = h.getY();
                h.writeText(pub.year, margin, startPubY, { font: selectedFont, size: 9, style: 'bold', color: [45, 55, 72], width: dateWidth });

                let pubY = startPubY;
                pubY += h.writeText(pub.title, margin + dateWidth + 10, pubY, { font: selectedFont, size: 10, style: 'bold', color: [30, 41, 59] });
                pubY += h.writeText(pub.journal, margin + dateWidth + 10, pubY, { font: selectedFont, size: 9, style: 'italic', color: [71, 85, 105] });
                h.setY(Math.max(startPubY + 10, pubY + 10));
            });
        }
    };

    const softwareEngineerPdf = () => {
        const localMargin = 50;
        const localContentWidth = pageWidth - 2 * localMargin;
        h.setY(localMargin);
        const mainFont = selectedFont;
        const monoFont = fontMap['roboto-mono'];
        const skillsFont = mainFont === monoFont ? mainFont : monoFont;


        // Header
        doc.setFont(mainFont, 'bold');
        h.writeText(personalInfo.name, pageWidth / 2, h.getY(), { font: mainFont, size: 30, align: 'center' });
        h.setY(h.getY() + 25);

        doc.setFont(mainFont, 'normal');
        const contactInfo = [personalInfo.location, personalInfo.phone, personalInfo.email].filter(Boolean).join('  |  ');
        h.writeText(contactInfo, pageWidth / 2, h.getY(), { font: mainFont, size: 9, align: 'center', color: [100, 116, 139] });
        h.setY(h.getY() + 12);

        const linksInfo = [personalInfo.linkedin, personalInfo.github, personalInfo.website].filter(Boolean);
        if (linksInfo.length > 0) {
            const linksString = linksInfo.join('  |  ');
            h.writeText(linksString, pageWidth / 2, h.getY(), { font: mainFont, size: 9, color: [37, 99, 235], align: 'center' });
        }
        h.setY(h.getY() + 25);

        const drawSESectionTitle = (title: string) => {
            h.checkPageBreak(40, localMargin);
            h.writeText(title.toUpperCase(), localMargin, h.getY(), { font: mainFont, size: 10, style: 'bold', color: [51, 65, 85] });
            h.setY(h.getY() + 6);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(1.5);
            doc.line(localMargin, h.getY(), pageWidth - localMargin, h.getY());
            h.setY(h.getY() + 15);
        };

        drawSESectionTitle("Summary");
        const summaryHeight = h.writeText(cvData.summary, localMargin, h.getY(), { font: mainFont, size: 10, width: localContentWidth, color: [30, 41, 59] });
        h.setY(h.getY() + summaryHeight + 12);

        drawSESectionTitle("Skills");
        doc.setFont(skillsFont, 'normal');
        doc.setFontSize(9);
        const skillPaddingX = 8;
        const skillPaddingY = 4;
        const skillMargin = 8;
        const skillHeight = 12 + skillPaddingY;
        let x = localMargin;
        let y = h.getY();

        cvData.skills.slice(0, 15).forEach(skill => {
            const skillWidth = doc.getTextWidth(skill);
            const tagWidth = skillWidth + 2 * skillPaddingX;

            if (x + tagWidth > pageWidth - localMargin) {
                x = localMargin;
                y += skillHeight + skillMargin;
            }
            doc.setFillColor(241, 245, 249); // slate-100
            doc.roundedRect(x, y - 10, tagWidth, skillHeight, 3, 3, 'F');
            doc.setTextColor(30, 41, 59);
            doc.text(skill, x + skillPaddingX, y);
            x += tagWidth + skillMargin;
        });
        h.setY(y + skillHeight + 15);

        drawSESectionTitle("Experience");
        cvData.experience.forEach(job => {
            h.checkPageBreak(70, localMargin);
            h.writeText(job.jobTitle, localMargin, h.getY(), { font: mainFont, size: 12, style: 'bold', color: [15, 23, 42] });
            h.writeText(job.dates, pageWidth - localMargin, h.getY(), { font: mainFont, size: 9, color: [100, 116, 139], align: 'right' });
            h.setY(h.getY() + 14);
            h.writeText(job.company, localMargin, h.getY(), { font: mainFont, size: 10, style: 'bold', color: [71, 85, 105] });
            h.setY(h.getY() + 12);
            job.responsibilities.forEach(resp => {
                const bulletPoint = `• ${decodeHtmlEntities(resp)}`;
                const respHeight = h.writeText(bulletPoint, localMargin + 10, h.getY(), { font: mainFont, size: 10, width: localContentWidth - 10, color: [51, 65, 85] });
                h.checkPageBreak(respHeight + 3, localMargin);
                h.setY(h.getY() + respHeight + 3);
            });
            h.setY(h.getY() + 15);
        });

        if (cvData.projects && cvData.projects.length > 0) {
            drawSESectionTitle("Projects");
            cvData.projects.forEach(proj => {
                h.checkPageBreak(40, localMargin);
                const startProjY = h.getY();
                h.writeText(proj.name, localMargin, startProjY, { font: mainFont, size: 11, style: 'bold' });
                const nameWidth = doc.getTextWidth(proj.name);
                if (proj.link) {
                    h.writeText('[Link]', localMargin + nameWidth + 5, startProjY, { font: mainFont, size: 9, color: [37, 99, 235], link: proj.link });
                }
                h.setY(startProjY + 14);
                const descHeight = h.writeText(proj.description, localMargin, h.getY(), { font: mainFont, size: 10, width: localContentWidth, color: [51, 65, 85] });
                h.setY(h.getY() + descHeight + 15);
            });
        }

        if (cvData.education && cvData.education.length > 0) {
            drawSESectionTitle("Education");
            cvData.education.forEach(edu => {
                h.checkPageBreak(40, localMargin);
                h.writeText(edu.degree, localMargin, h.getY(), { font: mainFont, size: 11, style: 'bold', color: [15, 23, 42] });
                h.writeText(edu.year, pageWidth - localMargin, h.getY(), { font: mainFont, size: 9, color: [100, 116, 139], align: 'right' });
                h.setY(h.getY() + 14);
                h.writeText(edu.school, localMargin, h.getY(), { font: mainFont, size: 10, color: [71, 85, 105] });
                h.setY(h.getY() + 18);
            });
        }
    };


    const classic = () => {
        h.setY(margin);

        // Photo for Classic (Centered Top)
        if (personalInfo.photo) {
            try {
                const photoSize = 70;
                const photoX = (pageWidth - photoSize) / 2;

                doc.setDrawColor(226, 232, 240);
                doc.setFillColor(255, 255, 255);
                doc.circle(photoX + photoSize / 2, h.getY() + photoSize / 2, photoSize / 2, 'FD');

                doc.saveGraphicsState();
                doc.circle(photoX + photoSize / 2, h.getY() + photoSize / 2, photoSize / 2, 'S');
                doc.clip();
                doc.addImage(personalInfo.photo, 'JPEG', photoX, h.getY(), photoSize, photoSize);
                doc.restoreGraphicsState();

                h.setY(h.getY() + photoSize + 15);
            } catch (e) { console.error(e); }
        }

        h.writeText(personalInfo.name, pageWidth / 2, h.getY(), { font: selectedFont, style: 'bold', size: 32, align: 'center' });
        h.setY(h.getY() + 20);

        doc.setLineWidth(0.5);
        doc.setDrawColor(0, 0, 0); // Black separator
        doc.line(pageWidth / 2 - 30, h.getY(), pageWidth / 2 + 30, h.getY());
        h.setY(h.getY() + 15);

        const contactInfo = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join(' • ');
        h.writeText(contactInfo, pageWidth / 2, h.getY(), { font: selectedFont, size: 9, align: 'center' });
        h.setY(h.getY() + 12);

        const links = [personalInfo.linkedin, personalInfo.website].filter(Boolean).join(' • ');
        if (links) {
            h.writeText(links, pageWidth / 2, h.getY(), { font: selectedFont, size: 9, align: 'center', color: [30, 64, 175] });
            h.setY(h.getY() + 20);
        } else {
            h.setY(h.getY() + 8);
        }

        const drawClassicSection = (title: string) => drawSectionTitle(title, { yPos: h.getY(), font: selectedFont, align: 'center', lineWidth: 0.5, lineColor: [200, 200, 200], width: contentWidth, yMarginTop: 15, yMarginBottom: 15, size: 12 });

        drawClassicSection("Summary");
        const summaryHeight = h.writeText(cvData.summary, pageWidth / 2, h.getY(), { font: selectedFont, width: contentWidth, align: 'center', size: 10 });
        h.setY(h.getY() + summaryHeight + 15);

        // Add Skills for Classic
        if (cvData.skills && cvData.skills.length > 0) {
            drawClassicSection("Skills");
            // Use Left alignment for classic skills to match Professional arrangement per user request
            const skillsH = drawSkillsBlock(cvData.skills, h.getY(), contentWidth, margin, 'left', [45, 55, 72]);
            h.setY(h.getY() + skillsH + 15);
        }

        drawClassicSection("Experience");
        cvData.experience.forEach(job => {
            h.checkPageBreak(70, margin);
            h.writeText(job.jobTitle, margin, h.getY(), { font: selectedFont, style: 'bold', size: 11 });
            h.writeText(job.dates, pageWidth - margin, h.getY(), { font: selectedFont, size: 9, align: 'right' });
            h.setY(h.getY() + 12);
            h.writeText(job.company, margin, h.getY(), { font: selectedFont, style: 'italic', size: 10 });
            h.setY(h.getY() + 12);
            job.responsibilities.forEach(resp => {
                const bulletPoint = `• ${decodeHtmlEntities(resp)}`;
                const respHeight = h.writeText(bulletPoint, margin + 10, h.getY(), { font: selectedFont, size: 10, width: contentWidth - 10 });
                h.checkPageBreak(respHeight + 3, margin);
                h.setY(h.getY() + respHeight + 3);
            });
            h.setY(h.getY() + 15);
        });

        if (cvData.education && cvData.education.length > 0) {
            drawClassicSection("Education");
            cvData.education.forEach(edu => {
                h.checkPageBreak(40, margin);
                h.writeText(edu.school, pageWidth / 2, h.getY(), { font: selectedFont, style: 'bold', size: 10, align: 'center' });
                h.setY(h.getY() + 12);
                h.writeText(`${edu.degree}, ${edu.year}`, pageWidth / 2, h.getY(), { font: selectedFont, size: 10, align: 'center' });
                h.setY(h.getY() + 15);
            });
        }

        // Skills Block for Classic
        drawClassicSection("Skills");
        const skillsHeight = drawSkillsBlock(cvData.skills, h.getY(), contentWidth, margin, 'center');
        h.setY(h.getY() + skillsHeight + 15);
    };

    const standardProPdf = () => {
        // ── Harvard / Standard Professional Layout ──────────────────────────
        const serifFont = 'Times-Roman';
        const M = margin;               // left margin (40pt)
        const R = pageWidth - M;        // right edge
        const CW = pageWidth - 2 * M;  // content width

        h.setY(M);

        // ── NAME ─────────────────────────────────────────────────────────────
        h.writeText(
            personalInfo.name.toUpperCase(),
            pageWidth / 2,
            h.getY(),
            { font: serifFont, style: 'bold', size: 24, align: 'center', color: [10, 10, 10] }
        );
        h.setY(h.getY() + 30);

        // ── CONTACT LINE (no dangling pipes) ─────────────────────────────────
        const contactParts = [
            personalInfo.location,
            personalInfo.phone,
            personalInfo.email,
            personalInfo.linkedin,
            personalInfo.website,
            personalInfo.github,
        ].filter(v => v && v.trim().length > 0);

        const contactLine = contactParts.join('   |   ');
        h.writeText(contactLine, pageWidth / 2, h.getY(), {
            font: serifFont,
            size: 9,
            align: 'center',
            color: [50, 50, 50],
            width: CW,
        });
        h.setY(h.getY() + 14);

        // ── THICK RULE ────────────────────────────────────────────────────────
        doc.setLineWidth(1.5);
        doc.setDrawColor(20, 20, 20);
        doc.line(M, h.getY(), R, h.getY());
        h.setY(h.getY() + 4);
        doc.setLineWidth(0.4);
        doc.line(M, h.getY(), R, h.getY());
        h.setY(h.getY() + 18);

        // ── SECTION HEADER helper ────────────────────────────────────────────
        // (defined early so it can be used for the summary section too)
        const drawSectionHeader = (title: string) => {
            h.checkPageBreak(35, M);
            h.writeText(title.toUpperCase(), M, h.getY(), {
                font: serifFont,
                style: 'bold',
                size: 11,
                color: [10, 10, 10],
            });
            h.setY(h.getY() + 5);
            doc.setLineWidth(0.8);
            doc.setDrawColor(20, 20, 20);
            doc.line(M, h.getY(), R, h.getY());
            h.setY(h.getY() + 12);
        };

        // ── PROFESSIONAL SUMMARY ─────────────────────────────────────────────
        drawSectionHeader('Professional Summary');
        const summaryH = h.writeText(stripHtml(cvData.summary), M, h.getY(), {
            font: serifFont,
            style: 'italic',
            size: 10.5,
            color: [40, 40, 40],
            width: CW,
            align: 'left',
        });
        h.setY(h.getY() + summaryH + 20);


        // ── WORK EXPERIENCE ───────────────────────────────────────────────────
        drawSectionHeader('Work Experience');
        cvData.experience.forEach(job => {
            h.checkPageBreak(65, M);

            // Company name (bold, uppercase) + dates right-aligned on same line
            h.writeText(job.company.toUpperCase(), M, h.getY(), {
                font: serifFont,
                style: 'bold',
                size: 10.5,
                color: [10, 10, 10],
            });
            h.writeText(job.dates, R, h.getY(), {
                font: serifFont,
                style: 'italic',
                size: 9.5,
                align: 'right',
                color: [60, 60, 60],
            });
            h.setY(h.getY() + 13);

            // Job title (italic, indented slightly)
            h.writeText(job.jobTitle, M + 2, h.getY(), {
                font: serifFont,
                style: 'italic',
                size: 10,
                color: [40, 40, 40],
            });
            h.setY(h.getY() + 13);

            // Bullet points
            job.responsibilities.forEach(resp => {
                const bullet = `\u2022  ${decodeHtmlEntities(resp)}`;
                const rH = h.writeText(bullet, M + 10, h.getY(), {
                    font: serifFont,
                    size: 9.5,
                    color: [30, 30, 30],
                    width: CW - 10,
                });
                h.checkPageBreak(rH + 3, M);
                h.setY(h.getY() + rH + 3);
            });
            h.setY(h.getY() + 14);
        });

        // ── EDUCATION ─────────────────────────────────────────────────────────
        drawSectionHeader('Education');
        cvData.education.forEach(edu => {
            h.checkPageBreak(42, M);
            h.writeText(edu.school.toUpperCase(), M, h.getY(), {
                font: serifFont,
                style: 'bold',
                size: 10.5,
                color: [10, 10, 10],
            });
            h.writeText(edu.year, R, h.getY(), {
                font: serifFont,
                size: 9.5,
                align: 'right',
                color: [60, 60, 60],
            });
            h.setY(h.getY() + 13);
            h.writeText(edu.degree, M + 2, h.getY(), {
                font: serifFont,
                style: 'italic',
                size: 10,
                color: [40, 40, 40],
            });
            h.setY(h.getY() + 13);
            if (edu.description && edu.description.trim()) {
                const descH = h.writeText(stripHtml(edu.description), M + 2, h.getY(), {
                    font: serifFont,
                    size: 9.5,
                    color: [80, 80, 80],
                    width: CW - 2,
                });
                h.setY(h.getY() + descH + 10);
            } else {
                h.setY(h.getY() + 10);
            }
        });

        // ── SKILLS ───────────────────────────────────────────────────────────
        drawSectionHeader('Skills & Competencies');
        // ── 3-column bullet list (matching the on-screen preview) ────────────
        const skillCols = 3;
        const skillsPerCol = Math.ceil(cvData.skills.slice(0, 15).length / skillCols);
        const colWidth = (CW - (skillCols - 1) * 10) / skillCols; // 10pt gutter between cols
        const colStartY = h.getY();
        let tallestColH = 0;

        const cappedSkills = cvData.skills.slice(0, 15);
        for (let ci = 0; ci < skillCols; ci++) {
            const colSkills = cappedSkills.slice(ci * skillsPerCol, (ci + 1) * skillsPerCol);
            const colX = M + ci * (colWidth + 10);
            let colY = colStartY;
            colSkills.forEach(skill => {
                const line = `\u2022  ${skill}`;
                const lH = h.writeText(line, colX, colY, {
                    font: serifFont,
                    size: 10,
                    color: [20, 20, 20],
                    width: colWidth,
                });
                colY += lH + 2;
            });
            tallestColH = Math.max(tallestColH, colY - colStartY);
        }
        h.setY(colStartY + tallestColH + 14);


        // ── LANGUAGES ────────────────────────────────────────────────────────
        if (cvData.languages && cvData.languages.length > 0) {
            drawSectionHeader('Languages');
            const langText = cvData.languages.map(l => `${l.name} (${l.proficiency})`).join('   \u2022   ');
            const lH = h.writeText(langText, M, h.getY(), {
                font: serifFont,
                size: 10,
                color: [30, 30, 30],
                width: CW,
            });
            h.setY(h.getY() + lH + 18);
        }

        // ── PROJECTS ─────────────────────────────────────────────────────────
        if (cvData.projects && cvData.projects.length > 0) {
            drawSectionHeader('Projects & Research');
            cvData.projects.forEach(proj => {
                h.checkPageBreak(45, M);
                h.writeText(proj.name, M, h.getY(), {
                    font: serifFont,
                    style: 'bold',
                    size: 10.5,
                    color: [10, 10, 10],
                });
                if (proj.link) {
                    h.writeText('[Link]', R, h.getY(), {
                        font: serifFont,
                        size: 8.5,
                        align: 'right',
                        link: proj.link,
                        color: [30, 64, 175],
                    });
                }
                h.setY(h.getY() + 13);
                const pdH = h.writeText(stripHtml(proj.description), M + 2, h.getY(), {
                    font: serifFont,
                    size: 10,
                    color: [40, 40, 40],
                    width: CW - 2,
                });
                h.setY(h.getY() + pdH + 14);
            });
        }

        // ── PUBLICATIONS ──────────────────────────────────────────────────────
        if (cvData.publications && cvData.publications.length > 0) {
            drawSectionHeader('Publications');
            cvData.publications.forEach(pub => {
                h.checkPageBreak(45, M);
                h.writeText(pub.title, M, h.getY(), {
                    font: serifFont,
                    style: 'bold',
                    size: 10.5,
                    color: [10, 10, 10],
                    width: CW,
                });
                h.setY(h.getY() + 12);
                h.writeText(
                    `${pub.authors.join(', ')}. ${pub.journal}, ${pub.year}.`,
                    M + 2,
                    h.getY(),
                    { font: serifFont, style: 'italic', size: 9.5, color: [60, 60, 60], width: CW - 2 }
                );
                h.setY(h.getY() + 16);
            });
        }

        // ── REFERENCES ────────────────────────────────────────────────────────
        if (cvData.references && cvData.references.length > 0) {
            drawSectionHeader('References');
            const refColWidth = (CW - 16) / 2;
            let refColY = h.getY();
            let leftColMaxY = refColY;
            cvData.references.forEach((ref, idx) => {
                h.checkPageBreak(55, M);
                const colX = idx % 2 === 0 ? M : M + refColWidth + 16;
                if (idx % 2 === 0) {
                    refColY = Math.max(leftColMaxY, h.getY());
                    leftColMaxY = refColY;
                }
                let rowY = refColY;
                doc.setFont(serifFont, 'bold');
                doc.setFontSize(10.5);
                doc.setTextColor(10, 10, 10);
                doc.text(ref.name, colX, rowY);
                rowY += 13;
                if (ref.title || ref.company) {
                    const sub = [ref.title, ref.company].filter(Boolean).join(', ');
                    doc.setFont(serifFont, 'italic');
                    doc.setFontSize(9.5);
                    doc.setTextColor(60, 60, 60);
                    const subLines = doc.splitTextToSize(sub, refColWidth);
                    doc.text(subLines, colX, rowY);
                    rowY += subLines.length * 11;
                }
                if (ref.email) {
                    doc.setFont(serifFont, 'normal');
                    doc.setFontSize(9);
                    doc.setTextColor(30, 64, 175);
                    doc.text(ref.email, colX, rowY);
                    rowY += 11;
                }
                if (ref.phone) {
                    doc.setFont(serifFont, 'normal');
                    doc.setFontSize(9);
                    doc.setTextColor(30, 30, 30);
                    doc.text(ref.phone, colX, rowY);
                    rowY += 11;
                }
                if (idx % 2 === 0) {
                    leftColMaxY = rowY + 8;
                } else {
                    h.setY(Math.max(leftColMaxY, rowY + 8));
                    leftColMaxY = h.getY();
                }
            });
            if (cvData.references.length % 2 !== 0) {
                h.setY(leftColMaxY);
            }
        }
    };

    // ─── HARVARD GOLD PDF ────────────────────────────────────────────────────────
    const harvardGoldPdf = () => {
        const gold: [number, number, number] = [180, 83, 9];
        const dark: [number, number, number] = [15, 23, 42];
        const serif = 'Times-Roman';

        h.setY(margin + 20);

        // Header
        h.writeText(personalInfo.name.toUpperCase(), pageWidth / 2, h.getY(), { font: serif, style: 'bold', size: 24, color: dark, align: 'center' });
        h.setY(h.getY() + 24);

        const contact = [personalInfo.location, personalInfo.phone, personalInfo.email].filter(Boolean).join('  |  ');
        h.writeText(contact, pageWidth / 2, h.getY(), { font: serif, size: 9, color: [71, 85, 105], align: 'center' });
        h.setY(h.getY() + 30);

        const secH = (title: string) => {
            h.checkPageBreak(50, margin);
            doc.setDrawColor(...gold);
            doc.setLineWidth(1.5);
            doc.line(margin, h.getY() + 4, pageWidth - margin, h.getY() + 4);
            h.writeText(title.toUpperCase(), margin, h.getY(), { font: serif, style: 'bold', size: 9, color: gold });
            h.setY(h.getY() + 16);
        };

        // Summary
        secH('Professional Summary');
        const sH = h.writeText(cvData.summary, margin, h.getY(), { font: serif, size: 10, color: [30, 41, 59], width: contentWidth });
        h.setY(h.getY() + sH + 20);

        // Experience
        secH('Experience');
        cvData.experience.forEach(job => {
            h.checkPageBreak(70, margin);
            h.writeText(job.jobTitle, margin, h.getY(), { font: serif, style: 'bold', size: 11, color: dark });
            h.writeText(job.dates, pageWidth - margin, h.getY(), { font: serif, style: 'bold', size: 9, color: gold, align: 'right' });
            h.setY(h.getY() + 12);
            h.writeText(job.company, margin, h.getY(), { font: serif, style: 'italic', size: 10, color: [71, 85, 105] });
            h.setY(h.getY() + 12);
            job.responsibilities.forEach(r => {
                const rH = h.writeText(`• ${decodeHtmlEntities(r)}`, margin + 10, h.getY(), { font: serif, size: 9.5, color: [45, 55, 72], width: contentWidth - 10 });
                h.setY(h.getY() + rH + 2);
            });
            h.setY(h.getY() + 10);
        });

        // Education & Skills in 2 columns
        const colW = (contentWidth - 20) / 2;
        const splitY = h.getY();

        // Education (Left)
        secH('Education');
        cvData.education.forEach(edu => {
            h.writeText(edu.degree, margin, h.getY(), { font: serif, style: 'bold', size: 10 });
            h.setY(h.getY() + 11);
            h.writeText(edu.school, margin, h.getY(), { font: serif, style: 'italic', size: 9, color: [71, 85, 105] });
            h.setY(h.getY() + 16);
        });

        // Skills (Right)
        h.setY(splitY);
        const rightX = margin + colW + 20;
        doc.setDrawColor(...gold);
        doc.setLineWidth(1.5);
        doc.line(rightX, h.getY() + 4, pageWidth - margin, h.getY() + 4);
        h.writeText('KEY COMPETENCIES', rightX, h.getY(), { font: serif, style: 'bold', size: 9, color: gold });
        h.setY(h.getY() + 16);

        const skCount = 10;
        cvData.skills.slice(0, skCount).forEach(skill => {
            h.writeText(`• ${skill}`, rightX, h.getY(), { font: serif, size: 9.5, color: [45, 55, 72] });
            h.setY(h.getY() + 13);
        });
    };

    // ─── TOKYO NIGHT PDF ────────────────────────────────────────────────────────
    const tokyoNightPdf = () => {
        const cyan: [number, number, number] = [34, 211, 238];
        const fuchsia: [number, number, number] = [217, 70, 239];
        const bg: [number, number, number] = [26, 27, 38];
        const mono = 'Courier';

        // Background
        doc.setFillColor(...bg);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        h.setY(margin + 20);
        // Header
        doc.setDrawColor(...fuchsia);
        doc.setLineWidth(3);
        doc.line(margin, h.getY(), margin, h.getY() + 40);

        h.writeText(personalInfo.name.toUpperCase(), margin + 15, h.getY() + 5, { font: mono, style: 'bold', size: 28, color: [255, 255, 255] });
        h.setY(h.getY() + 35);

        const contact = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join('  |  ');
        h.writeText(contact, margin + 15, h.getY(), { font: mono, size: 9, color: cyan });
        h.setY(h.getY() + 40);

        const secH = (title: string) => {
            h.checkPageBreak(50, margin);
            h.writeText(title.toUpperCase(), margin, h.getY(), { font: mono, style: 'bold', size: 8, color: cyan });
            doc.setDrawColor(...cyan);
            doc.setLineWidth(0.5);
            doc.line(margin + 100, h.getY() - 3, pageWidth - margin, h.getY() - 3);
            h.setY(h.getY() + 15);
        };

        secH('System Summary');
        const sLines = doc.splitTextToSize(cvData.summary, contentWidth - 20);
        doc.setDrawColor(71, 85, 105);
        doc.setLineWidth(1);
        doc.line(margin + 5, h.getY(), margin + 5, h.getY() + sLines.length * 12);
        const sH = h.writeText(cvData.summary, margin + 15, h.getY(), { font: mono, size: 9.5, color: [148, 163, 184], width: contentWidth - 20 });
        h.setY(h.getY() + sH + 25);

        secH('Deployment History');
        cvData.experience.forEach(job => {
            h.checkPageBreak(80, h.getY());
            doc.setDrawColor(...fuchsia);
            doc.setLineWidth(1);
            doc.line(margin + 5, h.getY(), margin + 5, h.getY() + 40);

            h.writeText(job.jobTitle.toUpperCase(), margin + 15, h.getY(), { font: mono, style: 'bold', size: 10, color: [255, 255, 255] });
            h.writeText(job.dates, pageWidth - margin, h.getY(), { font: mono, size: 8, color: cyan, align: 'right' });
            h.setY(h.getY() + 12);
            h.writeText(job.company, margin + 15, h.getY(), { font: mono, size: 9, color: fuchsia });
            h.setY(h.getY() + 14);

            job.responsibilities.forEach(r => {
                h.writeText('>', margin + 15, h.getY(), { font: mono, color: fuchsia });
                const rH = h.writeText(decodeHtmlEntities(r), margin + 30, h.getY(), { font: mono, size: 9, color: [148, 163, 184], width: contentWidth - 30 });
                h.setY(h.getY() + rH + 3);
            });
            h.setY(h.getY() + 15);
        });
    };

    // ─── PARIS VIBE PDF ────────────────────────────────────────────────────────
    const parisVibePdf = () => {
        const rose: [number, number, number] = [251, 113, 133];
        const serif = 'Times-Roman';

        h.setY(margin + 40);
        // Header
        const nameParts = personalInfo.name.split(' ');
        h.writeText(nameParts[0].toUpperCase(), margin, h.getY(), { font: serif, style: 'bold', size: 40, color: [24, 24, 27] });
        h.setY(h.getY() + 35);
        if (nameParts.length > 1) {
            h.writeText(nameParts.slice(1).join(' ').toUpperCase(), margin, h.getY(), { font: serif, size: 30, color: [212, 212, 216] });
            h.setY(h.getY() + 30);
        }

        doc.setDrawColor(228, 228, 231);
        doc.setLineWidth(0.5);
        doc.line(margin, h.getY(), pageWidth - margin, h.getY());
        h.setY(h.getY() + 15);

        const contact = (personalInfo.location || '') + '  ·  ' + (personalInfo.email || '') + '  ·  ' + (personalInfo.phone || '');
        h.writeText(contact.toUpperCase(), pageWidth - margin, h.getY(), { font: serif, size: 8, color: [161, 161, 170], align: 'right' });
        h.setY(h.getY() + 60);

        // Sidebar 35%, Main 60%
        const sideW = contentWidth * 0.35;
        const mainW = contentWidth * 0.6;
        const mainX = margin + sideW + 25;
        const startY = h.getY();

        // Summary (Main)
        h.writeText('\u201C', mainX - 15, h.getY(), { font: serif, size: 30, color: [254, 226, 226] });
        const sH = h.writeText(cvData.summary, mainX, h.getY() + 10, { font: serif, style: 'italic', size: 12, color: [113, 113, 122], width: mainW });
        h.setY(h.getY() + Math.max(sH + 60, 100));

        // Experience (Main)
        h.writeText('PROFESSIONAL PATH', mainX, h.getY() - 30, { font: serif, style: 'bold', size: 8, color: [24, 24, 27] });
        doc.setDrawColor(24, 24, 27);
        doc.setLineWidth(1);
        doc.line(mainX, h.getY() - 25, mainX + 50, h.getY() - 25);

        cvData.experience.forEach(job => {
            h.checkPageBreak(80, h.getY());
            h.writeText(job.jobTitle.toUpperCase(), mainX, h.getY(), { font: serif, style: 'bold', size: 14, color: [24, 24, 27] });
            h.writeText(job.dates.toUpperCase(), mainX + mainW, h.getY() + 3, { font: serif, size: 8, color: rose, align: 'right' });
            h.setY(h.getY() + 14);
            h.writeText(job.company.toUpperCase(), mainX, h.getY(), { font: serif, size: 9, color: [161, 161, 170] });
            h.setY(h.getY() + 15);
            job.responsibilities.forEach(r => {
                const rH = h.writeText(decodeHtmlEntities(r), mainX + 10, h.getY(), { font: serif, size: 10, color: [82, 82, 91], width: mainW - 10 });
                doc.setDrawColor(...rose);
                doc.line(mainX, h.getY() + 5, mainX + 5, h.getY() + 5);
                h.setY(h.getY() + rH + 6);
            });
            h.setY(h.getY() + 20);
        });

        // Skills (Side)
        let curY = startY;
        h.writeText('01 \u2014 EXPERTISE', margin, curY, { font: serif, style: 'bold', size: 8, color: rose });
        curY += 20;
        cvData.skills.slice(0, 15).forEach(skill => {
            h.writeText(skill, margin, curY, { font: serif, size: 9, color: [82, 82, 91] });
            doc.setDrawColor(244, 244, 245);
            doc.line(margin, curY + 4, margin + sideW, curY + 4);
            curY += 16;
        });
    };

    // ─── LONDON FINANCE PDF ──────────────────────────────────────────────────────
    const londonFinancePdf = () => {
        const dark: [number, number, number] = [0, 0, 0];
        const slate: [number, number, number] = [71, 85, 105];
        const serif = 'Times-Roman';

        h.setY(margin + 20);
        // Header
        h.writeText(personalInfo.name.toUpperCase(), pageWidth / 2, h.getY(), { font: serif, style: 'bold', size: 24, color: dark, align: 'center' });
        h.setY(h.getY() + 24);

        const contact = [personalInfo.location, personalInfo.phone, personalInfo.email].filter(Boolean).join('  •  ');
        h.writeText(contact.toUpperCase(), pageWidth / 2, h.getY(), { font: serif, size: 8, color: slate, align: 'center' });
        h.setY(h.getY() + 15);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(1.5);
        doc.line(margin, h.getY(), pageWidth - margin, h.getY());
        h.setY(h.getY() + 25);

        const secH = (title: string) => {
            h.checkPageBreak(50, margin);
            h.writeText(title.toUpperCase(), margin, h.getY(), { font: serif, style: 'bold', size: 9, color: dark });
            doc.setLineWidth(0.5);
            doc.line(margin, h.getY() + 4, pageWidth - margin, h.getY() + 4);
            h.setY(h.getY() + 16);
        };

        // Profile
        secH('Professional Profile');
        const sH = h.writeText(cvData.summary, margin, h.getY(), { font: serif, style: 'italic', size: 9, color: [0, 0, 0], width: contentWidth, align: 'justify' });
        h.setY(h.getY() + sH + 20);

        // Experience
        secH('Professional Experience');
        cvData.experience.forEach(job => {
            h.checkPageBreak(80, h.getY());
            h.writeText(job.company.toUpperCase(), margin, h.getY(), { font: serif, style: 'bold', size: 10, color: dark });
            h.writeText(job.dates.toUpperCase(), pageWidth - margin, h.getY(), { font: serif, style: 'bold', size: 9, align: 'right' });
            h.setY(h.getY() + 12);
            h.writeText(job.jobTitle, margin, h.getY(), { font: serif, style: 'italic', size: 10, color: [63, 63, 70] });
            h.setY(h.getY() + 14);
            job.responsibilities.forEach(r => {
                const rH = h.writeText(`• ${decodeHtmlEntities(r)}`, margin + 10, h.getY(), { font: serif, size: 9, color: [0, 0, 0], width: contentWidth - 10, align: 'justify' });
                h.setY(h.getY() + rH + 3);
            });
            h.setY(h.getY() + 15);
        });

        // Education
        secH('Education');
        cvData.education.forEach(edu => {
            h.writeText(edu.school.toUpperCase(), margin, h.getY(), { font: serif, style: 'bold', size: 10 });
            h.writeText(edu.year, pageWidth - margin, h.getY(), { font: serif, style: 'bold', size: 9, align: 'right' });
            h.setY(h.getY() + 11);
            h.writeText(edu.degree, margin, h.getY(), { font: serif, style: 'italic', size: 10 });
            h.setY(h.getY() + 16);
        });

        // Additional
        secH('Additional Information');
        h.writeText('TECHNICAL SKILLS: ', margin, h.getY(), { font: serif, style: 'bold', size: 9 });
        h.writeText(cvData.skills.slice(0, 15).join(', '), margin + 110, h.getY(), { font: serif, size: 9 });
        h.setY(h.getY() + 13);
        if (cvData.languages?.length) {
            h.writeText('LANGUAGES: ', margin, h.getY(), { font: serif, style: 'bold', size: 9 });
            h.writeText(cvData.languages.map(l => `${l.name} (${l.proficiency})`).join(', '), margin + 110, h.getY(), { font: serif, size: 9 });
            h.setY(h.getY() + 13);
        }
    };

    // ─── BERLIN DESIGN PDF ───────────────────────────────────────────────────────
    const berlinDesignPdf = () => {
        const yellow: [number, number, number] = [250, 204, 21];
        const zinc900: [number, number, number] = [24, 24, 27];
        const sans = 'Helvetica';

        // Border
        doc.setDrawColor(...zinc900);
        doc.setLineWidth(4);
        doc.rect(margin / 2, margin / 2, pageWidth - margin, pageHeight - margin);

        h.setY(margin + 40);
        // Large Name
        h.writeText(personalInfo.name.toUpperCase(), margin + 20, h.getY(), { font: sans, style: 'bold', size: 60, color: zinc900 });
        h.setY(h.getY() + 60);

        // Connect Box
        doc.setFillColor(...zinc900);
        doc.rect(pageWidth - margin - 150, margin + 40, 150, 80, 'F');
        h.writeText('CONNECT', pageWidth - margin - 140, margin + 55, { font: sans, style: 'bold', size: 8, color: [255, 255, 255] });
        h.writeText(personalInfo.email, pageWidth - margin - 140, margin + 75, { font: sans, size: 7, color: [255, 255, 255] });
        h.writeText(personalInfo.phone, pageWidth - margin - 140, margin + 85, { font: sans, size: 7, color: [255, 255, 255] });
        h.writeText(personalInfo.location, pageWidth - margin - 140, margin + 95, { font: sans, size: 7, color: [255, 255, 255] });

        const secH = (title: string, num: string) => {
            h.checkPageBreak(100, margin);
            h.writeText(num, margin, h.getY(), { font: sans, style: 'bold', size: 80, color: [244, 244, 245] });
            h.writeText(title.toUpperCase(), margin + 10, h.getY() - 10, { font: sans, style: 'bold', size: 24, color: zinc900 });
            doc.setFillColor(...yellow);
            doc.rect(margin + 10, h.getY() - 5, title.length * 15, 6, 'F');
            h.setY(h.getY() + 40);
        };

        secH('Profile', '01');
        const sH = h.writeText(cvData.summary.toUpperCase(), margin + 60, h.getY(), { font: sans, style: 'bold', size: 18, color: zinc900, width: contentWidth - 60, align: 'right' });
        doc.setDrawColor(...yellow);
        doc.setLineWidth(6);
        doc.line(pageWidth - margin, h.getY() - 5, pageWidth - margin, h.getY() + sH);
        h.setY(h.getY() + sH + 60);

        secH('Work', '02');
        cvData.experience.forEach(job => {
            h.checkPageBreak(120, h.getY());
            doc.setFillColor(...zinc900);
            doc.rect(margin, h.getY(), 80, 15, 'F');
            h.writeText(`[${job.dates}]`, margin + 10, h.getY() + 11, { font: sans, style: 'bold', size: 8, color: [255, 255, 255] });

            h.writeText(job.company.toUpperCase(), margin + 90, h.getY() + 11, { font: sans, style: 'bold', size: 22, color: zinc900 });
            h.setY(h.getY() + 30);
            h.writeText(job.jobTitle.toUpperCase(), margin + 90, h.getY(), { font: sans, style: 'bold', size: 12, color: [161, 161, 170] });
            h.setY(h.getY() + 20);
            job.responsibilities.forEach(r => {
                const rH = h.writeText(decodeHtmlEntities(r).toUpperCase(), margin + 90, h.getY(), { font: sans, style: 'bold', size: 10, color: zinc900, width: contentWidth - 90 });
                h.setY(h.getY() + rH + 10);
            });
            h.setY(h.getY() + 30);
        });
    };

    // ─── SILICON VALLEY PDF ──────────────────────────────────────────────────────
    const siliconValleyPdf = () => {
        const blue: [number, number, number] = [37, 99, 235];
        const slate: [number, number, number] = [30, 41, 59];
        const sans = 'Helvetica';

        h.setY(margin + 20);
        // Profile Icon & Header
        doc.setFillColor(...blue);
        doc.circle(pageWidth / 2, h.getY() + 30, 35, 'F');
        h.writeText(personalInfo.name.charAt(0), pageWidth / 2, h.getY() + 42, { font: sans, style: 'bold', size: 30, color: [255, 255, 255], align: 'center' });

        h.setY(h.getY() + 85);
        h.writeText(personalInfo.name, pageWidth / 2, h.getY(), { font: sans, style: 'bold', size: 36, color: slate, align: 'center' });
        h.setY(h.getY() + 25);

        const contact = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join('  •  ');
        h.writeText(contact, pageWidth / 2, h.getY(), { font: sans, size: 9, color: [100, 116, 139], align: 'center' });
        h.setY(h.getY() + 40);

        // Vision Box
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, h.getY(), contentWidth, 80, 15, 15, 'F');
        h.writeText('VISION', margin + 20, h.getY() + 25, { font: sans, style: 'bold', size: 7, color: blue });
        h.writeText(cvData.summary, margin + 20, h.getY() + 45, { font: sans, style: 'bold', size: 14, color: slate, width: contentWidth - 40 });
        h.setY(h.getY() + 110);

        h.writeText('CAREER VELOCITY', margin, h.getY(), { font: sans, style: 'bold', size: 8, color: [148, 163, 184] });
        h.setY(h.getY() + 20);

        cvData.experience.forEach(job => {
            h.checkPageBreak(120, h.getY());
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(241, 245, 249);
            doc.roundedRect(margin, h.getY(), contentWidth, 100, 15, 15, 'FD');

            h.writeText(job.jobTitle, margin + 20, h.getY() + 30, { font: sans, style: 'bold', size: 18, color: slate });
            h.writeText(job.company, margin + 20, h.getY() + 50, { font: sans, style: 'bold', size: 14, color: blue });
            h.writeText(job.dates, pageWidth - margin - 20, h.getY() + 30, { font: sans, style: 'bold', size: 8, color: [148, 163, 184], align: 'right' });

            let bulletY = h.getY() + 70;
            job.responsibilities.slice(0, 3).forEach(r => {
                doc.setFillColor(...blue);
                doc.circle(margin + 25, bulletY, 2, 'F');
                const rH = h.writeText(decodeHtmlEntities(r), margin + 40, bulletY + 3, { font: sans, size: 10, color: [71, 85, 105], width: contentWidth - 60 });
                bulletY += rH + 8;
            });
            h.setY(bulletY + 30);
        });
    };

    // ─── SYDNEY CREATIVE PDF ─────────────────────────────────────────────────────
    const sydneyCreativePdf = () => {
        const orange: [number, number, number] = [251, 146, 60];
        const pink: [number, number, number] = [236, 72, 153];
        const indigo: [number, number, number] = [79, 70, 229];
        const sans = 'Helvetica';

        // Header Gradient Overlay (Simulated with blocks)
        doc.setFillColor(...orange);
        doc.rect(0, 0, pageWidth, 200, 'F');

        h.setY(margin + 40);
        h.writeText("HELLO.", margin, h.getY(), { font: sans, style: 'bold', size: 50, color: [255, 255, 255] });
        h.setY(h.getY() + 45);
        h.writeText(`I'M ${personalInfo.name.split(' ')[0].toUpperCase()}.`, margin, h.getY(), { font: sans, style: 'bold', size: 50, color: [255, 255, 255] });

        h.setY(220);
        // Sidebar Block
        doc.setFillColor(15, 23, 42); // slate-900
        doc.rect(0, 200, pageWidth * 0.35, pageHeight - 200, 'F');

        // Sidebar Content
        let sideY = 240;
        h.writeText('MY TOOLKIT', margin, sideY, { font: sans, style: 'bold', size: 8, color: orange });
        sideY += 25;
        cvData.skills.slice(0, 15).forEach(skill => {
            doc.setFillColor(30, 41, 59);
            doc.roundedRect(margin - 5, sideY - 12, 100, 18, 5, 5, 'F');
            h.writeText(skill.toUpperCase(), margin, sideY, { font: sans, style: 'bold', size: 8, color: [255, 255, 255] });
            sideY += 22;
        });

        // Main Content
        let mainY = 240;
        const mainX = pageWidth * 0.35 + 40;
        const mainW = pageWidth - mainX - margin;

        h.writeText(cvData.summary, mainX, mainY, { font: sans, style: 'bold', size: 16, color: [30, 41, 59], width: mainW });
        mainY += 100;

        h.writeText('THE EXPERIENCE', mainX, mainY, { font: sans, style: 'bold', size: 8, color: indigo });
        mainY += 40;

        cvData.experience.forEach(job => {
            h.checkPageBreak(120, h.getY());
            h.writeText(job.dates.toUpperCase(), mainX, mainY, { font: sans, style: 'bold', size: 8, color: [148, 163, 184] });
            h.writeText(job.company.toUpperCase(), mainX, mainY + 15, { font: sans, style: 'bold', size: 10, color: [15, 23, 42] });

            h.writeText(job.jobTitle.toUpperCase(), mainX + 100, mainY + 15, { font: sans, style: 'bold', size: 18, color: [15, 23, 42] });
            mainY += 40;
            job.responsibilities.forEach(r => {
                const rH = h.writeText(decodeHtmlEntities(r), mainX + 100, mainY, { font: sans, size: 11, color: [71, 85, 105], width: mainW - 100 });
                mainY += rH + 8;
            });
            mainY += 40;
        });
    };

    // ─── SCHOLARSHIP PRO PDF ─────────────────────────────────────────────────────
    const scholarshipProPdf = () => {
        const teal: [number, number, number] = [13, 148, 136];
        const slate: [number, number, number] = [15, 23, 42];
        const sans = 'Helvetica';

        h.setY(margin + 20);
        // Header
        h.writeText(personalInfo.name.toUpperCase(), margin, h.getY(), { font: sans, style: 'bold', size: 36, color: slate });
        h.setY(h.getY() + 30);
        const contact = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join('  |  ');
        h.writeText(contact.toUpperCase(), margin, h.getY(), { font: sans, style: 'bold', size: 9, color: teal });
        h.setY(h.getY() + 30);

        // Research Box
        doc.setFillColor(240, 253, 250);
        doc.roundedRect(margin, h.getY(), contentWidth, 60, 10, 10, 'F');
        h.writeText('RESEARCH INTENT', margin + 15, h.getY() + 20, { font: sans, style: 'bold', size: 7, color: teal });
        h.writeText(cvData.summary, margin + 15, h.getY() + 40, { font: sans, style: 'bold', size: 11, color: slate, width: contentWidth - 30 });
        h.setY(h.getY() + 90);

        const secH = (title: string) => {
            h.checkPageBreak(50, margin);
            h.writeText(title.toUpperCase(), margin, h.getY(), { font: sans, style: 'bold', size: 10, color: teal });
            doc.setDrawColor(204, 251, 241);
            doc.setLineWidth(2);
            doc.line(margin + 120, h.getY() - 4, pageWidth - margin, h.getY() - 4);
            h.setY(h.getY() + 20);
        };

        secH('Academic Formation');
        cvData.education.forEach(edu => {
            h.writeText(edu.degree, margin + 20, h.getY(), { font: sans, style: 'bold', size: 14, color: slate });
            h.writeText(edu.year, pageWidth - margin, h.getY(), { font: sans, style: 'bold', size: 9, color: teal, align: 'right' });
            h.setY(h.getY() + 14);
            h.writeText(edu.school.toUpperCase(), margin + 20, h.getY(), { font: sans, style: 'bold', size: 9, color: teal });
            h.setY(h.getY() + 25);
        });

        secH('Relevant Experience');
        cvData.experience.forEach(job => {
            h.checkPageBreak(80, h.getY());
            h.writeText(job.jobTitle.toUpperCase(), margin + 20, h.getY(), { font: sans, style: 'bold', size: 12, color: slate });
            h.writeText(job.dates, pageWidth - margin, h.getY(), { font: sans, style: 'bold', size: 8, color: teal, align: 'right' });
            h.setY(h.getY() + 12);
            h.writeText(job.company.toUpperCase(), margin + 20, h.getY(), { font: sans, style: 'bold', size: 9, color: [100, 116, 139] });
            h.setY(h.getY() + 15);
            job.responsibilities.forEach(r => {
                h.writeText('✦', margin + 20, h.getY(), { font: sans, color: teal });
                const rH = h.writeText(decodeHtmlEntities(r), margin + 40, h.getY(), { font: sans, size: 10, color: slate, width: contentWidth - 40 });
                h.setY(h.getY() + rH + 5);
            });
            h.setY(h.getY() + 20);
        });
    };

    // ─── MEDICAL STANDARD PDF ────────────────────────────────────────────────────
    const medicalStandardPdf = () => {
        const sky: [number, number, number] = [2, 132, 199];
        const slate: [number, number, number] = [15, 23, 42];
        const sans = 'Helvetica';

        // Top Border
        doc.setFillColor(...sky);
        doc.rect(0, 0, pageWidth, 12, 'F');

        h.setY(margin + 20);
        // Header Card
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(241, 245, 249);
        doc.roundedRect(margin, h.getY(), contentWidth, 80, 15, 15, 'FD');

        h.writeText(personalInfo.name.toUpperCase() + ', MD/RN', margin + 20, h.getY() + 35, { font: sans, style: 'bold', size: 24, color: slate });
        h.setY(h.getY() + 55);
        const contact = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join('  |  ');
        h.writeText(contact, margin + 20, h.getY(), { font: sans, style: 'bold', size: 9, color: [148, 163, 184] });
        h.setY(h.getY() + 60);

        const secH = (title: string) => {
            h.checkPageBreak(50, margin);
            doc.setFillColor(...sky);
            doc.roundedRect(margin, h.getY() - 15, 20, 20, 3, 3, 'F');
            h.writeText('+', margin + 6, h.getY() + 1, { font: sans, style: 'bold', size: 16, color: [255, 255, 255] });
            h.writeText(title.toUpperCase(), margin + 30, h.getY(), { font: sans, style: 'bold', size: 12, color: slate });
            h.setY(h.getY() + 25);
        };

        secH('Clinical Experience');
        cvData.experience.forEach(job => {
            h.checkPageBreak(100, h.getY());
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(241, 245, 249);
            doc.roundedRect(margin, h.getY(), contentWidth, 110, 15, 15, 'FD');

            h.writeText(job.jobTitle.toUpperCase(), margin + 20, h.getY() + 30, { font: sans, style: 'bold', size: 14, color: slate });
            h.writeText(job.company.toUpperCase(), margin + 20, h.getY() + 45, { font: sans, style: 'bold', size: 10, color: sky });
            h.writeText(job.dates, pageWidth - margin - 20, h.getY() + 30, { font: sans, style: 'bold', size: 8, color: [148, 163, 184], align: 'right' });

            let bulletY = h.getY() + 65;
            job.responsibilities.slice(0, 3).forEach(r => {
                doc.setFillColor(186, 230, 253);
                doc.circle(margin + 25, bulletY, 2, 'F');
                const rH = h.writeText(decodeHtmlEntities(r), margin + 40, bulletY + 3, { font: sans, size: 9, color: [71, 85, 105], width: contentWidth - 60 });
                bulletY += rH + 6;
            });
            h.setY(bulletY + 25);
        });
    };

    const infographic = () => {
        // This is a complex visual template
        // For simplicity, we'll draw basic shapes.
        doc.setFillColor(30, 58, 138); // Dark blue background
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        h.setY(margin);
        h.writeText(personalInfo.name, pageWidth / 2, h.getY(), { font: selectedFont, size: 30, color: [255, 255, 255], align: 'center' });
        h.setY(h.getY() + 40);

        // Skills with progress bars
        let skillY = h.getY();
        cvData.skills.slice(0, 5).forEach((skill, i) => {
            h.writeText(skill, margin, skillY + i * 30, { font: selectedFont, color: [255, 255, 255] });
            doc.setFillColor(156, 163, 175);
            doc.rect(margin + 100, skillY + i * 30 - 5, 100, 8, 'F');
            doc.setFillColor(37, 99, 235);
            doc.rect(margin + 100, skillY + i * 30 - 5, 80, 8, 'F'); // Example 80%
        });
    };


    // ─── CORPORATE PDF ───────────────────────────────────────────────────────────
    // Navy sidebar, bold section headers with coloured underline
    const corporatePdf = () => {
        const darkSlate: [number, number, number] = [15, 23, 42];
        const accent: [number, number, number] = [29, 78, 216]; // blue-700
        const midGray: [number, number, number] = [71, 85, 105];
        const serif = 'Times-Roman';

        h.setY(margin);

        // Centered header
        h.writeText(personalInfo.name, pageWidth / 2, h.getY(), { font: serif, style: 'bold', size: 24, color: darkSlate, align: 'center' });
        h.setY(h.getY() + 18);

        const contact = [personalInfo.location, personalInfo.phone, personalInfo.email].filter(Boolean).join('  •  ');
        h.writeText(contact, pageWidth / 2, h.getY(), { font: serif, size: 9, color: midGray, align: 'center' });
        h.setY(h.getY() + 11);

        const links: string[] = [];
        if (personalInfo.linkedin) links.push(personalInfo.linkedin);
        if (personalInfo.website) links.push(personalInfo.website);
        if (personalInfo.github) links.push(personalInfo.github);
        if (links.length > 0) {
            h.writeText(links.join('  •  '), pageWidth / 2, h.getY(), { font: serif, size: 9, color: accent, align: 'center' });
            h.setY(h.getY() + 12);
        }

        // Double rule
        doc.setDrawColor(51, 65, 85);
        doc.setLineWidth(2);
        doc.line(margin, h.getY(), pageWidth - margin, h.getY());
        h.setY(h.getY() + 14);

        const sec = (title: string) => {
            h.checkPageBreak(40, margin);
            h.writeText(title, margin, h.getY(), { font: serif, style: 'bold', size: 11, color: [71, 85, 105] });
            h.setY(h.getY() + 14);
        };

        // PROFESSIONAL SUMMARY
        sec('PROFESSIONAL SUMMARY');
        const sH = h.writeText(cvData.summary, margin, h.getY(), { font: serif, size: 10.5, color: darkSlate, width: contentWidth });
        h.setY(h.getY() + sH + 16);

        // WORK EXPERIENCE — Company bold first, then job title italic (matching preview)
        sec('WORK EXPERIENCE');
        cvData.experience.forEach(job => {
            h.checkPageBreak(60, margin);
            // Company name bold + dates on right
            h.writeText(job.company, margin, h.getY(), { font: serif, style: 'bold', size: 11, color: darkSlate });
            h.writeText(job.dates, pageWidth - margin, h.getY(), { font: serif, size: 9, color: midGray, align: 'right' });
            h.setY(h.getY() + 13);
            // Job title italic below company
            h.writeText(job.jobTitle, margin, h.getY(), { font: serif, style: 'bolditalic', size: 10.5, color: midGray });
            h.setY(h.getY() + 13);
            // Bullets with disc-style •
            job.responsibilities.forEach(r => {
                h.checkPageBreak(14, margin);
                const rH = h.writeText(`•  ${decodeHtmlEntities(r)}`, margin + 10, h.getY(), { font: serif, size: 10, color: [51, 65, 85], width: contentWidth - 10 });
                h.setY(h.getY() + rH + 3);
            });
            h.setY(h.getY() + 14);
        });

        // EDUCATION — school bold first, degree italic (matching preview)
        sec('EDUCATION');
        cvData.education.forEach(edu => {
            h.checkPageBreak(40, margin);
            h.writeText(edu.school, margin, h.getY(), { font: serif, style: 'bold', size: 11, color: darkSlate });
            h.writeText(edu.year, pageWidth - margin, h.getY(), { font: serif, size: 9, color: midGray, align: 'right' });
            h.setY(h.getY() + 13);
            h.writeText(edu.degree, margin, h.getY(), { font: serif, style: 'italic', size: 10.5, color: midGray });
            h.setY(h.getY() + 13);
            if (edu.description) {
                const dH = h.writeText(edu.description, margin, h.getY(), { font: serif, size: 9.5, color: midGray, width: contentWidth });
                h.setY(h.getY() + dH + 5);
            }
            h.setY(h.getY() + 6);
        });

        // KEY SKILLS & LANGUAGES — 3-column grid matching preview
        sec('KEY SKILLS & LANGUAGES');
        const sk = cvData.skills.slice(0, 15);
        const colW = contentWidth / 3;
        const perCol = Math.ceil(sk.length / 3);
        const startSkY = h.getY();
        let maxColBottom = startSkY;
        [0, 1, 2].forEach(ci => {
            let colY = startSkY;
            sk.slice(ci * perCol, (ci + 1) * perCol).forEach(skill => {
                const bH = h.writeText(`•  ${skill}`, margin + ci * colW, colY, { font: serif, size: 10, color: darkSlate, width: colW - 8 });
                colY += bH + 4;
            });
            maxColBottom = Math.max(maxColBottom, colY);
        });
        h.setY(maxColBottom + 8);

        if (cvData.languages && cvData.languages.length > 0) {
            const langText = 'Languages: ' + cvData.languages.map(l => `${l.name} (${l.proficiency})`).join(', ');
            h.writeText(langText, margin, h.getY(), { font: serif, style: 'bold', size: 10, color: darkSlate, width: contentWidth });
            h.setY(h.getY() + 16);
        }

        // PROJECTS
        if (cvData.projects && cvData.projects.length > 0) {
            sec('PROJECTS');
            cvData.projects.forEach(proj => {
                h.checkPageBreak(40, margin);
                h.writeText(proj.name, margin, h.getY(), { font: serif, style: 'bold', size: 11, color: darkSlate });
                h.setY(h.getY() + 13);
                const dH = h.writeText(proj.description, margin, h.getY(), { font: serif, size: 10, color: [51, 65, 85], width: contentWidth });
                h.setY(h.getY() + dH + 12);
            });
        }
    };


    // ─── ELEGANT PDF ─────────────────────────────────────────────────────────────
    // Matches TemplateElegant.tsx exactly: white bg, centered serif header,
    // Summary → Experience (› bullets) → Education → Skills (3-col) → Languages
    const elegantPdf = () => {
        const dark: [number, number, number] = [30, 41, 59];     // slate-800
        const midGray: [number, number, number] = [71, 85, 105]; // slate-500/600
        const serif = 'Times-Roman';

        h.setY(margin);

        // Centered name — large
        h.writeText(personalInfo.name, pageWidth / 2, h.getY(), { font: serif, style: 'bold', size: 28, color: dark, align: 'center' });
        h.setY(h.getY() + 20);

        // Contact line
        const contact = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join('   •   ');
        h.writeText(contact, pageWidth / 2, h.getY(), { font: serif, size: 9.5, color: midGray, align: 'center' });
        h.setY(h.getY() + 11);

        // Links line
        const links: string[] = [];
        if (personalInfo.linkedin) links.push(personalInfo.linkedin);
        if (personalInfo.website) links.push(personalInfo.website);
        if (personalInfo.github) links.push(personalInfo.github);
        if (links.length > 0) {
            h.writeText(links.join('   •   '), pageWidth / 2, h.getY(), { font: serif, size: 9, color: [37, 99, 235], align: 'center' });
            h.setY(h.getY() + 12);
        }

        // Section helper — matches <Section> component (title + thin horizontal rule)
        const sec = (title: string) => {
            h.checkPageBreak(40, margin);
            h.writeText(title.toUpperCase(), margin, h.getY(), { font: serif, style: 'bold', size: 9.5, color: [51, 65, 85] });
            h.setY(h.getY() + 5);
            doc.setDrawColor(203, 213, 225); // slate-200
            doc.setLineWidth(0.5);
            doc.line(margin, h.getY(), pageWidth - margin, h.getY());
            h.setY(h.getY() + 12);
        };

        // SUMMARY
        sec('Summary');
        const sH = h.writeText(cvData.summary, margin, h.getY(), { font: serif, style: 'italic', size: 10.5, color: dark, width: contentWidth, align: 'center' });
        h.setY(h.getY() + sH + 18);

        // EXPERIENCE — jobTitle bold, company below, › bullets (matching preview rsaquo)
        sec('Experience');
        cvData.experience.forEach(job => {
            h.checkPageBreak(60, margin);
            // Title + dates on same line
            h.writeText(job.jobTitle, margin, h.getY(), { font: serif, style: 'bold', size: 12, color: dark });
            h.writeText(job.dates, pageWidth - margin, h.getY(), { font: serif, size: 9.5, color: midGray, align: 'right' });
            h.setY(h.getY() + 14);
            // Company name below
            h.writeText(job.company, margin, h.getY(), { font: serif, style: 'bold', size: 11, color: midGray });
            h.setY(h.getY() + 13);
            // Responsibilities with › arrow bullets (matching &rsaquo; in preview)
            job.responsibilities.forEach(r => {
                h.checkPageBreak(14, margin);
                const rH = h.writeText(`›  ${decodeHtmlEntities(r)}`, margin + 8, h.getY(), { font: serif, size: 10.5, color: dark, width: contentWidth - 8 });
                h.setY(h.getY() + rH + 3);
            });
            h.setY(h.getY() + 14);
        });

        // EDUCATION — degree bold, school below
        sec('Education');
        cvData.education.forEach(edu => {
            h.checkPageBreak(40, margin);
            h.writeText(edu.degree, margin, h.getY(), { font: serif, style: 'bold', size: 12, color: dark });
            h.writeText(edu.year, pageWidth - margin, h.getY(), { font: serif, size: 9.5, color: midGray, align: 'right' });
            h.setY(h.getY() + 14);
            h.writeText(edu.school, margin, h.getY(), { font: serif, size: 11, color: midGray });
            h.setY(h.getY() + 14);
            if (edu.description) {
                const dH = h.writeText(edu.description, margin, h.getY(), { font: serif, style: 'italic', size: 9.5, color: midGray, width: contentWidth });
                h.setY(h.getY() + dH + 6);
            }
            h.setY(h.getY() + 6);
        });

        // SKILLS — 3-column grid list matching preview (list-disc 3 cols)
        sec('Skills');
        const sk = cvData.skills.slice(0, 15);
        const colW = contentWidth / 3;
        const perCol = Math.ceil(sk.length / 3);
        const startSkY = h.getY();
        let maxColBottom = startSkY;
        [0, 1, 2].forEach(ci => {
            let colY = startSkY;
            sk.slice(ci * perCol, (ci + 1) * perCol).forEach(skill => {
                const bH = h.writeText(`•  ${skill}`, margin + ci * colW, colY, { font: serif, size: 10, color: [71, 85, 105], width: colW - 8 });
                colY += bH + 4;
            });
            maxColBottom = Math.max(maxColBottom, colY);
        });
        h.setY(maxColBottom + 14);

        // LANGUAGES (matching preview languages section)
        if (cvData.languages && cvData.languages.length > 0) {
            sec('Languages');
            const langText = cvData.languages.map(l => `${l.name} (${l.proficiency})`).join('   •   ');
            h.writeText(langText, margin, h.getY(), { font: serif, size: 10.5, color: dark, width: contentWidth });
            h.setY(h.getY() + 18);
        }
    };

    // ─── EXECUTIVE PDF ────────────────────────────────────────────────────────────
    // Premium dark header, white-on-dark name, full-width look
    const executivePdf = () => {
        const headerH = 120;
        const charcoal: [number, number, number] = [15, 20, 30];
        const teal: [number, number, number] = [20, 180, 160];
        const serif = 'Times-Roman';

        // Full-width dark header
        doc.setFillColor(...charcoal);
        doc.rect(0, 0, pageWidth, headerH, 'F');

        // Teal accent bar at bottom of header
        doc.setFillColor(...teal);
        doc.rect(0, headerH - 5, pageWidth, 5, 'F');

        // Name in header
        h.setY(38);
        h.writeText(personalInfo.name.toUpperCase(), margin, h.getY(), { font: serif, style: 'bold', size: 24, color: [255, 255, 255] });
        h.setY(h.getY() + 16);
        const jobt = cvData.experience[0]?.jobTitle || '';
        h.writeText(jobt, margin, h.getY(), { font: serif, style: 'italic', size: 12, color: teal });
        h.setY(h.getY() + 14);
        const contact = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join('   |   ');
        h.writeText(contact, margin, h.getY(), { font: serif, size: 9, color: [180, 190, 200] });

        // Right side: links/social
        const links = [personalInfo.linkedin, personalInfo.github, personalInfo.website].filter(Boolean).join('   |   ');
        if (links) {
            h.writeText(links, pageWidth - margin, 70, { font: serif, size: 8.5, color: [130, 200, 220], align: 'right' });
        }

        h.setY(headerH + 20);

        const sec = (title: string) => {
            h.checkPageBreak(40, margin);
            doc.setFillColor(240, 244, 248);
            doc.rect(margin - 4, h.getY() - 4, contentWidth + 8, 18, 'F');
            h.writeText(title.toUpperCase(), margin, h.getY() + 10, { font: serif, style: 'bold', size: 10, color: charcoal });
            doc.setDrawColor(...teal);
            doc.setLineWidth(1.5);
            doc.line(margin, h.getY() + 14, margin + 40, h.getY() + 14);
            h.setY(h.getY() + 24);
        };

        sec('Executive Summary');
        const sH = h.writeText(cvData.summary, margin, h.getY(), { font: serif, size: 10.5, color: [40, 50, 60], width: contentWidth });
        h.setY(h.getY() + sH + 16);

        sec('Core Competencies');
        const execSkH = drawSkillsBlock(cvData.skills, h.getY(), contentWidth, margin, 'left', [60, 70, 85]);
        h.setY(h.getY() + execSkH + 16);

        sec('Career History');
        cvData.experience.forEach(job => {
            h.checkPageBreak(70, margin);
            doc.setFillColor(...teal);
            doc.rect(margin - 4, h.getY() - 2, 4, 16, 'F');
            h.writeText(job.jobTitle, margin + 4, h.getY(), { font: serif, style: 'bold', size: 12, color: charcoal });
            h.writeText(job.dates, pageWidth - margin, h.getY(), { font: serif, size: 9.5, align: 'right', color: [100, 120, 140] });
            h.setY(h.getY() + 14);
            h.writeText(job.company, margin + 4, h.getY(), { font: serif, size: 10.5, color: teal });
            h.setY(h.getY() + 14);
            job.responsibilities.forEach(r => {
                const rH = h.writeText(`▸  ${decodeHtmlEntities(r)}`, margin + 10, h.getY(), { font: serif, size: 10, color: [45, 55, 72], width: contentWidth - 14 });
                h.setY(h.getY() + rH + 2);
            });
            h.setY(h.getY() + 14);
        });

        sec('Education');
        cvData.education.forEach(edu => {
            h.checkPageBreak(40, margin);
            h.writeText(edu.degree, margin, h.getY(), { font: serif, style: 'bold', size: 11.5, color: charcoal });
            h.writeText(edu.year, pageWidth - margin, h.getY(), { font: serif, size: 9.5, align: 'right', color: [100, 120, 140] });
            h.setY(h.getY() + 13);
            h.writeText(edu.school, margin, h.getY(), { font: serif, size: 10.5, color: [80, 100, 120] });
            h.setY(h.getY() + 18);
        });
    };

    // ─── TIMELINE PDF ─────────────────────────────────────────────────────────────
    // Vertical left timeline bar, circular year markers
    const timelinePdf = () => {
        const barX = margin + 30;
        const contentX = barX + 26;
        const cW = pageWidth - contentX - margin / 2;
        const barColor: [number, number, number] = [199, 210, 254]; // indigo-200
        const dotColor: [number, number, number] = [79, 70, 229];   // indigo-600
        const dateColor: [number, number, number] = [99, 102, 241];

        h.setY(margin);

        // Header
        h.writeText(personalInfo.name, contentX, h.getY(), { font: selectedFont, style: 'bold', size: 22, color: [15, 23, 42] });
        h.setY(h.getY() + 14);
        h.writeText([personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join('  ·  '), contentX, h.getY(), { font: selectedFont, size: 9, color: [100, 116, 139] });
        h.setY(h.getY() + 8);
        const links = [personalInfo.linkedin, personalInfo.github, personalInfo.website].filter(Boolean).join('  ·  ');
        if (links) { h.writeText(links, contentX, h.getY(), { font: selectedFont, size: 9, color: [79, 70, 229] }); h.setY(h.getY() + 8); }

        doc.setDrawColor(...dotColor);
        doc.setLineWidth(1);
        doc.line(contentX, h.getY(), pageWidth - margin / 2, h.getY());
        h.setY(h.getY() + 14);

        const sH2 = h.writeText(cvData.summary, contentX, h.getY(), { font: selectedFont, size: 10, color: [45, 55, 72], width: cW });
        h.setY(h.getY() + sH2 + 12);

        // Skills row
        doc.setDrawColor(...dotColor);
        doc.setLineWidth(1);
        doc.line(contentX, h.getY(), pageWidth - margin / 2, h.getY());
        h.setY(h.getY() + 8);
        h.writeText('SKILLS', contentX, h.getY(), { font: selectedFont, style: 'bold', size: 9, color: dotColor });
        h.setY(h.getY() + 10);
        const tlSkH = drawSkillsBlock(cvData.skills, h.getY(), cW, contentX);
        h.setY(h.getY() + tlSkH + 16);

        // Section: EXPERIENCE with timeline
        h.writeText('EXPERIENCE', contentX, h.getY(), { font: selectedFont, style: 'bold', size: 10, color: [15, 23, 42] });
        h.setY(h.getY() + 10);

        const timelineStartY = h.getY();

        cvData.experience.forEach((job, idx) => {
            h.checkPageBreak(70, margin);
            const dotY = h.getY() + 4;

            // Timeline bar (full height for this entry)
            doc.setDrawColor(...barColor);
            doc.setLineWidth(2);
            doc.line(barX, dotY, barX, dotY + 80);

            // Dot
            doc.setFillColor(...dotColor);
            doc.circle(barX, dotY, 4, 'F');

            // Date badge
            h.writeText(job.dates, barX - 5, dotY + 1, { font: selectedFont, size: 8, color: dateColor, align: 'right' });

            // Content
            h.writeText(job.jobTitle, contentX, h.getY(), { font: selectedFont, style: 'bold', size: 11, color: [15, 23, 42] });
            h.setY(h.getY() + 13);
            h.writeText(job.company, contentX, h.getY(), { font: selectedFont, size: 10, color: dotColor });
            h.setY(h.getY() + 12);
            job.responsibilities.forEach(r => {
                const rH = h.writeText(`• ${decodeHtmlEntities(r)}`, contentX + 4, h.getY(), { font: selectedFont, size: 10, color: [45, 55, 72], width: cW - 4 });
                h.setY(h.getY() + rH + 2);
            });
            h.setY(h.getY() + 14);
        });

        // Education with timeline
        h.writeText('EDUCATION', contentX, h.getY(), { font: selectedFont, style: 'bold', size: 10, color: [15, 23, 42] });
        h.setY(h.getY() + 10);
        cvData.education.forEach(edu => {
            h.checkPageBreak(40, margin);
            const dotY = h.getY() + 4;
            doc.setFillColor(139, 92, 246); // purple dot for education
            doc.circle(barX, dotY, 4, 'F');
            h.writeText(edu.degree, contentX, h.getY(), { font: selectedFont, style: 'bold', size: 11, color: [15, 23, 42] });
            h.writeText(edu.year, barX - 5, dotY + 1, { font: selectedFont, size: 8, color: [139, 92, 246], align: 'right' });
            h.setY(h.getY() + 13);
            h.writeText(edu.school, contentX, h.getY(), { font: selectedFont, size: 10, color: [100, 116, 139] });
            h.setY(h.getY() + 18);
        });
    };

    // ─── TECHNICAL / COMPACT PDF ─────────────────────────────────────────────────
    // Dark mono header band, tag-pill skills, two-column body
    const technicalPdf = () => {
        const dark: [number, number, number] = [17, 24, 39];
        const green: [number, number, number] = [16, 185, 129];
        const mono = 'Courier';
        const sans = selectedFont;

        // Dark header band
        doc.setFillColor(...dark);
        doc.rect(0, 0, pageWidth, 100, 'F');

        h.setY(28);
        h.writeText(personalInfo.name, margin, h.getY(), { font: mono, style: 'bold', size: 20, color: [255, 255, 255] });
        h.setY(h.getY() + 14);
        h.writeText(cvData.experience[0]?.jobTitle || 'Software Professional', margin, h.getY(), { font: mono, size: 11, color: green });
        h.setY(h.getY() + 12);
        const contact = [personalInfo.email, personalInfo.phone].filter(Boolean).join('  |  ');
        h.writeText(contact, margin, h.getY(), { font: mono, size: 9, color: [160, 180, 200] });

        // Right: links
        const links = [personalInfo.github, personalInfo.linkedin, personalInfo.website].filter(Boolean).join('  |  ');
        if (links) h.writeText(links, pageWidth - margin, 70, { font: mono, size: 8.5, color: [80, 220, 160], align: 'right' });

        h.setY(110);

        // Skills as tag pills
        h.writeText('TECHNICAL SKILLS', margin, h.getY(), { font: mono, style: 'bold', size: 9, color: dark });
        h.setY(h.getY() + 8);

        let sx = margin;
        let sy = h.getY();
        const pillH = 14;
        const pillPadX = 6;
        const pillMargin = 5;

        doc.setFontSize(8);
        cvData.skills.slice(0, 15).forEach(skill => {
            const sw = doc.getTextWidth(skill) + pillPadX * 2;
            if (sx + sw > pageWidth - margin) { sx = margin; sy += pillH + pillMargin; }
            doc.setFillColor(240, 253, 244);
            doc.roundedRect(sx, sy - 10, sw, pillH, 2, 2, 'F');
            doc.setDrawColor(...green);
            doc.setLineWidth(0.5);
            doc.roundedRect(sx, sy - 10, sw, pillH, 2, 2, 'S');
            doc.setTextColor(22, 101, 52);
            doc.text(skill, sx + pillPadX, sy);
            sx += sw + pillMargin;
        });
        doc.setTextColor(0, 0, 0);
        h.setY(sy + pillH + 14);

        const sec = (title: string) => {
            h.checkPageBreak(40, margin);
            h.writeText(title, margin, h.getY(), { font: mono, style: 'bold', size: 9.5, color: dark });
            h.setY(h.getY() + 4);
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.5);
            doc.line(margin, h.getY(), pageWidth - margin, h.getY());
            h.setY(h.getY() + 10);
        };

        sec('EXPERIENCE');
        cvData.experience.forEach(job => {
            h.checkPageBreak(60, margin);
            h.writeText(job.jobTitle, margin, h.getY(), { font: sans, style: 'bold', size: 11, color: dark });
            h.writeText(job.dates, pageWidth - margin, h.getY(), { font: mono, size: 8.5, color: [100, 116, 139], align: 'right' });
            h.setY(h.getY() + 12);
            h.writeText(job.company, margin, h.getY(), { font: sans, size: 10, color: [20, 150, 100] });
            h.setY(h.getY() + 12);
            job.responsibilities.forEach(r => {
                const rH = h.writeText(`→ ${decodeHtmlEntities(r)}`, margin + 8, h.getY(), { font: sans, size: 10, color: [45, 55, 72], width: contentWidth - 8 });
                h.setY(h.getY() + rH + 2);
            });
            h.setY(h.getY() + 12);
        });

        sec('EDUCATION');
        cvData.education.forEach(edu => {
            h.checkPageBreak(40, margin);
            h.writeText(edu.degree, margin, h.getY(), { font: sans, style: 'bold', size: 11, color: dark });
            h.writeText(edu.year, pageWidth - margin, h.getY(), { font: mono, size: 9, align: 'right', color: [100, 116, 139] });
            h.setY(h.getY() + 12);
            h.writeText(edu.school, margin, h.getY(), { font: sans, size: 10, color: [71, 85, 105] });
            h.setY(h.getY() + 18);
        });

        if (cvData.projects?.length) {
            sec('PROJECTS');
            cvData.projects.forEach(p => {
                h.checkPageBreak(40, margin);
                h.writeText(p.name, margin, h.getY(), { font: sans, style: 'bold', size: 10.5, color: dark });
                if (p.link) h.writeText('[→]', pageWidth - margin, h.getY(), { font: mono, size: 9, align: 'right', color: green, link: p.link });
                h.setY(h.getY() + 12);
                const dH = h.writeText(p.description, margin, h.getY(), { font: sans, size: 10, color: [45, 55, 72], width: contentWidth });
                h.setY(h.getY() + dH + 12);
            });
        }
    };

    // ─── COMPACT PDF ──────────────────────────────────────────────────────────────
    // Dense academic two-column grid, every pixel used
    const compactPdf = () => {
        const col1W = contentWidth * 0.62;
        const col2X = margin + col1W + 14;
        const col2W = contentWidth - col1W - 14;
        const headerHue: [number, number, number] = [44, 62, 80];

        h.setY(margin);

        // Header strip
        doc.setFillColor(...headerHue);
        doc.rect(margin - 4, 0, contentWidth + 8, 70, 'F');
        h.writeText(personalInfo.name, margin, 26, { font: selectedFont, style: 'bold', size: 18, color: [255, 255, 255] });
        const jobt = cvData.experience[0]?.jobTitle || '';
        h.writeText(jobt, margin, 42, { font: selectedFont, size: 10, color: [180, 200, 220] });
        h.writeText([personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join('  ·  '), margin, 58, { font: selectedFont, size: 8.5, color: [160, 180, 200] });
        h.setY(78);

        // Summary
        h.writeText('PROFILE', margin, h.getY(), { font: selectedFont, style: 'bold', size: 8.5, color: headerHue });
        h.setY(h.getY() + 6);
        const sH = h.writeText(cvData.summary, margin, h.getY(), { font: selectedFont, size: 9, color: [45, 55, 72], width: col1W });
        h.setY(h.getY() + sH + 10);

        // Experience in left column
        h.writeText('EXPERIENCE', margin, h.getY(), { font: selectedFont, style: 'bold', size: 8.5, color: headerHue });
        doc.setDrawColor(...headerHue);
        doc.setLineWidth(0.5);
        doc.line(margin, h.getY() + 4, margin + col1W, h.getY() + 4);
        h.setY(h.getY() + 10);

        let expBottomY = h.getY();
        cvData.experience.forEach(job => {
            h.checkPageBreak(50, margin);
            h.writeText(job.jobTitle, margin, h.getY(), { font: selectedFont, style: 'bold', size: 9.5, color: [15, 23, 42] });
            h.setY(h.getY() + 10);
            h.writeText(`${job.company}  ·  ${job.dates}`, margin, h.getY(), { font: selectedFont, size: 8.5, color: [71, 85, 105] });
            h.setY(h.getY() + 10);
            job.responsibilities.forEach(r => {
                const rH = h.writeText(`• ${decodeHtmlEntities(r)}`, margin + 4, h.getY(), { font: selectedFont, size: 9, color: [45, 55, 72], width: col1W - 4 });
                h.setY(h.getY() + rH + 1.5);
            });
            h.setY(h.getY() + 8);
        });
        expBottomY = h.getY();

        // Right sidebar content (skills, edu, projects)
        let rightY = 78;
        const drawRight = (title: string, content: () => void) => {
            doc.setFont(selectedFont, 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(headerHue[0], headerHue[1], headerHue[2]);
            doc.text(title, col2X, rightY);
            rightY += 6;
            doc.setDrawColor(...headerHue);
            doc.setLineWidth(0.4);
            doc.line(col2X, rightY, col2X + col2W, rightY);
            rightY += 8;
            content();
            rightY += 10;
        };

        drawRight('SKILLS', () => {
            cvData.skills.slice(0, 15).forEach(skill => {
                doc.setFont(selectedFont, 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(45, 55, 72);
                const lines = doc.splitTextToSize(`• ${skill}`, col2W);
                doc.text(lines, col2X, rightY);
                rightY += lines.length * 10;
            });
        });

        drawRight('EDUCATION', () => {
            cvData.education.forEach(edu => {
                doc.setFont(selectedFont, 'bold');
                doc.setFontSize(9);
                doc.setTextColor(15, 23, 42);
                doc.text(edu.degree, col2X, rightY);
                rightY += 10;
                doc.setFont(selectedFont, 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(71, 85, 105);
                doc.text(`${edu.school}  ${edu.year}`, col2X, rightY);
                rightY += 12;
            });
        });

        if (cvData.languages?.length) {
            drawRight('LANGUAGES', () => {
                cvData.languages!.forEach(l => {
                    doc.setFont(selectedFont, 'normal');
                    doc.setFontSize(8.5);
                    doc.setTextColor(45, 55, 72);
                    doc.text(`${l.name}  (${l.proficiency})`, col2X, rightY);
                    rightY += 10;
                });
            });
        }

        if (cvData.projects?.length) {
            drawRight('PROJECTS', () => {
                cvData.projects!.slice(0, 3).forEach(p => {
                    doc.setFont(selectedFont, 'bold');
                    doc.setFontSize(9);
                    doc.setTextColor(15, 23, 42);
                    doc.text(p.name, col2X, rightY);
                    rightY += 10;
                    doc.setFont(selectedFont, 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(71, 85, 105);
                    const lines = doc.splitTextToSize(p.description, col2W);
                    doc.text(lines.slice(0, 3), col2X, rightY);
                    rightY += lines.slice(0, 3).length * 9 + 4;
                });
            });
        }
    };

    // ─── MODERN-TECH PDF ──────────────────────────────────────────────────────────
    // Vibrant split: deep violet sidebar, clean white main
    const modernTechPdf = () => {
        const violet: [number, number, number] = [88, 28, 135]; // violet-900
        const lightViolet: [number, number, number] = [167, 139, 250]; // violet-400
        const sideW = pageWidth * 0.32;

        // Sidebar
        doc.setFillColor(...violet);
        doc.rect(0, 0, sideW, pageHeight, 'F');

        // Photo space / avatar placeholder
        doc.setFillColor(...lightViolet);
        doc.circle(sideW / 2, 65, 38, 'F');
        doc.setFont(selectedFont, 'bold');
        doc.setFontSize(22);
        doc.setTextColor(255, 255, 255);
        const initials = personalInfo.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        doc.text(initials, sideW / 2, 72, { align: 'center' });

        // Sidebar name
        const nameLinesS = doc.splitTextToSize(personalInfo.name, sideW - 20);
        doc.setFontSize(13);
        doc.setTextColor(255, 255, 255);
        doc.text(nameLinesS, sideW / 2, 118, { align: 'center' });

        const jobt = cvData.experience[0]?.jobTitle || '';
        doc.setFontSize(9);
        doc.setTextColor(...lightViolet);
        doc.text(jobt, sideW / 2, 130 + (nameLinesS.length - 1) * 14, { align: 'center' });

        // Sidebar sections
        let sideY = 155 + (nameLinesS.length - 1) * 14;

        const sideSection = (title: string, items: string[]) => {
            if (!items.length) return;
            doc.setFont(selectedFont, 'bold');
            doc.setFontSize(8);
            doc.setTextColor(200, 180, 255);
            doc.text(title.toUpperCase(), 12, sideY);
            sideY += 6;
            doc.setDrawColor(120, 80, 200);
            doc.setLineWidth(0.5);
            doc.line(12, sideY, sideW - 12, sideY);
            sideY += 8;
            doc.setFont(selectedFont, 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(220, 210, 255);
            items.forEach(item => {
                if (sideY > pageHeight - 20) return;
                const ls = doc.splitTextToSize(item, sideW - 22);
                doc.text(ls, 12, sideY);
                sideY += ls.length * 10 + 2;
            });
            sideY += 8;
        };

        sideSection('Contact', [
            personalInfo.email,
            personalInfo.phone,
            personalInfo.location,
        ].filter(Boolean));

        sideSection('Skills', cvData.skills.slice(0, 15));

        if (cvData.languages?.length) {
            sideSection('Languages', cvData.languages.map(l => `${l.name}  (${l.proficiency})`));
        }

        if (cvData.education?.length) {
            sideSection('Education', cvData.education.map(e => `${e.degree}\n${e.school}, ${e.year}`));
        }

        // Main content
        const mainX = sideW + 20;
        const mainW = pageWidth - mainX - 20;
        let mainY = margin;

        const mainSec = (title: string) => {
            if (mainY > pageHeight - 50) { doc.addPage(); mainY = margin; }
            doc.setFont(selectedFont, 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...violet);
            doc.text(title.toUpperCase(), mainX, mainY);
            mainY += 5;
            doc.setDrawColor(...lightViolet);
            doc.setLineWidth(1.2);
            doc.line(mainX, mainY, mainX + mainW, mainY);
            mainY += 14;
        };

        mainSec('Profile');
        const sLines = doc.splitTextToSize(cvData.summary, mainW);
        doc.setFont(selectedFont, 'normal');
        doc.setFontSize(10);
        doc.setTextColor(45, 45, 65);
        doc.text(sLines, mainX, mainY);
        mainY += sLines.length * 12 + 14;

        mainSec('Experience');
        cvData.experience.forEach(job => {
            if (mainY > pageHeight - 60) { doc.addPage(); mainY = margin; }
            doc.setFont(selectedFont, 'bold');
            doc.setFontSize(11.5);
            doc.setTextColor(30, 15, 60);
            doc.text(job.jobTitle, mainX, mainY);
            doc.setFont(selectedFont, 'normal');
            doc.setFontSize(9);
            doc.setTextColor(100, 80, 150);
            doc.text(job.dates, mainX + mainW, mainY, { align: 'right' });
            mainY += 13;
            doc.setFont(selectedFont, 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...lightViolet);
            doc.text(job.company, mainX, mainY);
            mainY += 12;
            doc.setFont(selectedFont, 'normal');
            doc.setFontSize(10);
            doc.setTextColor(60, 55, 80);
            job.responsibilities.forEach(r => {
                const ls = doc.splitTextToSize(`• ${decodeHtmlEntities(r)}`, mainW - 6);
                doc.text(ls, mainX + 4, mainY);
                mainY += ls.length * 11 + 2;
            });
            mainY += 12;
        });

        if (cvData.projects?.length) {
            mainSec('Projects');
            cvData.projects.forEach(p => {
                if (mainY > pageHeight - 50) { doc.addPage(); mainY = margin; }
                doc.setFont(selectedFont, 'bold');
                doc.setFontSize(11);
                doc.setTextColor(30, 15, 60);
                doc.text(p.name, mainX, mainY);
                mainY += 12;
                const ls = doc.splitTextToSize(p.description, mainW);
                doc.setFont(selectedFont, 'normal');
                doc.setFontSize(10);
                doc.setTextColor(60, 55, 80);
                doc.text(ls, mainX, mainY);
                mainY += ls.length * 11 + 12;
            });
        }
    };

    switch (template) {
        case 'professional':
            professional();
            break;
        case 'corporate':
            corporatePdf();
            break;
        case 'elegant':
            elegantPdf();
            break;
        case 'executive':
            executivePdf();
            break;
        case 'classic':
            classic();
            break;
        case 'modern': {
            const sidebarRgb = hexToRgb(accentHex ?? '', [45, 55, 72]);
            twoColumn(sidebarRgb, sidebarRgb);
            break;
        }
        case 'twoColumnBlue': {
            const sidebarRgb = hexToRgb(accentHex ?? '', [30, 64, 175]);
            twoColumn(sidebarRgb, sidebarRgb);
            break;
        }
        case 'creative': {
            const sidebarRgb = hexToRgb(accentHex ?? '', [13, 148, 136]);
            twoColumn(sidebarRgb, sidebarRgb);
            break;
        }
        case 'software-engineer':
            softwareEngineerPdf();
            break;
        case 'minimalist':
            minimalist();
            break;
        case 'timeline':
            timelinePdf();
            break;
        case 'technical':
            technicalPdf();
            break;
        case 'compact':
            compactPdf();
            break;
        case 'modern-tech':
            modernTechPdf();
            break;
        case 'infographic':
            infographic();
            break;
        case 'standard-pro':
            standardProPdf();
            break;
        case 'harvard-gold':
            harvardGoldPdf();
            break;
        case 'tokyo-night':
            tokyoNightPdf();
            break;
        case 'paris-vibe':
            parisVibePdf();
            break;
        case 'london-finance':
            londonFinancePdf();
            break;
        case 'berlin-design':
            berlinDesignPdf();
            break;
        case 'silicon-valley':
            siliconValleyPdf();
            break;
        case 'sydney-creative':
            sydneyCreativePdf();
            break;
        case 'scholarship-pro':
            scholarshipProPdf();
            break;
        case 'medical-standard':
            medicalStandardPdf();
            break;
        default:
            professional();
    }

    // ── Additional Sections (appended for all templates) ──────────────────────
    // References (standard-pro handles references internally with its own serifFont)
    if (template !== 'standard-pro' && cvData.references && cvData.references.length > 0) {
        h.checkPageBreak(60, margin);
        drawSectionTitle('References', { yPos: h.getY(), font: selectedFont, lineWidth: 1 });

        cvData.references.forEach(ref => {
            h.checkPageBreak(55, margin);

            doc.setFont(selectedFont, 'bold');
            doc.setFontSize(10.5);
            doc.setTextColor(15, 23, 42);
            doc.text(ref.name, margin, h.getY());
            h.setY(h.getY() + 13);

            if (ref.title || ref.company) {
                const subtitle = [ref.title, ref.company].filter(Boolean).join(', ');
                doc.setFont(selectedFont, 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(71, 85, 105);
                const subtitleLines = doc.splitTextToSize(subtitle, contentWidth);
                doc.text(subtitleLines, margin, h.getY());
                h.setY(h.getY() + subtitleLines.length * 11);
            }
            if (ref.relationship) {
                doc.setFont(selectedFont, 'italic');
                doc.setFontSize(9);
                doc.setTextColor(100, 116, 139);
                doc.text(ref.relationship, margin, h.getY());
                h.setY(h.getY() + 11);
            }
            if (ref.email) {
                doc.setFont(selectedFont, 'normal');
                doc.setFontSize(9);
                doc.setTextColor(37, 99, 235);
                doc.text(ref.email, margin, h.getY());
                h.setY(h.getY() + 11);
            }
            if (ref.phone) {
                doc.setFont(selectedFont, 'normal');
                doc.setFontSize(9);
                doc.setTextColor(45, 55, 72);
                doc.text(ref.phone, margin, h.getY());
                h.setY(h.getY() + 11);
            }
            h.setY(h.getY() + 8);
        });
        h.setY(h.getY() + 5);
    }

    // Custom Sections
    if (cvData.customSections && cvData.customSections.length > 0) {
        cvData.customSections.forEach(section => {
            h.checkPageBreak(50, margin);
            drawSectionTitle(section.label, { yPos: h.getY(), font: selectedFont, lineWidth: 1 });

            section.items.forEach(item => {
                h.checkPageBreak(40, margin);
                const headerParts: string[] = [item.title];
                if (item.subtitle) headerParts.push(`— ${item.subtitle}`);

                doc.setFont(selectedFont, 'bold');
                doc.setFontSize(10.5);
                doc.setTextColor(15, 23, 42);

                if (item.year) {
                    const yearWidth = doc.getTextWidth(item.year) + 4;
                    doc.text(headerParts.join(' '), margin, h.getY(), { maxWidth: contentWidth - yearWidth });
                    doc.setFont(selectedFont, 'normal');
                    doc.setFontSize(9);
                    doc.setTextColor(100, 116, 139);
                    doc.text(item.year, pageWidth - margin, h.getY(), { align: 'right' });
                } else {
                    const titleLines = doc.splitTextToSize(headerParts.join(' '), contentWidth);
                    doc.text(titleLines, margin, h.getY());
                }
                h.setY(h.getY() + 13);

                if (item.description) {
                    doc.setFont(selectedFont, 'normal');
                    doc.setFontSize(9.5);
                    doc.setTextColor(45, 55, 72);
                    const descLines = doc.splitTextToSize(item.description, contentWidth);
                    doc.text(descLines, margin, h.getY());
                    h.setY(h.getY() + descLines.length * 11 + 4);
                }
                if (item.link) {
                    doc.setFont(selectedFont, 'normal');
                    doc.setFontSize(9);
                    doc.setTextColor(37, 99, 235);
                    doc.text(item.link, margin, h.getY());
                    h.setY(h.getY() + 11);
                }
                h.setY(h.getY() + 4);
            });
        });
    }

};


export const getCVAsPDFBytes = ({
    cvData,
    personalInfo,
    template,
    font,
    fileName = 'cv.pdf',
    jobDescription,
}: DownloadCVProps): ArrayBuffer => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', putOnlyUsedFonts: true });
    doc.setProperties({ title: fileName.replace('.pdf', '').replace(/_/g, ' '), author: personalInfo.name, subject: `CV`, creator: 'ProCV' });
    embedATSData(doc, jobDescription || '', doc.internal.pageSize.getWidth(), cvData);
    generatePdfForTemplate(template, doc, cvData, personalInfo, font);
    return doc.output('arraybuffer') as ArrayBuffer;
};

export const getCoverLetterAsPDFBytes = (
    letterText: string,
    personalInfo?: PersonalInfo
): ArrayBuffer => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const h = pdfHelpers(doc);
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 50;
    const usableWidth = pageWidth - 2 * margin;
    doc.setFont('Helvetica', 'normal');
    h.setY(margin);
    if (personalInfo) {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(18);
        h.writeText(personalInfo.name, margin, h.getY());
        h.setY(h.getY() + 18);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10);
        const info = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join(' | ');
        h.writeText(info, margin, h.getY(), { color: [100, 116, 139] });
        h.setY(h.getY() + 30);
    }
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(letterText, usableWidth);
    let currentY = h.getY();
    const lineHeight = doc.getFontSize() * 1.5;
    const pageHeight = doc.internal.pageSize.getHeight();
    lines.forEach((line: string) => {
        if (currentY > pageHeight - margin) { doc.addPage(); currentY = margin; }
        doc.text(line, margin, currentY);
        currentY += lineHeight;
    });
    return doc.output('arraybuffer') as ArrayBuffer;
};

export const downloadCVAsPDF = ({
    cvData,
    personalInfo,
    template,
    font,
    fileName = 'cv.pdf',
    jobDescription,
}: DownloadCVProps): boolean => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
        putOnlyUsedFonts: true,
    });

    // Set PDF properties for better metadata
    doc.setProperties({
        title: fileName.replace('.pdf', '').replace(/_/g, ' '),
        author: personalInfo.name,
        subject: `CV for ${cvData.experience[0]?.jobTitle || 'Job Application'}`,
        creator: 'ProCV'
    });

    // ATS Optimization: Enhanced embedding with keyword extraction
    // Embeds job description keywords + CV skills + job titles in multiple locations
    const wasEmbedded = embedATSData(doc, jobDescription || '', doc.internal.pageSize.getWidth(), cvData);

    generatePdfForTemplate(template, doc, cvData, personalInfo, font);

    doc.save(fileName);
    return wasEmbedded;
};


export const downloadCoverLetterAsPDF = (
    letterText: string,
    fileName: string = 'cover_letter.pdf',
    template: 'modern' | 'professional' | 'executive' | 'academic' | 'creative' = 'modern',
    personalInfo?: PersonalInfo
) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
    });

    const h = pdfHelpers(doc);
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 50;
    const usableWidth = pageWidth - 2 * margin;

    // Font selection based on template
    const fonts: Record<string, string> = {
        modern: 'Helvetica',
        professional: 'Times-Roman',
        executive: 'Times-Roman',
        academic: 'Times-Roman',
        creative: 'Helvetica'
    };
    const selectedFont = fonts[template] || 'Helvetica';
    doc.setFont(selectedFont, 'normal');

    h.setY(margin);

    // --- Header Section ---
    if (personalInfo) {
        if (template === 'executive' || template === 'professional') {
            // Centered elegant header
            doc.setFont(selectedFont, 'bold');
            doc.setFontSize(22);
            h.writeText(personalInfo.name, pageWidth / 2, h.getY(), { align: 'center' });
            h.setY(h.getY() + 15);

            doc.setFont(selectedFont, 'normal');
            doc.setFontSize(9);
            const contact = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join('  •  ');
            h.writeText(contact, pageWidth / 2, h.getY(), { align: 'center', color: [70, 70, 70] });
            h.setY(h.getY() + 12);

            const links = [personalInfo.linkedin, personalInfo.website, personalInfo.github].filter(Boolean).join('  •  ');
            if (links) {
                h.writeText(links, pageWidth / 2, h.getY(), { align: 'center', color: [40, 100, 200] });
                h.setY(h.getY() + 20);
            } else {
                h.setY(h.getY() + 10);
            }
            // Line separator
            doc.setDrawColor(200, 200, 200);
            doc.line(margin, h.getY(), pageWidth - margin, h.getY());
            h.setY(h.getY() + 30);
        } else if (template === 'creative') {
            // Left aligned with color block
            doc.setFillColor(79, 70, 229); // Indigo-600
            doc.rect(0, 0, 15, 120, 'F');

            doc.setFontSize(24);
            doc.setFont(selectedFont, 'bold');
            doc.setTextColor(30, 41, 59);
            h.writeText(personalInfo.name, margin, h.getY());
            h.setY(h.getY() + 20);

            doc.setFontSize(10);
            doc.setFont(selectedFont, 'normal');
            const info = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join(' | ');
            h.writeText(info, margin, h.getY(), { color: [100, 116, 139] });
            h.setY(h.getY() + 60);
        } else {
            // Modern/Academic standard left header
            doc.setFont(selectedFont, 'bold');
            doc.setFontSize(18);
            h.writeText(personalInfo.name, margin, h.getY());
            h.setY(h.getY() + 18);

            doc.setFont(selectedFont, 'normal');
            doc.setFontSize(10);
            h.writeText(personalInfo.email, margin, h.getY());
            h.setY(h.getY() + 13);
            if (personalInfo.phone) {
                h.writeText(personalInfo.phone, margin, h.getY());
                h.setY(h.getY() + 13);
            }
            if (personalInfo.location) {
                h.writeText(personalInfo.location, margin, h.getY());
                h.setY(h.getY() + 25);
            } else {
                h.setY(h.getY() + 15);
            }
        }
    }

    // --- Body Section ---
    doc.setFont(selectedFont, 'normal');
    doc.setFontSize(template === 'academic' ? 12 : 11);
    doc.setTextColor(30, 30, 30);

    const lines = doc.splitTextToSize(letterText, usableWidth);

    // Check for page breaks during text rendering
    let currentY = h.getY();
    const lineHeight = doc.getFontSize() * 1.5;
    const pageHeight = doc.internal.pageSize.getHeight();

    lines.forEach((line: string) => {
        if (currentY > pageHeight - margin) {
            doc.addPage();
            currentY = margin;
        }
        doc.text(line, margin, currentY);
        currentY += lineHeight;
    });

    doc.save(fileName);
};
