import { CopyIcon, InfoCircledIcon, Pencil1Icon, QuestionMarkCircledIcon, ReloadIcon, TrashIcon } from '@radix-ui/react-icons';
import { useMemo, useState } from 'react';
import ReactTimeAgo from 'react-time-ago';

import { AiFilterProfile, Link } from '@first2apply/core';
import { useSites } from '@first2apply/ui';
import { Avatar, AvatarFallback, AvatarImage } from '@first2apply/ui';
import { Button } from '@first2apply/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@first2apply/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@first2apply/ui';

import { EditLink } from './editLink';

const scrapeFailureThreshold = 3;

export function LinksList({
  links,
  onDeleteLink,
  onDebugLink,
  onScanLink,
  onUpdateLink,
  profiles,
  onUpdateLinkProfile,
}: {
  links: Link[];
  onDeleteLink: (linkId: number) => void;
  onDebugLink: (linkId: number) => void;
  onScanLink: (linkId: number) => void;
  onUpdateLink: (data: { linkId: number; title: string; url: string }) => Promise<void>;
  profiles: AiFilterProfile[];
  onUpdateLinkProfile: (linkId: number, filterProfileId: number | null) => Promise<void>;
}) {
  const { siteLogos, sites } = useSites();
  const sitesMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  const [editedLink, setEditedLink] = useState<Link | null>(null);

  const isInFailureState = (link: Link) => link.scrape_failure_count >= scrapeFailureThreshold;

  const defaultProfile = profiles.find((p) => p.is_default) ?? null;
  const NULL_SENTINEL = '__null__';

  const profileSelectValue = (link: Link): string => {
    if (link.filter_profile_id == null) return NULL_SENTINEL;
    const match = profiles.find((p) => p.id === link.filter_profile_id);
    return match ? String(match.id) : NULL_SENTINEL;
  };

  const onProfileChange = (link: Link, nextValue: string) => {
    const nextId = nextValue === NULL_SENTINEL ? null : Number(nextValue);
    if (nextId === (link.filter_profile_id ?? null)) return;
    void onUpdateLinkProfile(link.id, nextId);
  };

  return (
    <>
      <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:gap-6">
        {links.map((link) => {
          return (
            <li
              key={link.id}
              className={`flex cursor-pointer flex-col gap-4 rounded-lg border bg-card px-6 pb-6 pt-8 shadow-sm ${isInFailureState(link) ? 'border-destructive' : 'border-border'}`}
              onClick={() => {
                onDebugLink(link.id);
              }}
            >
              <div className="flex items-center gap-2">
                <Avatar
                  className="h-12 w-12 cursor-pointer"
                  onClick={() => {
                    onDebugLink(link.id);
                  }}
                >
                  <AvatarImage src={siteLogos[link.site_id]} />
                  <AvatarFallback className="text-xl tracking-wider">LI</AvatarFallback>
                </Avatar>

                <div>
                  <p className="p-0 text-sm text-muted-foreground">{sitesMap.get(link.site_id)?.name}</p>
                  <p className="text-balance text-lg leading-6">{link.title}</p>
                </div>
              </div>

              {/* <p className="mb-4 mt-6 grow whitespace-pre-wrap text-pretty break-all text-xs text-muted-foreground">
              {link.url}
            </p> */}

              {/* Filter profile selector */}
              <div className="flex items-center gap-2" onClick={(evt) => evt.stopPropagation()}>
                <label className="shrink-0 text-xs text-muted-foreground">Filter profile</label>
                <Select value={profileSelectValue(link)} onValueChange={(v) => onProfileChange(link, v)}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {defaultProfile ? (
                      <SelectItem value={NULL_SENTINEL}>
                        <span>— Default — </span>
                        <span className="text-muted-foreground">({defaultProfile.name})</span>
                      </SelectItem>
                    ) : (
                      <SelectItem value={NULL_SENTINEL}>
                        — No profile — <span className="text-muted-foreground">(AI filtering skipped)</span>
                      </SelectItem>
                    )}
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                        {p.is_default ? ' (default)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-help items-center">
                        <InfoCircledIcon className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-sm">
                      Searches with no profile selected fall back to your default profile. If no default is set, AI
                      filtering is skipped for those searches.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-light text-foreground/40">
                    {'Last checked '}
                    <ReactTimeAgo date={new Date(link.last_scraped_at)} locale="en-US" />
                  </p>
                  <p className="text-xs font-light text-foreground/40">
                    {'Added '}
                    <ReactTimeAgo date={new Date(link.created_at)} locale="en-US" />
                  </p>
                </div>

                {/* actions */}
                <div>
                  {isInFailureState(link) && (
                    <Button
                      variant="secondary"
                      size="default"
                      className="rounded-full px-2 py-1 text-sm"
                      onClick={(evt) => {
                        evt.stopPropagation();
                        onDebugLink(link.id);
                      }}
                    >
                      <QuestionMarkCircledIcon className="h-5 w-5 text-primary" />
                    </Button>
                  )}

                  {/* Scan now */}
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          size="default"
                          className="ml-2 rounded-full bg-secondary/50 px-[9px] py-2 text-sm transition-colors duration-200 ease-in-out hover:bg-secondary focus:bg-secondary"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            onScanLink(link.id);
                          }}
                        >
                          <ReloadIcon className="h-[18px] w-[18px]" />
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent side="left">Scan now</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Copy URL */}
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          size="default"
                          className="ml-2 rounded-full bg-secondary/50 px-[9px] py-2 text-sm transition-colors duration-200 ease-in-out hover:bg-secondary focus:bg-secondary"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            navigator.clipboard.writeText(link.url);
                          }}
                        >
                          <CopyIcon className="h-[18px] w-[18px]" />
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent side="left">Copy URL</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* edit search */}
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          size="default"
                          className="ml-2 rounded-full bg-secondary/50 px-[9px] py-2 text-sm transition-colors duration-200 ease-in-out hover:bg-secondary focus:bg-secondary"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            setEditedLink(link);
                          }}
                        >
                          <Pencil1Icon className="h-[18px] w-[18px]" />
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent side="left">Edit</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Button
                    variant="destructive"
                    size="default"
                    className="ml-2 rounded-full bg-destructive/10 px-2 py-1 text-sm transition-colors duration-200 ease-in-out hover:bg-destructive/20 focus:bg-destructive/20"
                    onClick={(evt) => {
                      evt.stopPropagation();
                      onDeleteLink(link.id);
                    }}
                  >
                    <TrashIcon className="h-5 w-5 text-destructive" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <EditLink
        isOpen={!!editedLink}
        link={editedLink}
        onUpdateLink={async (data) => {
          if (!editedLink) {
            return;
          }

          await onUpdateLink({ linkId: editedLink.id, title: data.title, url: data.url });
          setEditedLink(null);
        }}
        onCancel={() => {
          setEditedLink(null);
        }}
      />
    </>
  );
}
