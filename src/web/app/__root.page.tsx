import type { ReactNode } from 'react';

import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';

import { TooltipProvider } from '../components/ui/tooltip';
import { QueryClientProviderWrapper } from '../lib/api/QueryClientProviderWrapper';

type RootDocumentProps = {
  children: ReactNode;
};

const RootDocument = ({ children }: RootDocumentProps) => {
  return (
    <>
      <HeadContent />
      <QueryClientProviderWrapper>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProviderWrapper>
      <Scripts />
    </>
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
