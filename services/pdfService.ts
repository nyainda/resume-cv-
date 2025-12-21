
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

    // ENHANCED ATS STRATEGY FOR AI-POWERED SCANNERS:
    // Modern ATS uses AI (GPT, Claude, etc.) that understands:
    // 1. Semantic context (not just keywords)
    // 2. Achievement patterns (quantified results)
    // 3. Role-requirement mapping
    // 4. Natural language structure
    // 5. Metadata tags and structured data

    const extractKeywords = (jobDesc: string): string[] => {
        // Remove common words and extract meaningful keywords
        const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'we', 'you', 'they', 'it']);

        const words = jobDesc.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3 && !commonWords.has(w));

        // Count frequency
        const freq: Record<string, number> = {};
        words.forEach(w => freq[w] = (freq[w] || 0) + 1);

        // Get top 30 keywords
        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([word]) => word);
    };

    // Calculate years of experience for AI context
    const calculateExperience = (): number => {
        if (!cvData?.experience || cvData.experience.length === 0) return 0;
        const totalMonths = cvData.experience.reduce((total, job) => {
            const start = new Date(job.startDate);
            const end = job.endDate.toLowerCase() === 'present' ? new Date() : new Date(job.endDate);
            const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
            return total + Math.max(0, months);
        }, 0);
        return Math.round(totalMonths / 12);
    };

    // Extract achievement patterns (numbers, percentages, metrics)
    const extractAchievements = (): string[] => {
        if (!cvData?.experience) return [];
        const achievements: string[] = [];
        cvData.experience.forEach(job => {
            job.responsibilities.forEach(resp => {
                const hasMetric = /\d+[%$]?|\$\d+|increased|improved|reduced|grew|achieved|delivered/i.test(resp);
                if (hasMetric) achievements.push(resp.substring(0, 100));
            });
        });
        return achievements.slice(0, 5);
    };

    // Build AI-optimized ATS text with semantic structure
    let atsText = '';

    // SECTION 1: Metadata tags (AI parsers look for these)
    atsText += '[CANDIDATE_PROFILE] ';

    // SECTION 2: Experience level (AI context)
    const yearsExp = calculateExperience();
    if (yearsExp > 0) atsText += `${yearsExp} years professional experience. `;

    // SECTION 3: Core competencies (semantic grouping)
    if (cvData?.skills && cvData.skills.length > 0) {
        atsText += '[CORE_SKILLS] ' + cvData.skills.join(', ') + '. ';
    }

    // SECTION 4: Role expertise (job titles as semantic markers)
    if (cvData?.experience && cvData.experience.length > 0) {
        atsText += '[ROLE_EXPERTISE] ' + cvData.experience.map(e => e.jobTitle).join(', ') + '. ';
    }

    // SECTION 5: Key achievements (AI loves quantified results)
    const achievements = extractAchievements();
    if (achievements.length > 0) {
        atsText += '[KEY_ACHIEVEMENTS] ' + achievements.join('. ') + '. ';
    }

    // SECTION 6: Job requirement keywords
    const keywords = extractKeywords(text);
    if (keywords.length > 0) {
        atsText += '[JOB_MATCH_KEYWORDS] ' + keywords.join(' ') + '. ';
    }

    // SECTION 7: Natural language context
    atsText += '[CANDIDATE_FIT] ';
    atsText += `Experienced professional with expertise in ${cvData?.skills?.slice(0, 3).join(', ') || 'multiple domains'}. `;
    atsText += `Proven track record in ${cvData?.experience?.[0]?.jobTitle || 'relevant field'}. `;

    // SECTION 8: Education context
    if (cvData?.education && cvData.education.length > 0) {
        atsText += '[EDUCATION] ' + cvData.education.map(e => `${e.degree} from ${e.school}`).join(', ') + '. ';
    }

    // SECTION 9: Job description match
    atsText += '[JOB_DESCRIPTION_MATCH] ' + text.substring(0, 400) + '. ';

    // SECTION 10: Candidate summary
    if (cvData?.summary) {
        atsText += '[CANDIDATE_SUMMARY] ' + cvData.summary.substring(0, 200) + '. ';
    }

    // Embed in multiple locations for redundancy
    doc.setTextColor(255, 255, 255); // White text (invisible)
    doc.setFontSize(2); // Size 2pt - readable by ATS but nearly invisible

    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 5;

    // Split text to fit page width
    const textLines = doc.splitTextToSize(atsText, pageWidth - 2 * margin);

    // Location 1: Top margin (primary AI scan area)
    doc.text(textLines.slice(0, 5), margin, margin + 5);

    // Location 2: Bottom margin (backup for AI parsers)
    doc.text(textLines.slice(5, 10), margin, pageHeight - margin - 15);

    // Location 3: Right margin (additional coverage)
    if (textLines.length > 10) {
        doc.text(textLines.slice(10, 15), pageWidth - margin - 2, margin + 20);
    }

    // Location 4: Left margin (some AI parsers scan edges)
    if (textLines.length > 15) {
        doc.text(textLines.slice(15, 18), margin, pageHeight / 2);
    }

    // Reset color
    doc.setTextColor(0, 0, 0);

    return true;
};

const fontMap: Record<FontName, string> = {
    'inter': 'Helvetica',
    'helvetica': 'Helvetica',
    'lora': 'Times-Roman',
    'times-new-roman': 'Times-Roman',
    'roboto-mono': 'Courier',
};


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

        // Decode each skill and join with bullet, matching Professional arrangement
        const text = skills.map(s => decodeHtmlEntities(s).trim()).filter(Boolean).join('  •  ');

        return h.writeText(text, xPos, yPos, { font: selectedFont, size: 10, color, width, align });
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

            // Use Skills Block for compact sidebar
            drawSidebarSection("Skills", () => {
                return h.writeText(cvData.skills.join(' • '), margin / 2, h.getY(), { font: selectedFont, size: 8, color: [255, 255, 255], width: sidebarWidth - margin });
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

        cvData.skills.forEach(skill => {
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

    switch (template) {
        case 'professional':
        case 'corporate':
        case 'elegant':
        case 'executive':
            professional();
            break;
        case 'classic':
            classic(); // Fix: Correctly call classic function
            break;
        case 'modern':
            twoColumn([45, 55, 72], [71, 85, 105]);
            break;
        case 'twoColumnBlue':
        case 'modern-tech':
            twoColumn([30, 64, 175], [30, 64, 175]);
            break;
        case 'creative':
            twoColumn([13, 148, 136], [13, 148, 136]);
            break;
        case 'software-engineer':
            softwareEngineerPdf();
            break;
        case 'minimalist':
        case 'timeline':
        case 'technical':
        case 'compact':
            minimalist();
            break;
        case 'infographic':
            infographic();
            break;
        default:
            professional();
    }
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
        creator: 'AI CV Builder'
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
    template: 'modern' | 'professional' = 'modern'
) => {
    const { jsPDF } = jspdf;
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
    });

    if (template === 'professional') {
        pdf.setFont('Times-Roman', 'normal');
    } else {
        pdf.setFont('Helvetica', 'normal');
    }

    pdf.setFontSize(11);

    const margin = 50;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const usableWidth = pageWidth - 2 * margin;

    const lines = pdf.splitTextToSize(letterText, usableWidth);

    pdf.text(lines, margin, margin);

    pdf.save(fileName);
};
