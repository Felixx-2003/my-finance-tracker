import type { Metadata } from 'next';
import './globals.css';
import './theme.css';

export const metadata: Metadata = { title: 'MyFinance', description: 'A personal finance tracker built for everyday use.' };
const extensionAttributeCleanup = `(() => {
  const attribute = 'bis_skin_checked';
  const clean = (root) => {
    if (root.nodeType === 1 && root.hasAttribute(attribute)) root.removeAttribute(attribute);
    root.querySelectorAll?.('[' + attribute + ']').forEach(node => node.removeAttribute(attribute));
  };
  clean(document);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') clean(record.target);
      else record.addedNodes.forEach(clean);
    }
  }).observe(document, {subtree:true, childList:true, attributes:true, attributeFilter:[attribute]});
})();`;

export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:extensionAttributeCleanup}}/></head><body suppressHydrationWarning>{children}</body></html>; }
