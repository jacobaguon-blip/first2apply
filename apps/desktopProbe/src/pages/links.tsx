import { useEffect, useRef, useState } from 'react';

import { BrowserWindow, BrowserWindowHandle } from '@/components/browserWindow';
import { CreateCompanyTarget } from '@/components/createCompanyTarget';
import { CreateLink } from '@/components/createLink';
import { LinksList } from '@/components/linksList';
import { LinksListSkeleton } from '@/components/skeletons/linksListSkeleton';
import { useAppState } from '@/hooks/appState';
import { useError } from '@/hooks/error';
import { scanLink } from '@/lib/electronMainSdk';
import { throwError } from '@first2apply/core';
import { useLinks } from '@first2apply/ui';
import { toast } from '@first2apply/ui';

import { DefaultLayout } from './defaultLayout';

export function LinksPage() {
  const { handleError } = useError();
  const { isLoading, links, removeLink, updateLink, reloadLinks } = useLinks();
  const { isScanning } = useAppState();
  const browserWindowRef = useRef<BrowserWindowHandle>(null);
  const [currentDebugLinkId, setCurrentDebugLinkId] = useState<number | null>(null);

  // refresh links on component mount
  useEffect(() => {
    const asyncLoad = async () => {
      try {
        await reloadLinks();
      } catch (error) {
        handleError({ error });
      }
    };

    asyncLoad();
  }, []);

  // Delete an existing link
  const handleDeleteLink = async (linkId: number) => {
    try {
      await removeLink(linkId);
    } catch (error) {
      handleError({ error });
    }
  };

  const handleScanLinkNow = async (linkId: number) => {
    try {
      await scanLink(linkId);
      toast({
        title: 'Scanning URL in background ...',
        description: 'The link will be scanned in the background. You will be notified if there are new jobs.',
      });
    } catch (error) {
      handleError({ error });
    }
  };

  const handleDebugLink = async (linkId: number) => {
    try {
      await browserWindowRef.current?.open(links.find((l) => l.id === linkId)?.url ?? throwError('Link not found'));
      setCurrentDebugLinkId(linkId);
    } catch (error) {
      handleError({ error });
    }
  };

  const handleScanLink = async () => {
    try {
      const linkId = currentDebugLinkId ?? throwError('No link is being debugged');
      await scanLink(linkId);
      setCurrentDebugLinkId(null);
      await browserWindowRef.current?.finish();

      toast({
        title: 'Scanning URL in background ...',
        description: 'The link will be scanned in the background. You will be notified if there are new jobs.',
        // variant: 'success',
      });
    } catch (error) {
      handleError({ error });
    }
  };

  // update link
  const handleUpdateLink = async (data: { linkId: number; title: string; url: string }) => {
    try {
      await updateLink(data.linkId, { title: data.title, url: data.url });
    } catch (error) {
      handleError({ error });
    }
  };

  if (isLoading) {
    return (
      <DefaultLayout className="p-6 md:p-10">
        <LinksListSkeleton />
      </DefaultLayout>
    );
  }

  const hourlyLinks = links.filter((link) => link.scan_frequency !== 'daily');
  const dailyLinks = links.filter((link) => link.scan_frequency === 'daily');

  return (
    <DefaultLayout className="p-6 md:p-10">
      <div className="flex justify-between">
        <div className="flex items-end">
          <h1 className="text-2xl font-medium tracking-wide">Job Searches</h1>
          {isScanning && <span className="ml-4 pb-1 text-xs">( currently scanning for new jobs )</span>}
        </div>

        {links.length > 0 && <CreateLink />}
      </div>

      {links.length === 0 && (
        <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center">
          <h2 className="mb-10 w-3/5 whitespace-break-spaces break-normal text-center text-xl tracking-wide md:text-2xl xl:w-1/2">
            First 2 Apply periodically visits your <span className="whitespace-nowrap font-medium">pre-configured</span>{' '}
            job searches and fetches the list of jobs. If there are new jobs since the last visit, you will be notified.
          </h2>

          <div className="w-fit">
            <CreateLink />
          </div>
        </div>
      )}

      {hourlyLinks.length > 0 && (
        <LinksList
          links={hourlyLinks}
          onDeleteLink={handleDeleteLink}
          onDebugLink={handleDebugLink}
          onScanLink={handleScanLinkNow}
          onUpdateLink={handleUpdateLink}
        />
      )}

      <section className="mt-12">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-medium tracking-wide">Target Company Pages</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Company career pages crawled once per day (e.g. <span className="font-mono">anthropic.com/careers</span>).
            </p>
          </div>
          <CreateCompanyTarget />
        </div>

        {dailyLinks.length > 0 ? (
          <LinksList
            links={dailyLinks}
            onDeleteLink={handleDeleteLink}
            onDebugLink={handleDebugLink}
            onUpdateLink={handleUpdateLink}
          />
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            No target pages yet. Paste a company career URL to have it scanned once per day.
          </p>
        )}
      </section>

      <BrowserWindow
        ref={browserWindowRef}
        onClose={() => {}}
        customActionButton={{
          text: 'Retry',
          onClick: () => handleScanLink(),
          tooltip: 'Click to retry fetching jobs for this search',
        }}
      ></BrowserWindow>
    </DefaultLayout>
  );
}
