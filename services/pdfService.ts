// This requires `jspdf` to be loaded globally, which is done in index.html
import { CVData, PersonalInfo, TemplateName } from '../types';

declare const jspdf: any;

interface DownloadCVProps {
    cvData: CVData;
    personalInfo: PersonalInfo;
    template: TemplateName;
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

const embedATSData = (doc: any, text: string, pageWidth: number) => {
    if (text && text.trim()) {
        doc.setTextColor(255, 255, 255); // White text
        doc.setFontSize(1);
        const textLines = doc.splitTextToSize(text, pageWidth);
        doc.text(textLines, 0, 0); // Put it at the very top left
        doc.setTextColor(0,0,0); // Reset color
    }
};

const generatePdfForTemplate = (
    template: TemplateName, 
    doc: any, 
    cvData: CVData, 
    personalInfo: PersonalInfo
) => {
    const h = pdfHelpers(doc);
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    const contentWidth = pageWidth - 2 * margin;

    // Common function to draw a section title
    const drawSectionTitle = (title: string, options: any = {}) => {
        const { yPos, xPos = margin, width = contentWidth, font = 'Helvetica', size = 10, style = 'bold', color = [30, 41, 59], align = 'left', lineColor = [203, 213, 224], lineWidth = 0.5, yMarginBottom = 20, yMarginTop = 15 } = options;
        h.setY(yPos + yMarginTop);
        h.checkPageBreak(size + yMarginBottom, margin);
        
        h.writeText(title.toUpperCase(), xPos, h.getY(), { font, size, style, color, align, width });
        h.setY(h.getY() + size * 0.5);

        if (lineWidth > 0) {
            doc.setDrawColor(lineColor[0], lineColor[1], lineColor[2]);
            doc.setLineWidth(lineWidth);
            let lineX = xPos;
            if(align === 'center') lineX = (pageWidth / 2) - width/2;
            if(align === 'right') lineX = xPos - width;
            doc.line(lineX, h.getY(), lineX + width, h.getY());
        }
        h.setY(h.getY() + yMarginBottom);
    };

    // --- TEMPLATE-SPECIFIC IMPLEMENTATIONS ---
    
    const drawLanguagesSection = (yPos: number, drawTitle: (title: string, opts: any) => void, opts: any = {}) => {
        if (!cvData.languages || cvData.languages.length === 0) return;
        drawTitle("Languages", { yPos, ...opts.title });
        const langText = cvData.languages.map(l => `${l.name} (${l.proficiency})`).join(' • ');
        const height = h.writeText(langText, margin, h.getY(), { font: 'Times-Roman', size: 11, color: [45, 55, 72], width: contentWidth, ...opts.text });
        h.setY(h.getY() + height + 10);
    };
    
    const professional = () => {
        h.setY(margin);
        
        h.writeText(personalInfo.name, pageWidth / 2, h.getY(), { font: 'Times-Roman', style: 'bold', size: 30, color: [15, 23, 42], align: 'center' });
        h.setY(h.getY() + 25);
        const contactInfo = [personalInfo.email, personalInfo.phone, personalInfo.location].filter(Boolean).join('  |  ');
        h.writeText(contactInfo, pageWidth / 2, h.getY(), { font: 'Times-Roman', size: 10, color: [71, 85, 105], align: 'center' });
        h.setY(h.getY() + 15);
        const links = [personalInfo.linkedin, personalInfo.website, personalInfo.github].filter(Boolean).join('  |  ');
        h.writeText(links, pageWidth / 2, h.getY(), { font: 'Times-Roman', size: 10, color: [37, 99, 235], align: 'center' });
        h.setY(h.getY() + 20);

        doc.setDrawColor(203, 213, 224);
        doc.setLineWidth(1.5);
        doc.line(margin, h.getY(), pageWidth - margin, h.getY());
        
        drawSectionTitle("Professional Summary", { yPos: h.getY(), font: 'Times-Roman', lineWidth: 0.5 });
        const summaryHeight = h.writeText(cvData.summary, margin, h.getY(), { font: 'Times-Roman', size: 11, color: [45, 55, 72], width: contentWidth });
        h.setY(h.getY() + summaryHeight + 10);
        
        drawSectionTitle("Experience", { yPos: h.getY(), font: 'Times-Roman', lineWidth: 0.5 });
        cvData.experience.forEach(job => {
            h.checkPageBreak(80, margin);
            h.writeText(job.jobTitle, margin, h.getY(), { font: 'Times-Roman', style: 'bold', size: 14, color: [15, 23, 42] });
            h.writeText(job.dates, pageWidth - margin, h.getY(), { font: 'Times-Roman', size: 10, color: [71, 85, 105], align: 'right' });
            h.setY(h.getY() + 16);
            h.writeText(job.company, margin, h.getY(), { font: 'Times-Roman', style: 'bold', size: 12, color: [45, 55, 72] });
            h.setY(h.getY() + 18);
            job.responsibilities.forEach(resp => {
                const bulletPoint = `• ${decodeHtmlEntities(resp)}`;
                const respHeight = h.writeText(bulletPoint, margin + 5, h.getY(), { font: 'Times-Roman', size: 11, color: [45, 55, 72], width: contentWidth - 10 });
                h.checkPageBreak(respHeight + 4, margin);
                h.setY(h.getY() + respHeight + 4);
            });
            h.setY(h.getY() + 25);
        });

        drawSectionTitle("Skills", { yPos: h.getY(), font: 'Times-Roman', lineWidth: 0.5 });
        const skillsText = cvData.skills.join(' • ');
        const skillsHeight = h.writeText(skillsText, margin, h.getY(), { font: 'Times-Roman', size: 11, color: [45, 55, 72], width: contentWidth });
        h.setY(h.getY() + skillsHeight + 10);
        
        drawLanguagesSection(h.getY(), drawSectionTitle, { title: { font: 'Times-Roman', lineWidth: 0.5 }});
        
        drawSectionTitle("Education", { yPos: h.getY(), font: 'Times-Roman', lineWidth: 0.5 });
        cvData.education.forEach(edu => {
            h.checkPageBreak(60, margin);
            h.writeText(edu.degree, margin, h.getY(), { font: 'Times-Roman', style: 'bold', size: 14, color: [15, 23, 42] });
            h.writeText(edu.year, pageWidth - margin, h.getY(), { font: 'Times-Roman', size: 10, color: [71, 85, 105], align: 'right' });
            h.setY(h.getY() + 16);
            h.writeText(edu.school, margin, h.getY(), { font: 'Times-Roman', size: 12, color: [45, 55, 72] });
            h.setY(h.getY() + 14);
            if (edu.description) {
                const descHeight = h.writeText(edu.description, margin, h.getY(), { font: 'Times-Roman', style: 'italic', size: 10, color: [71, 85, 105], width: contentWidth });
                h.setY(h.getY() + descHeight + 5);
            }
            h.setY(h.getY() + 20);
        });
    };
    
    const twoColumn = (sidebarColor: [number, number, number], mainColor: [number, number, number]) => {
        const sidebarWidth = pageWidth * 0.33;
        const mainContentX = sidebarWidth + margin / 2;
        const mainContentWidth = pageWidth - sidebarWidth - margin;
        
        const drawSidebar = (startY: number) => {
            doc.setFillColor(sidebarColor[0], sidebarColor[1], sidebarColor[2]);
            doc.rect(0, 0, sidebarWidth, pageHeight, 'F');
            h.setY(startY);

            const nameHeight = h.writeText(personalInfo.name, sidebarWidth / 2, h.getY(), { size: 22, style: 'bold', color: [255, 255, 255], width: sidebarWidth - margin, align: 'center' });
            h.setY(h.getY() + nameHeight + 20);

            const drawSidebarSection = (title: string, items: string[], isList: boolean = false) => {
                if (h.getY() > pageHeight - 100 || !items || items.length === 0) return;
                h.setY(h.getY() + 15);
                h.writeText(title.toUpperCase(), margin / 2, h.getY(), { size: 10, style: 'bold', color: [220, 220, 220], width: sidebarWidth - margin });
                h.setY(h.getY() + 5);
                doc.setDrawColor(100, 116, 139);
                doc.setLineWidth(0.5);
                doc.line(margin / 2, h.getY(), sidebarWidth - margin / 2, h.getY());
                h.setY(h.getY() + 15);
                
                items.forEach(item => {
                    const prefix = isList ? `• ${item}` : item;
                    const itemHeight = h.writeText(prefix, margin / 2, h.getY(), { size: 9, color: [255, 255, 255], width: sidebarWidth - margin });
                    h.setY(h.getY() + itemHeight + 2);
                });
            };
            const contactItems = [personalInfo.email, personalInfo.phone, personalInfo.location, personalInfo.linkedin, personalInfo.website, personalInfo.github].filter(Boolean) as string[];
            drawSidebarSection("Contact", contactItems);
            drawSidebarSection("Skills", cvData.skills, true);
            drawSidebarSection("Languages", cvData.languages?.map(l => `${l.name}: ${l.proficiency}`));
            drawSidebarSection("Education", cvData.education.map(e => `${e.degree}\n${e.school}\n${e.year}`));
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
            h.writeText(title.toUpperCase(), mainContentX, mainY, { size: 14, style: 'bold', color: mainColor });
            mainY += 8;
            doc.setDrawColor(mainColor[0], mainColor[1], mainColor[2]);
            doc.setLineWidth(1);
            doc.line(mainContentX, mainY, pageWidth - margin / 2, mainY);
            mainY += 22;
        };

        drawMainSectionTitle("Professional Summary");
        const summaryHeight = h.writeText(cvData.summary, mainContentX, mainY, { size: 10, width: mainContentWidth, color: [45, 55, 72] });
        mainY += summaryHeight + 20;

        drawMainSectionTitle("Experience");
        cvData.experience.forEach(job => {
            checkMainPageBreak(80);
            h.writeText(job.jobTitle, mainContentX, mainY, { size: 11, style: 'bold', color: [30, 41, 59] });
            h.writeText(job.dates, pageWidth - margin / 2, mainY, { size: 9, color: [100, 116, 139], align: 'right' });
            mainY += 14;
            h.writeText(job.company, mainContentX, mainY, { size: 10, style: 'bold', color: [45, 55, 72] });
            mainY += 12;
            job.responsibilities.forEach(resp => {
                const bulletPoint = `• ${decodeHtmlEntities(resp)}`;
                const respHeight = h.writeText(bulletPoint, mainContentX + 5, mainY, { size: 10, width: mainContentWidth - 10, color: [45, 55, 72] });
                checkMainPageBreak(respHeight + 4);
                mainY += respHeight + 4;
            });
            mainY += 25;
        });
    };

    const minimalist = () => {
        h.setY(margin * 1.5);
        
        h.writeText(personalInfo.name, margin, h.getY(), { size: 40, style: 'bold', color: [15, 23, 42] });
        h.setY(h.getY() + 30);
        const contactInfo = [personalInfo.email, personalInfo.phone, personalInfo.location, personalInfo.linkedin].filter(Boolean).join('  ·  ');
        h.writeText(contactInfo, margin, h.getY(), { size: 10, color: [71, 85, 105] });
        h.setY(h.getY() + 40);

        const drawMinSection = (title: string) => drawSectionTitle(title, { yPos: h.getY(), xPos: margin, size: 9, style: 'bold', color: [100, 116, 139], yMarginBottom: 15, yMarginTop: 0, lineWidth: 0 });

        drawMinSection("Profile");
        const summaryHeight = h.writeText(cvData.summary, margin, h.getY(), { size: 10, width: contentWidth, color: [45, 55, 72] });
        h.setY(h.getY() + summaryHeight + 10);
        
        drawMinSection("Experience");
        const dateWidth = 80;
        const expContentWidth = contentWidth - dateWidth - 15;
        cvData.experience.forEach(job => {
            h.checkPageBreak(80, margin);
            const startExpY = h.getY();
            h.writeText(job.dates, margin, startExpY, { size: 10, style: 'bold', color: [45, 55, 72], width: dateWidth });
            
            let expY = startExpY;
            expY += h.writeText(job.jobTitle, margin + dateWidth + 15, expY, { size: 11, style: 'bold', color: [30, 41, 59] });
            expY += h.writeText(job.company, margin + dateWidth + 15, expY, { size: 10, color: [71, 85, 105] });
            expY += 4;
            let totalRespHeight = 0;
            job.responsibilities.forEach(resp => {
                const bulletPoint = `• ${decodeHtmlEntities(resp)}`;
                const respHeight = h.writeText(bulletPoint, margin + dateWidth + 20, expY + totalRespHeight, { size: 10, width: expContentWidth - 10, color: [45, 55, 72] });
                totalRespHeight += respHeight + 4;
            });
            h.setY(Math.max(startExpY + 20, expY + totalRespHeight + 15));
        });

        drawLanguagesSection(h.getY(), drawMinSection);
    };

    const softwareEngineerPdf = () => {
        const localMargin = 50;
        const localContentWidth = pageWidth - 2 * localMargin;
        h.setY(localMargin);

        // Header
        doc.setFont('Helvetica', 'bold');
        h.writeText(personalInfo.name, pageWidth / 2, h.getY(), { size: 36, align: 'center' });
        h.setY(h.getY() + 30);
        
        doc.setFont('Helvetica', 'normal');
        const contactInfo = [personalInfo.location, personalInfo.phone, personalInfo.email].filter(Boolean).join('  |  ');
        h.writeText(contactInfo, pageWidth / 2, h.getY(), { size: 10, align: 'center', color: [100, 116, 139] });
        h.setY(h.getY() + 15);
        
        const linksInfo = [personalInfo.linkedin, personalInfo.github, personalInfo.website].filter(Boolean);
        if (linksInfo.length > 0) {
            const linksString = linksInfo.join('  |  ');
            h.writeText(linksString, pageWidth / 2, h.getY(), { size: 10, color: [37, 99, 235], align: 'center' });
        }
        h.setY(h.getY() + 30);

        const drawSESectionTitle = (title: string) => {
            h.checkPageBreak(40, localMargin);
            h.writeText(title.toUpperCase(), localMargin, h.getY(), { size: 12, style: 'bold', color: [51, 65, 85] });
            h.setY(h.getY() + 8);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(1.5);
            doc.line(localMargin, h.getY(), pageWidth - localMargin, h.getY());
            h.setY(h.getY() + 20);
        };

        drawSESectionTitle("Summary");
        const summaryHeight = h.writeText(cvData.summary, localMargin, h.getY(), { size: 10, width: localContentWidth, color: [30, 41, 59] });
        h.setY(h.getY() + summaryHeight + 10);
        
        drawSESectionTitle("Skills");
        doc.setFont('Courier', 'normal');
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
        h.setY(y + skillHeight + 10);

        drawSESectionTitle("Experience");
        cvData.experience.forEach(job => {
            h.checkPageBreak(70, localMargin);
            h.writeText(job.jobTitle, localMargin, h.getY(), { font: 'Helvetica', size: 14, style: 'bold', color: [15, 23, 42] });
            h.writeText(job.dates, pageWidth - localMargin, h.getY(), { font: 'Helvetica', size: 10, color: [100, 116, 139], align: 'right' });
            h.setY(h.getY() + 16);
            h.writeText(job.company, localMargin, h.getY(), { font: 'Helvetica', size: 11, style: 'bold', color: [71, 85, 105] });
            h.setY(h.getY() + 14);
            job.responsibilities.forEach(resp => {
                const bulletPoint = `• ${decodeHtmlEntities(resp)}`;
                const respHeight = h.writeText(bulletPoint, localMargin + 10, h.getY(), { font: 'Helvetica', size: 10, width: localContentWidth - 10, color: [51, 65, 85] });
                h.checkPageBreak(respHeight + 4, localMargin);
                h.setY(h.getY() + respHeight + 4);
            });
            h.setY(h.getY() + 20);
        });

        if (cvData.projects && cvData.projects.length > 0) {
            drawSESectionTitle("Projects");
            cvData.projects.forEach(proj => {
                 h.checkPageBreak(40, localMargin);
                 const startProjY = h.getY();
                 h.writeText(proj.name, localMargin, startProjY, { font: 'Helvetica', size: 14, style: 'bold' });
                 const nameWidth = doc.getTextWidth(proj.name);
                 if (proj.link) {
                    h.writeText('[Link]', localMargin + nameWidth + 5, startProjY, { font: 'Helvetica', size: 10, color: [37, 99, 235], link: proj.link });
                 }
                 h.setY(startProjY + 16);
                 const descHeight = h.writeText(proj.description, localMargin, h.getY(), { font: 'Helvetica', size: 10, width: localContentWidth, color: [51, 65, 85] });
                 h.setY(h.getY() + descHeight + 15);
            });
        }
        
        if (cvData.education && cvData.education.length > 0) {
            drawSESectionTitle("Education");
            cvData.education.forEach(edu => {
                h.checkPageBreak(40, localMargin);
                h.writeText(edu.degree, localMargin, h.getY(), { font: 'Helvetica', size: 14, style: 'bold', color: [15, 23, 42] });
                h.writeText(edu.year, pageWidth - localMargin, h.getY(), { font: 'Helvetica', size: 10, color: [100, 116, 139], align: 'right' });
                h.setY(h.getY() + 16);
                h.writeText(edu.school, localMargin, h.getY(), { font: 'Helvetica', size: 11, color: [71, 85, 105] });
                h.setY(h.getY() + 25);
            });
        }

        if (cvData.languages && cvData.languages.length > 0) {
            drawSESectionTitle("Languages");
            const langText = cvData.languages.map(l => `${l.name} (${l.proficiency})`).join('  •  ');
            const langHeight = h.writeText(langText, localMargin, h.getY(), { size: 10, width: localContentWidth, color: [30, 41, 59] });
            h.setY(h.getY() + langHeight + 10);
        }
    };


    const classic = () => {
        h.setY(margin);
        h.writeText(personalInfo.name, margin, h.getY(), { font: 'Times-Roman', style: 'bold', size: 36 });
        h.setY(h.getY() + 30);
        doc.setLineWidth(0.5);
        doc.line(margin, h.getY(), pageWidth - margin, h.getY());
        h.setY(h.getY() + 10);
        const contactInfo = [personalInfo.email, personalInfo.phone, personalInfo.location, personalInfo.linkedin].filter(Boolean).join(' | ');
        h.writeText(contactInfo, margin, h.getY(), { font: 'Times-Roman', size: 10 });
        h.setY(h.getY() + 30);

        const drawClassicSection = (title: string) => drawSectionTitle(title, { yPos: h.getY(), font: 'Times-Roman', align: 'center', lineWidth: 0.5, width: 80, yMarginTop: 10 });
        
        drawClassicSection("Summary");
        const summaryHeight = h.writeText(cvData.summary, pageWidth/2, h.getY(), { font: 'Times-Roman', width: contentWidth, align: 'center', size: 11 });
        h.setY(h.getY() + summaryHeight);
        
        drawClassicSection("Experience");
        // implementation similar to professional
    };
    
    const infographic = () => {
        // This is a complex visual template
        // For simplicity, we'll draw basic shapes.
        doc.setFillColor(30, 58, 138); // Dark blue background
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        
        h.setY(margin);
        h.writeText(personalInfo.name, pageWidth/2, h.getY(), { size: 30, color: [255,255,255], align: 'center' });
        h.setY(h.getY() + 40);

        // Skills with progress bars
        let skillY = h.getY();
        cvData.skills.slice(0, 5).forEach((skill, i) => {
            h.writeText(skill, margin, skillY + i*30, { color: [255,255,255] });
            doc.setFillColor(156, 163, 175);
            doc.rect(margin + 100, skillY + i*30 - 5, 100, 8, 'F');
            doc.setFillColor(37, 99, 235);
            doc.rect(margin + 100, skillY + i*30 - 5, 80, 8, 'F'); // Example 80%
        });
    };

    switch (template) {
        case 'professional':
        case 'corporate':
        case 'elegant':
        case 'executive':
        case 'classic':
             professional();
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


export const downloadCVAsPDF = async ({
    cvData,
    personalInfo,
    template,
    fileName = 'cv.pdf',
    jobDescription,
}: DownloadCVProps) => {
    const { jsPDF } = jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
        putOnlyUsedFonts: true,
    });
    
    embedATSData(doc, jobDescription || '', doc.internal.pageSize.getWidth());

    generatePdfForTemplate(template, doc, cvData, personalInfo);
    
    doc.save(fileName);
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