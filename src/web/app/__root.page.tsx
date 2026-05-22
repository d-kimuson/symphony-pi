import type { ReactNode } from 'react';

import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';

import { TooltipProvider } from '../components/ui/tooltip';
import { QueryClientProviderWrapper } from '../lib/api/QueryClientProviderWrapper';
import appCss from '../styles.css?url';

const RootDocument = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProviderWrapper>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryClientProviderWrapper>
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
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap',
      },
    ],
  }),
  shellComponent: RootDocument,
});
