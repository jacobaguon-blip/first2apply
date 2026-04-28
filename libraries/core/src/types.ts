export enum SiteProvider {
  linkedin = 'linkedin',
  glassdoor = 'glassdoor',
  indeed = 'indeed',
  remoteok = 'remoteok',
  weworkremotely = 'weworkremotely',
  dice = 'dice',
  flexjobs = 'flexjobs',
  bestjobs = 'bestjobs',
  echojobs = 'echojobs',
  remotive = 'remotive',
  remoteio = 'remoteio',
  builtin = 'builtin',
  naukri = 'naukri',
  robertHalf = 'robertHalf',
  zipRecruiter = 'zipRecruiter',
  usaJobs = 'usaJobs',
  talent = 'talent',

  // generic provider for sites not in the list above
  custom = 'custom',
}

export const JOB_LABELS = {
  CONSIDERING: 'Considering',
  SUBMITTED: 'Submitted',
  INTERVIEWING: 'Interviewing',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  GHOSTED: 'Ghosted',
} as const;

export type JobLabel = (typeof JOB_LABELS)[keyof typeof JOB_LABELS];

export type User = {
  id: string;
  email: string;
};

export type JobSite = {
  id: number;
  provider: SiteProvider;
  name: string;
  urls: string[];
  queryParamsToRemove?: string[];
  blacklisted_paths: string[];
  created_at: string;
  logo_url: string;
  deprecated: boolean;
  incognito_support: boolean;
};

export type LinkScanFrequency = 'hourly' | 'daily';

export type Link = {
  id: number;
  url: string;
  title: string;
  user_id: string;
  site_id: number;
  created_at: string;
  scrape_failure_count: number;
  last_scraped_at: string;
  scrape_failure_email_sent: boolean;
  scan_frequency: LinkScanFrequency;
  filter_profile_id: number | null;
};

export type JobType = 'remote' | 'hybrid' | 'onsite';
export type JobStatus = 'new' | 'applied' | 'archived' | 'deleted' | 'processing' | 'excluded_by_advanced_matching';
export type Job = {
  id: number;
  user_id: string;
  externalId: string;
  externalUrl: string;
  siteId: number;

  // main info
  title: string;
  companyName: string;
  companyLogo?: string;

  // metadata
  jobType?: JobType;
  location?: string;
  salary?: string;
  tags: string[];

  description?: string;

  status: JobStatus;
  labels: JobLabel[];

  created_at: Date;
  updated_at: Date;

  link_id?: number;

  exclude_reason?: string;
};

export type Review = {
  id: number;
  user_id: string;
  title: string;
  description?: string;
  rating: number;
  created_at: Date;
};
export type HtmlDump = {
  id: number;
  user_id: string;
  url: string;
  html: string;
  created_at: Date;
  webpage_runtime_data?: WebPageRuntimeData;
};
export type Note = {
  id: number;
  created_at: Date;
  user_id: string;
  job_id: number;
  text: string;
  files: string[];
};

export type SubscriptionTier = 'basic' | 'pro';
export type Profile = {
  id: number;
  user_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  subscription_end_date: string;
  subscription_tier: SubscriptionTier;
  is_trial: boolean;
};

export type StripeBillingPlan = {
  tier: SubscriptionTier;
  monthlyCheckoutLink: string;
  quarterlyCheckoutLink: string;
  biannuallyCheckoutLink: string;
  yearlyCheckoutLink: string;
};

export type StripeConfig = {
  customerPortalLink: string;
  plans: StripeBillingPlan[];
};

export type AdvancedMatchingConfig = {
  id: number;
  user_id: string;
  blacklisted_companies: string[];
  ai_api_cost: number;
  ai_api_input_tokens_used: number;
  ai_api_output_tokens_used: number;
};

export interface AiFilterProfile {
  id: number;
  created_at: string;
  user_id: string;
  name: string;
  chatgpt_prompt: string;
  blacklisted_companies: string[];
  is_default: boolean;
}

export type QuietHoursWindow = { start: string; end: string };
export type QuietHoursDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';
export type QuietHoursSchedule = Partial<Record<QuietHoursDay, QuietHoursWindow>>;

export type UserSettings = {
  user_id: string;
  quiet_hours_enabled: boolean;
  quiet_hours_timezone: string;
  quiet_hours_schedule: QuietHoursSchedule;
  quiet_hours_grace_minutes: number;
  pushover_owner_device_id: string | null;
  last_summary_sent_at: string | null;
  updated_at: string;
};

export type UserSettingsUpsert = Partial<
  Pick<
    UserSettings,
    | 'quiet_hours_enabled'
    | 'quiet_hours_timezone'
    | 'quiet_hours_schedule'
    | 'quiet_hours_grace_minutes'
    | 'pushover_owner_device_id'
  >
> & { user_id?: string };

export type WebPageRuntimeData = Partial<Record<SiteProvider, ProviderRuntimeData>>;
export type LinkedinRuntimeData = {
  type: SiteProvider.linkedin;
  comoRehydration: string;
};

export type ProviderRuntimeData = LinkedinRuntimeData;

export type MasterContentSection = 'resume' | 'cover_letter';

export type AccountMasterResumeRow = {
  account_id: string;
  content_jsonb: unknown;
  uploaded_filename: string | null;
  uploaded_at: string;
  updated_at: string;
};

export type AccountMasterCoverLetterRow = AccountMasterResumeRow;

export type AccountRow = {
  id: string;
  name: string;
  created_at: string;
  owner_user_id: string;
};

export type AccountMemberRow = {
  account_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  added_at: string;
};

/**
 * Supabase database schema.
 */
export type DbSchema = {
  public: {
    Tables: {
      sites: {
        Row: JobSite;
        Insert: Pick<JobSite, 'name' | 'urls'>;
        Update: {};
        Relationships: [];
      };
      links: {
        Row: Link;
        Insert: Pick<Link, 'url' | 'title' | 'site_id'> &
          Partial<Pick<Link, 'scan_frequency' | 'filter_profile_id'>>;
        Update: {
          title?: string;
          url?: string;
          scrape_failure_count?: number;
          last_scraped_at?: Date;
          scrape_failure_email_sent?: boolean;
          scan_frequency?: LinkScanFrequency;
          filter_profile_id?: number | null;
        };
        Relationships: [];
      };
      jobs: {
        Row: Job;
        Insert: Pick<
          Job,
          | 'siteId'
          | 'externalId'
          | 'externalUrl'
          | 'title'
          | 'companyName'
          | 'companyLogo'
          | 'location'
          | 'salary'
          | 'tags'
          | 'jobType'
          | 'status'
          | 'link_id'
        >;
        Update: Pick<Job, 'status'> | Pick<Job, 'description'> | Pick<Job, 'labels'>;
        Relationships: [];
      };
      reviews: {
        Row: Review;
        Insert: Pick<Review, 'title' | 'description' | 'rating'>;
        Update: Pick<Review, 'title' | 'description' | 'rating'>;
        Relationships: [];
      };
      html_dumps: {
        Row: HtmlDump;
        Insert: Pick<HtmlDump, 'url' | 'html' | 'webpage_runtime_data'>;
        Update: {};
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: never;
        Update: Pick<
          Profile,
          'stripe_customer_id' | 'stripe_subscription_id' | 'subscription_end_date' | 'subscription_tier' | 'is_trial'
        >;
        Relationships: [];
      };
      notes: {
        Row: Note;
        Insert: Pick<Note, 'job_id' | 'text' | 'files'>;
        Update: Partial<Pick<Note, 'text' | 'files'>>;
        Relationships: [];
      };
      advanced_matching: {
        Row: AdvancedMatchingConfig;
        Insert: Pick<AdvancedMatchingConfig, 'blacklisted_companies'>;
        Update: Partial<Pick<AdvancedMatchingConfig, 'blacklisted_companies'>>;
        Relationships: [];
      };
      ai_filter_profiles: {
        Row: AiFilterProfile;
        Insert: { name: string } & Partial<
          Pick<
            AiFilterProfile,
            'id' | 'created_at' | 'user_id' | 'chatgpt_prompt' | 'blacklisted_companies' | 'is_default'
          >
        >;
        Update: Partial<AiFilterProfile>;
        Relationships: [];
      };
      user_settings: {
        Row: UserSettings;
        Insert: UserSettingsUpsert;
        Update: UserSettingsUpsert;
        Relationships: [];
      };
      accounts: {
        Row: AccountRow;
        Insert: Pick<AccountRow, 'name' | 'owner_user_id'>;
        Update: {};
        Relationships: [];
      };
      account_members: {
        Row: AccountMemberRow;
        Insert: AccountMemberRow;
        Update: {};
        Relationships: [];
      };
      account_master_resume: {
        Row: AccountMasterResumeRow;
        Insert: Pick<AccountMasterResumeRow, 'account_id' | 'content_jsonb'> &
          Partial<Pick<AccountMasterResumeRow, 'uploaded_filename'>>;
        Update: Partial<Pick<AccountMasterResumeRow, 'content_jsonb' | 'uploaded_filename'>>;
        Relationships: [];
      };
      account_master_cover_letter: {
        Row: AccountMasterCoverLetterRow;
        Insert: Pick<AccountMasterCoverLetterRow, 'account_id' | 'content_jsonb'> &
          Partial<Pick<AccountMasterCoverLetterRow, 'uploaded_filename'>>;
        Update: Partial<Pick<AccountMasterCoverLetterRow, 'content_jsonb' | 'uploaded_filename'>>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      list_jobs: {
        Args: {
          jobs_status: JobStatus;
          jobs_after: number | null;
          jobs_page_size: number;
          jobs_search?: string;
          jobs_site_ids?: number[];
          jobs_link_ids?: number[];
        };
        Returns: Job[];
      };
      count_jobs: {
        Args: {
          jobs_status?: JobStatus;
          jobs_search?: string;
          jobs_site_ids?: number[];
          jobs_link_ids?: number[];
        };
        Returns: Array<{
          status: JobStatus;
          job_count: number;
        }>;
      };
      get_user_id_by_email: {
        Args: { email: string };
        Returns: { id: string };
      };
      claim_summary_send: {
        Params: {
          p_user_id: string;
          p_window_end: string;
        };
        Args: {};
        Returns: number;
      };
      count_chatgpt_usage: {
        Args: {
          for_user_id: string;
          cost_increment: number;
          input_tokens_increment: number;
          output_tokens_increment: number;
        };
        Returns: {};
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
};
