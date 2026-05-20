import { LayoutGridIcon, ListIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { BrowserWindow, BrowserWindowHandle } from '@/components/browserWindow';
import { BulkAddFromPage } from '@/components/bulkAddFromPage';
import { CreateCompanyTarget } from '@/components/createCompanyTarget';
import { CreateLink } from '@/components/createLink';
import { LinksList } from '@/components/linksList';
import { PendingFromIphone } from '@/components/pendingFromIphone';
import { LinksListSkeleton } from '@/components/skeletons/linksListSkeleton';
import { useAppState } from '@/hooks/appState';
import { useError } from '@/hooks/error';
import { listFilterProfiles, scanAllMyLinks, scanLink } from '@/lib/electronMainSdk';
import { AiFilterProfile, throwError } from '@first2apply/core';
import { useLinks } from '@first2apply/ui';
import { Button, toast } from '@first2apply/ui';

import { DefaultLayout } from './defaultLayout';

export function LinksPage() {
  const { handleError } = useError();
  const { isLoading, links, removeLink, updateLink, reloadLinks } = useLinks();
  const { isScanning } = useAppState();
  const browserWindowRef = useRef<BrowserWindowHandle>(null);
  const [currentDebugLinkId, setCurrentDebugLinkId] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<AiFilterProfile[]>([]);
  const [targetViewMode, setTargetViewMode] = useState<'card' | 'list'>(
    () => (localStorage.getItem('targetPagesViewMode') as 'card' | 'list') || 'card',
  );

  useEffect(() => {
    localStorage.setItem('targetPagesViewMode', targetViewMode);
  }, [targetViewMode]);

  // refresh links on component mount
  useEffect(() => {
    const asyncLoad = async () => {
      try {
        const [, loadedProfiles] = await Promise.all([reloadLinks(), listFilterProfiles()]);
        setProfiles(loadedProfiles);
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
      const { triggeredVia } = await scanLink(linkId);
      toast({
        title: triggeredVia === 'pi' ? 'Pi is scanning ...' : 'Scanning locally ...',
        description:
          triggeredVia === 'pi'
            ? 'The Raspberry Pi will scan this link and surface new jobs shortly.'
            : 'Pi unreachable; scanning on this machine instead.',
      });
    } catch (error) {
      handleError({ error });
    }
  };

  const handleScanAllNow = async () => {
    try {
      const { triggeredVia } = await scanAllMyLinks();
      toast({
        title: triggeredVia === 'pi' ? 'Pi is scanning all your links ...' : 'Scanning all your links locally ...',
        description:
          triggeredVia === 'pi'
            ? 'New jobs from your searches and target pages will appear shortly.'
            : 'Pi unreachable; scanning on this machine instead.',
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

  // update a link's filter profile assignment
  const handleUpdateLinkProfile = async (linkId: number, filterProfileId: number | null) => {
    try {
      await updateLink(linkId, { filter_profile_id: filterProfileId });
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

        {links.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" className="px-6 text-base" onClick={handleScanAllNow} disabled={isScanning}>
              Scan all now
            </Button>
            <CreateLink profiles={profiles} />
          </div>
        )}
      </div>

      {links.length === 0 && (
        <div className="flex h-[calc(100vh-200px)] flex-col items-center justify-center">
          <h2 className="mb-10 w-3/5 whitespace-break-spaces break-normal text-center text-xl tracking-wide md:text-2xl xl:w-1/2">
            First 2 Apply periodically visits your <span className="whitespace-nowrap font-medium">pre-configured</span>{' '}
            job searches and fetches the list of jobs. If there are new jobs since the last visit, you will be notified.
          </h2>

          <div className="w-fit">
            <CreateLink profiles={profiles} />
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
          profiles={profiles}
          onUpdateLinkProfile={handleUpdateLinkProfile}
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
          <div className="flex items-center gap-2">
            {dailyLinks.length > 0 && (
              <div className="flex items-center rounded-md border border-border bg-card p-0.5">
                <Button
                  variant={targetViewMode === 'card' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setTargetViewMode('card')}
                  title="Card view"
                >
                  <LayoutGridIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant={targetViewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setTargetViewMode('list')}
                  title="List view"
                >
                  <ListIcon className="h-4 w-4" />
                </Button>
              </div>
            )}
            <CreateCompanyTarget />
            <BulkAddFromPage />
          </div>
        </div>

        {dailyLinks.length > 0 ? (
          <LinksList
            links={dailyLinks}
            onDeleteLink={handleDeleteLink}
            onDebugLink={handleDebugLink}
            onScanLink={handleScanLinkNow}
            onUpdateLink={handleUpdateLink}
            profiles={profiles}
            onUpdateLinkProfile={handleUpdateLinkProfile}
            viewMode={targetViewMode}
          />
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            No target pages yet. Paste a company career URL to have it scanned once per day.
          </p>
        )}
      </section>

      <PendingFromIphone />

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
