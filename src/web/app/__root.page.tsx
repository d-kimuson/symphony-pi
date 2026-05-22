import type { ReactNode } from 'react';

import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';

// TODO: Create QueryClientProviderWrapper, then import and wrap the shell body.
// import { QueryClientProviderWrapper } from '../lib/api/QueryClientProviderWrapper';
import appCss from '../styles.css?url';

const RootDocument = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* TODO: Wrap children with QueryClientProviderWrapper after creating the provider. */}
        {children}
        <Scripts />
      </body>
    </html>
  );
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Symphony' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // {Customize: add favicon, manifest, etc.}
    ],
  }),
  // {Customize: add notFoundComponent if needed}
  shellComponent: RootDocument,
});
