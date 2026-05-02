const BLOCKED_TAGS = ['script', 'iframe', 'object', 'embed', 'link', 'meta'];

const isUnsafeUrl = (value: string): boolean => {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return true;
  // Allow inline images but block other data URLs.
  if (v.startsWith('data:') && !v.startsWith('data:image/')) return true;
  return false;
};

export const sanitizeHtml = (html: string): string => {
  if (!html) return '';
  if (typeof document === 'undefined') {
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+=(["']).*?\1/gi, '');
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  for (const tag of BLOCKED_TAGS) {
    template.content.querySelectorAll(tag).forEach(node => node.remove());
  }

  template.content.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value || '';
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        return;
      }
      if ((name === 'href' || name === 'src' || name === 'xlink:href') && isUnsafeUrl(value)) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return template.innerHTML;
};
