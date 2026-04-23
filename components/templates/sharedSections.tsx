import React from 'react';
import { CustomSection, Reference } from '../../types';

interface TemplateCustomSectionsProps {
  customSections?: CustomSection[];
  references?: Reference[];
  skipReferences?: boolean;
  renderHeader: (title: string) => React.ReactNode;
  sectionClassName?: string;
  titleClass?: string;
  subtitleClass?: string;
  descClass?: string;
  yearClass?: string;
  linkClass?: string;
  gridReferences?: boolean;
}

export const TemplateCustomSections: React.FC<TemplateCustomSectionsProps> = ({
  customSections,
  references,
  skipReferences = false,
  renderHeader,
  sectionClassName = 'mb-8',
  titleClass = 'font-semibold text-sm',
  subtitleClass = 'text-sm opacity-70',
  descClass = 'text-sm opacity-80 mt-0.5',
  yearClass = 'text-xs opacity-60',
  linkClass = 'text-xs underline opacity-70',
  gridReferences = true,
}) => {
  const filledRefs = !skipReferences && references
    ? references.filter(r => r.name?.trim())
    : [];

  const filledSections = customSections
    ? customSections.filter(s => s.items.some(i => i.title?.trim()))
    : [];

  if (filledRefs.length === 0 && filledSections.length === 0) return null;

  return (
    <>
      {filledRefs.length > 0 && (
        <section className={sectionClassName}>
          {renderHeader('References')}
          <div className={gridReferences ? 'grid grid-cols-2 gap-x-6 gap-y-3' : 'space-y-3'}>
            {filledRefs.map((ref, i) => (
              <div key={i}>
                <p className={titleClass}>{ref.name}</p>
                {(ref.title || ref.company) && (
                  <p className={subtitleClass}>
                    {[ref.title, ref.company].filter(Boolean).join(' · ')}
                  </p>
                )}
                {ref.relationship && <p className={subtitleClass}>{ref.relationship}</p>}
                {ref.email && <p className={descClass}>{ref.email}</p>}
                {ref.phone && <p className={descClass}>{ref.phone}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {filledSections.map(section => {
        const filledItems = section.items.filter(i => i.title?.trim());
        if (filledItems.length === 0) return null;
        return (
          <section key={section.id} className={sectionClassName}>
            {renderHeader(section.label)}
            <div className="space-y-2.5">
              {filledItems.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between items-baseline gap-2">
                    <span className={titleClass}>{item.title}</span>
                    {item.year && <span className={yearClass}>{item.year}</span>}
                  </div>
                  {item.subtitle && <p className={subtitleClass}>{item.subtitle}</p>}
                  {item.description && (
                    <p
                      className={descClass}
                      dangerouslySetInnerHTML={{ __html: item.description }}
                    />
                  )}
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      {item.link}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
};
