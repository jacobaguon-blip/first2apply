import { CheckIcon, Cross2Icon, InfoCircledIcon, MinusCircledIcon, PlusIcon } from '@radix-ui/react-icons';
import { useEffect, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import { PricingOptions } from '@/components/pricingOptions';
import { FiltersSkeleton } from '@/components/skeletons/filtersSkeleton';
import { useError } from '@/hooks/error';
import { useSession } from '@/hooks/session';
import {
  createFilterProfile,
  deleteFilterProfile,
  getGlobalBlacklist,
  listFilterProfiles,
  openExternalUrl,
  setDefaultFilterProfile,
  updateFilterProfile,
  updateGlobalBlacklist,
} from '@/lib/electronMainSdk';
import { AiFilterProfile, StripeBillingPlan, SubscriptionTier } from '@first2apply/core';
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Input,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useToast,
} from '@first2apply/ui';

import { DefaultLayout } from './defaultLayout';

export function FiltersPage() {
  const { handleError } = useError();
  const { toast } = useToast();
  const { profile, stripeConfig, refreshProfile } = useSession();

  const [profiles, setProfiles] = useState<AiFilterProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [globalBlacklist, setGlobalBlacklist] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasCreatedProfile, setHasCreatedProfile] = useState<boolean>(false);
  const [isSubscriptionDialogOpen, setSubscriptionDialogOpen] = useState<boolean>(false);

  // dialog state for delete confirm
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // initial load
  useEffect(() => {
    const asyncLoad = async () => {
      try {
        const [loadedProfiles, loadedGlobal] = await Promise.all([listFilterProfiles(), getGlobalBlacklist()]);
        const safeProfiles = loadedProfiles ?? [];
        setProfiles(safeProfiles);
        setGlobalBlacklist(loadedGlobal ?? []);
        const def = safeProfiles.find((p) => p.is_default);
        setSelectedProfileId(def ? def.id : safeProfiles[0]?.id ?? null);
      } catch (error) {
        handleError({ error, title: 'Failed to load filters' });
      } finally {
        setIsLoading(false);
      }
    };
    asyncLoad();
  }, []);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;

  const reloadProfiles = async (): Promise<AiFilterProfile[]> => {
    const next = await listFilterProfiles();
    setProfiles(next);
    return next;
  };

  // ----- Global blacklist handlers -----
  const onGlobalBlacklistChange = async (next: string[]) => {
    const prev = globalBlacklist;
    setGlobalBlacklist(next);
    try {
      const updated = await updateGlobalBlacklist(next);
      setGlobalBlacklist(updated);
    } catch (error) {
      setGlobalBlacklist(prev);
      handleError({ error, title: 'Failed to update global blacklist' });
    }
  };

  // ----- Profile handlers -----
  const nextUniqueProfileName = (existing: AiFilterProfile[]): string => {
    const base = 'New Profile';
    const taken = new Set(existing.map((p) => p.name.trim()));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base} ${i}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${base} ${Date.now()}`;
  };

  const onCreateProfile = async () => {
    try {
      const created = await createFilterProfile({ name: nextUniqueProfileName(profiles) });
      const next = await reloadProfiles();
      const found = next.find((p) => p.id === created.id) ?? created;
      setSelectedProfileId(found.id);
      toast({ title: 'Profile created' });

      if (!hasCreatedProfile && profile.subscription_tier !== 'pro') {
        setSubscriptionDialogOpen(true);
      }
      setHasCreatedProfile(true);
    } catch (error) {
      handleError({ error, title: 'Failed to create profile' });
    }
  };

  const onCommitProfileField = async (
    id: number,
    patch: Partial<Pick<AiFilterProfile, 'name' | 'chatgpt_prompt' | 'blacklisted_companies'>>,
  ) => {
    try {
      const updated = await updateFilterProfile(id, patch);
      setProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (error) {
      handleError({ error, title: 'Failed to update profile' });
    }
  };

  const onSetDefault = async (id: number) => {
    try {
      await setDefaultFilterProfile(id);
      await reloadProfiles();
      toast({ title: 'Default profile updated' });
    } catch (error) {
      handleError({ error, title: 'Failed to set default profile' });
    }
  };

  const onConfirmDelete = async () => {
    if (pendingDeleteId == null) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      await deleteFilterProfile(id);
      const next = await reloadProfiles();
      if (selectedProfileId === id) {
        setSelectedProfileId(next[0]?.id ?? null);
      }
      toast({ title: 'Profile deleted' });
    } catch (error) {
      handleError({ error, title: 'Failed to delete profile' });
    }
  };

  /**
   * Handle plan selection from a trial customer.
   */
  const onSelectPlan = async ({ tier, billingCycle }: { tier: SubscriptionTier; billingCycle: string }) => {
    try {
      if (!profile.is_trial) {
        await openExternalUrl(stripeConfig.customerPortalLink);
      } else {
        const stripePlan = stripeConfig.plans.find((p) => p.tier === tier);
        if (!stripePlan) {
          console.error(`Stripe plan not found for ${tier}`);
          return;
        }
        const checkoutLink = stripePlan[`${billingCycle}CheckoutLink` as keyof StripeBillingPlan];
        if (!checkoutLink) {
          console.error(`Checkout link not found for ${billingCycle}`);
          return;
        }
        await openExternalUrl(checkoutLink);
      }
    } catch (error) {
      handleError({ error, title: 'Failed to upgrade to PRO plan' });
    }
  };

  const onCloseSubscriptionDialog = async () => {
    try {
      await refreshProfile();
      setSubscriptionDialogOpen(false);
    } catch (error) {
      handleError({ error, title: 'Failed to close subscription dialog' });
    }
  };

  if (isLoading) {
    return (
      <DefaultLayout className="flex flex-col p-6 md:p-10">
        <FiltersSkeleton />
      </DefaultLayout>
    );
  }

  return (
    <DefaultLayout className="flex flex-col space-y-12 p-6 md:p-10">
      <h1 className="w-fit text-2xl font-medium tracking-wide">Advanced Matching</h1>

      {/* Section A — Global Blacklist */}
      <section>
        <h2 className="mb-2 text-xl font-medium">Global Blacklist</h2>
        <p className="mb-4 text-base text-muted-foreground">
          <span className="font-medium text-foreground">Never see jobs</span> from these companies, regardless of which
          profile a search uses.
        </p>

        <BlacklistEditor
          companies={globalBlacklist}
          onChange={onGlobalBlacklistChange}
          placeholder="E.g. Luxoft"
          emptyText="You haven't blacklisted any companies yet"
        />
      </section>

      <Separator />

      {/* Section B — Filter Profiles */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-xl font-medium">Filter Profiles</h2>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-help items-center">
                  <InfoCircledIcon className="h-4 w-4 text-muted-foreground" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-sm">
                Searches with no profile selected fall back to your default profile. If no default is set, AI filtering
                is skipped for those searches.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex min-h-[480px] gap-6 rounded-md border border-border bg-card/30">
          {/* Left rail */}
          <aside className="flex w-[280px] shrink-0 flex-col border-r border-border">
            <div className="flex items-center justify-between p-4">
              <span className="text-sm font-medium">Profiles</span>
              <Button size="sm" variant="secondary" onClick={onCreateProfile}>
                <PlusIcon className="mr-1 h-4 w-4" />
                New
              </Button>
            </div>
            <Separator />
            <div className="flex-1 overflow-y-auto p-2">
              {profiles.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No profiles yet. Create one to get started.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {profiles.map((p) => {
                    const isSelected = p.id === selectedProfileId;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedProfileId(p.id)}
                          className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                            isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                          }`}
                        >
                          <span className="truncate">{p.name || '(untitled)'}</span>
                          {p.is_default && (
                            <Badge variant="secondary" className="shrink-0 text-xs">
                              Default
                            </Badge>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Right pane */}
          <div className="flex-1 p-6">
            {!selectedProfile ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">Select a profile to edit or create a new one.</p>
              </div>
            ) : (
              <ProfileEditor
                key={selectedProfile.id}
                profile={selectedProfile}
                onCommitField={(patch) => onCommitProfileField(selectedProfile.id, patch)}
                onSetDefault={() => onSetDefault(selectedProfile.id)}
                onRequestDelete={() => setPendingDeleteId(selectedProfile.id)}
              />
            )}
          </div>
        </div>
      </section>

      {/* Delete confirm */}
      <AlertDialog
        open={pendingDeleteId != null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete profile</AlertDialogTitle>
            <AlertDialogDescription>
              Delete profile{' '}
              <span className="font-medium">
                '{profiles.find((p) => p.id === pendingDeleteId)?.name ?? ''}'
              </span>
              ? Searches using it will become unassigned.
              {profiles.find((p) => p.id === pendingDeleteId)?.is_default && (
                <span className="mt-2 block font-medium text-destructive">
                  This is your default profile. Searches that fell back to it will stop being AI-filtered until you
                  set a new default.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SubscriptionDialog
        isOpen={isSubscriptionDialogOpen}
        onCancel={() => onCloseSubscriptionDialog()}
        onSelectPlan={onSelectPlan}
      />
    </DefaultLayout>
  );
}

// ---------------------------------------------------------------------------
// Profile editor (right pane)
// ---------------------------------------------------------------------------

function ProfileEditor({
  profile,
  onCommitField,
  onSetDefault,
  onRequestDelete,
}: {
  profile: AiFilterProfile;
  onCommitField: (
    patch: Partial<Pick<AiFilterProfile, 'name' | 'chatgpt_prompt' | 'blacklisted_companies'>>,
  ) => Promise<void>;
  onSetDefault: () => Promise<void>;
  onRequestDelete: () => void;
}) {
  const [name, setName] = useState(profile.name ?? '');
  const [prompt, setPrompt] = useState(profile.chatgpt_prompt ?? '');

  // When selected profile changes (parent passes `key={id}`), hooks reset — so these stay in sync.

  const commitNameIfChanged = () => {
    if (name !== profile.name) {
      void onCommitField({ name });
    }
  };

  const commitPromptIfChanged = () => {
    if (prompt !== profile.chatgpt_prompt) {
      void onCommitField({ chatgpt_prompt: prompt });
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Name</label>
        <Input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitNameIfChanged}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitNameIfChanged();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="bg-card"
        />
      </div>

      {/* Prompt */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Prompt</label>
        <div className="relative">
          <TextareaAutosize
            value={prompt}
            placeholder='E.g. "Avoid Java or senior roles", "Seeking $60K+ salary, remote opportunities", "Suitable for under 2 years of experience"'
            onChange={(evt) => setPrompt(evt.target.value)}
            onBlur={commitPromptIfChanged}
            minRows={4}
            maxLength={5000}
            className="w-full resize-none rounded-md border border-border bg-card px-6 py-4 text-base ring-ring placeholder:text-muted-foreground focus:outline-none focus:ring-2"
          />
          <span className="absolute bottom-4 right-4 text-sm text-muted-foreground">{prompt.length}/5000</span>
        </div>

        <Alert className="mt-1.5 flex items-center gap-2 border-0 p-0">
          <AlertTitle className="mb-0">
            <InfoCircledIcon className="h-4 w-4 text-muted-foreground" />
          </AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            Pro Tips: Exclude skills you don't want, specify salary expectations, define experience levels, select job
            specifics like remote work or PTO preferences and more.
          </AlertDescription>
        </Alert>
      </div>

      {/* Per-profile blacklist */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Blacklist (profile-only)</label>
        <p className="mb-3 text-sm text-muted-foreground">
          Jobs from these companies are excluded only for searches using this profile.
        </p>
        <BlacklistEditor
          companies={profile.blacklisted_companies ?? []}
          onChange={(next) => onCommitField({ blacklisted_companies: next })}
          placeholder="E.g. Luxoft"
          emptyText="No companies blacklisted for this profile yet"
        />
      </div>

      <div className="mt-auto" />

      {/* Footer row */}
      <div className="flex items-center justify-between pt-4">
        <div>
          {profile.is_default ? (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <CheckIcon className="h-4 w-4" />
              Default
            </span>
          ) : (
            <Button variant="secondary" onClick={onSetDefault}>
              Set as default
            </Button>
          )}
        </div>
        <Button variant="destructive" onClick={onRequestDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blacklist editor (shared: global + per-profile)
// ---------------------------------------------------------------------------

function BlacklistEditor({
  companies,
  onChange,
  placeholder,
  emptyText,
}: {
  companies: string[];
  onChange: (next: string[]) => void | Promise<void>;
  placeholder: string;
  emptyText: string;
}) {
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (companies.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...companies, trimmed]);
    setDraft('');
  };

  const remove = (company: string) => {
    onChange(companies.filter((c) => c !== company));
  };

  return (
    <>
      <div className="flex w-full gap-2">
        <div className="relative flex-1">
          <Input
            value={draft}
            placeholder={placeholder}
            onChange={(evt) => setDraft(evt.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            maxLength={100}
            className="bg-card px-6 pr-20 text-base ring-ring placeholder:text-base focus-visible:ring-2"
          />
          <span className="absolute bottom-2 right-4 text-sm text-muted-foreground">{draft.length}/100</span>
        </div>

        <Button variant="secondary" className="w-36 border border-border" onClick={add}>
          Add company
        </Button>
      </div>

      <Alert className="mt-1.5 flex items-center gap-2 border-0 p-0">
        <AlertTitle className="mb-0">
          <MinusCircledIcon className="h-4 w-4 text-destructive/90" />
        </AlertTitle>
        <AlertDescription className="text-sm text-destructive/90">
          Attention: Ensure you input the company name accurately without any typos.
        </AlertDescription>
      </Alert>

      <div className="mt-4">
        {companies.length === 0 ? (
          <p>{emptyText}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(showAll ? companies : companies.slice(0, 10)).map((company) => (
              <Badge
                key={company}
                className="flex items-center gap-2 border border-border bg-card py-1 pl-4 pr-2 text-base hover:bg-card"
              >
                {company}
                <TooltipProvider delayDuration={500}>
                  <Tooltip>
                    <TooltipTrigger>
                      <Cross2Icon className="h-4 w-4 text-foreground" onClick={() => remove(company)} />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="mt-2 text-sm">
                      Remove
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Badge>
            ))}
            {companies.length > 10 && !showAll && (
              <Button variant="secondary" className="py-2" onClick={() => setShowAll(true)}>
                See All
              </Button>
            )}
            {showAll && companies.length > 10 && (
              <Button variant="secondary" className="py-2" onClick={() => setShowAll(false)}>
                Show Less
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Subscription dialog (unchanged from prior implementation)
// ---------------------------------------------------------------------------

function SubscriptionDialog({
  isOpen,
  onCancel,
  onSelectPlan,
}: {
  isOpen: boolean;
  onCancel: () => void;
  onSelectPlan: (_: { tier: SubscriptionTier; billingCycle: string }) => Promise<void>;
}) {
  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent className="max-h-screen max-w-[80%] overflow-y-scroll">
        <AlertDialogHeader>
          <AlertDialogTitle className="mb-5 text-center text-2xl">
            Advanced matching is only available with a <b>PRO</b> plan
            <Cross2Icon className="absolute right-4 top-4 h-6 w-6 cursor-pointer" onClick={onCancel} />
          </AlertDialogTitle>
          <AlertDialogDescription className="">
            <PricingOptions onSelectPlan={onSelectPlan} disableBasic={true}></PricingOptions>
          </AlertDialogDescription>
          <AlertDialogDescription className="flex items-center"></AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  );
}
