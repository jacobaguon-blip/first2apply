import {
  AiFilterProfile,
  DbSchema,
  Job,
  JobLabel,
  JobStatus,
  Link,
  UserSettings,
  UserSettingsUpsert,
  WebPageRuntimeData,
} from "@first2apply/core"
import {
  FunctionsHttpError,
  PostgrestError,
  AuthError,
  SupabaseClient,
  User,
} from "@supabase/supabase-js"
import { backOff } from "exponential-backoff"
import * as luxon from "luxon"

/**
 * Class used to interact with our Supabase API.
 */
export class F2aSupabaseApi {
  constructor(private _supabase: SupabaseClient<DbSchema>) {}

  /**
   * Underlying supabase client. Exposed for callers that need to invoke
   * RPCs or table operations not yet wrapped by this class
   * (e.g. dispatchPushoverSummary in apps/desktopProbe/.../notifications).
   */
  getSupabaseClient(): SupabaseClient<DbSchema> {
    return this._supabase
  }

  /**
   * Create a new user account using an email and password.
   */
  async signupWithEmail({
    email,
    password,
  }: {
    email: string
    password: string
  }) {
    const { error, data } = await this._supabase.auth.signUp({
      email,
      password,
    })
    if (error) throw error
    return data
  }

  /**
   * Login using an email and password.
   */
  async loginWithEmail({
    email,
    password,
  }: {
    email: string
    password: string
  }) {
    return this._supabaseApiCall(() =>
      // @ts-expect-error wrong typings, but works
      this._supabase.auth.signInWithPassword({ email, password })
    )
  }

  /**
   * Send a password reset email.
   */
  sendPasswordResetEmail({ email }: { email: string }) {
    return this._supabaseApiCall(() =>
      this._supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "first2apply://reset-password",
      })
    )
  }

  /**
   * Update the password for the current user.
   */
  updatePassword({ password }: { password: string }) {
    return this._supabaseApiCall(() =>
      // @ts-expect-error wrong typings, but works
      this._supabase.auth.updateUser({ password })
    )
  }

  /**
   * Logout the current user.
   */
  async logout() {
    const { error } = await this._supabase.auth.signOut()
    if (error) throw error
  }

  /**
   * Get the user from the current supabase session
   */
  getUser(): Promise<{ user: User | null }> {
    return this._supabaseApiCall(
      // @ts-expect-error wrong typings, but works
      async () => await this._supabase.auth.getUser()
    ).catch(() => ({
      user: null as User | null,
    }))
  }

  /**
   * Create a new link.
   */
  async createLink({
    title,
    url,
    html,
    webPageRuntimeData,
    force,
    scanFrequency,
    filter_profile_id,
  }: {
    title: string
    url: string
    html: string
    webPageRuntimeData: WebPageRuntimeData
    force: boolean
    scanFrequency?: "hourly" | "daily"
    filter_profile_id?: number | null
  }) {
    // for debugging, use a test.html file
    // const htmlFixture = fs.readFileSync(path.join(__dirname, '../../../test.html'), 'utf-8');
    // html = htmlFixture;

    const body: Record<string, unknown> = {
      title,
      url,
      html,
      webPageRuntimeData,
      force,
      scanFrequency,
    }
    if (filter_profile_id !== undefined) {
      body.filter_profile_id = filter_profile_id
    }

    const { link, newJobs } = await this._supabaseApiCall(() =>
      this._supabase.functions.invoke<{ link: Link; newJobs: Job[] }>(
        "create-link",
        { body }
      )
    )

    return { link, newJobs }
  }

  /**
   * Update an existing link.
   */
  async updateLink({
    linkId,
    title,
    url,
    ...rest
  }: {
    linkId: number
    title?: string
    url?: string
    filter_profile_id?: number | null
  }): Promise<Link> {
    const payload: Record<string, unknown> = {}
    if (title !== undefined) payload.title = title
    if (url !== undefined) payload.url = url
    if ("filter_profile_id" in rest) {
      payload.filter_profile_id = rest.filter_profile_id
    }

    const updatedLink = await this._supabaseApiCall(async () =>
      this._supabase
        .from("links")
        .update(payload)
        .eq("id", linkId)
        .select("*")
        .single()
    )

    return updatedLink as unknown as Link
  }

  /**
   * Get all registered links for the current user.
   */
  listLinks(): Promise<Link[]> {
    return this._supabaseApiCall(async () =>
      this._supabase.from("links").select("*").order("id", { ascending: false })
    )
  }

  /**
   * Delete a link.
   */
  deleteLink(linkId: number) {
    return this._supabaseApiCall(async () =>
      this._supabase.from("links").delete().eq("id", linkId)
    )
  }

  /**
   * Scan a list of htmls for new jobs.
   */
  scanHtmls(
    htmls: {
      linkId: number
      content: string
      webPageRuntimeData: WebPageRuntimeData
      maxRetries: number
      retryCount: number
    }[]
  ) {
    return this._supabaseApiCall(() =>
      this._supabase.functions.invoke<{
        newJobs: Job[]
        parseFailed: boolean
        parseErrors?: Array<{ linkId: number; message: string }>
      }>("scan-urls", {
        body: {
          htmls,
        },
      })
    )
  }

  /**
   * Scan HTML for a job description.
   */
  scanJobDescription({
    jobId,
    html,
    maxRetries,
    retryCount,
  }: {
    jobId: number
    html: string
    maxRetries: number
    retryCount: number
  }) {
    return this._supabaseApiCall(() =>
      this._supabase.functions.invoke<{ job: Job; parseFailed: boolean }>(
        "scan-job-description",
        {
          body: {
            jobId,
            html,
            maxRetries,
            retryCount,
          },
        }
      )
    )
  }

  /**
   * Run the post scan hook edge function.
   */
  runPostScanHook({
    newJobIds,
    areEmailAlertsEnabled,
  }: {
    newJobIds: number[]
    areEmailAlertsEnabled: boolean
  }) {
    return this._supabaseApiCall(() =>
      this._supabase.functions.invoke("post-scan-hook", {
        body: {
          newJobIds,
          areEmailAlertsEnabled,
        },
      })
    )
  }

  /**
   * List all jobs for the current user.
   */
  async listJobs({
    status,
    search,
    siteIds,
    linkIds,
    labels,
    limit = 50,
    after,
  }: {
    status: JobStatus
    search?: string
    siteIds?: number[]
    linkIds?: number[]
    labels?: string[]
    limit?: number
    after?: string
  }) {
    const jobs_search = search || undefined
    const jobs_site_ids = siteIds && siteIds.length > 0 ? siteIds : undefined
    const jobs_link_ids = linkIds && linkIds.length > 0 ? linkIds : undefined
    const jobs_labels = labels && labels.length > 0 ? labels : undefined
    const [jobs, counters] = await Promise.all([
      this._supabaseApiCall<Job[], PostgrestError>(async () => {
        const res = await this._supabase.rpc("list_jobs", {
          jobs_status: status,
          jobs_after: after ?? null,
          jobs_page_size: limit,
          jobs_search,
          jobs_site_ids,
          jobs_link_ids,
          jobs_labels,
        })

        return res
      }),
      this._supabaseApiCall<
        Array<{
          status: JobStatus
          job_count: number
        }>,
        PostgrestError
      >(async () => {
        const res = await this._supabase.rpc("count_jobs", {
          jobs_search,
          jobs_site_ids,
          jobs_link_ids,
          jobs_labels,
        })

        return res
      }),
    ])

    let nextPageToken: string | undefined
    if (jobs.length === limit) {
      // the next page token will include the last id as well as it's last updated_at
      const lastJob = jobs[jobs.length - 1]
      nextPageToken = `${lastJob.id}!${lastJob.updated_at}`
    }

    const countersMap = new Map(counters.map((c) => [c.status, c.job_count]))
    return {
      jobs,
      new: countersMap.get("new") ?? 0,
      archived: countersMap.get("archived") ?? 0,
      applied: countersMap.get("applied") ?? 0,
      filtered: countersMap.get("excluded_by_advanced_matching") ?? 0,
      nextPageToken,
    }
  }

  /**
   * Update the status of a job.
   */
  updateJobStatus({ jobId, status }: { jobId: number; status: JobStatus }) {
    return this._supabaseApiCall(
      async () =>
        await this._supabase
          .from("jobs")
          .update({
            status,
            updated_at: luxon.DateTime.now().toUTC().toJSDate(),
          })
          .eq("id", jobId)
    )
  }

  /**
   * Update the labels of a job.
   * @returns the updated job
   */
  async updateJobLabels({
    jobId,
    labels,
  }: {
    jobId: number
    labels: JobLabel[]
  }) {
    const [updatedJob] = await this._supabaseApiCall(
      async () =>
        await this._supabase
          .from("jobs")
          .update({
            labels,
          })
          .eq("id", jobId)
          .select("*")
    )

    return updatedJob
  }

  /**
   * List all sites.
   */
  listSites() {
    return this._supabaseApiCall(
      async () => await this._supabase.from("sites").select("*")
    )
  }

  /**
   * Get a job by id.
   */
  async getJob(jobId: number) {
    const [job] = await this._supabaseApiCall(async () =>
      this._supabase.from("jobs").select("*").eq("id", jobId)
    )
    return job
  }

  /**
   * Change the status of all jobs with a certain status to another status.
   */
  async changeAllJobStatus({ from, to }: { from: JobStatus; to: JobStatus }) {
    return this._supabaseApiCall(async () =>
      this._supabase
        .from("jobs")
        .update({
          status: to,
          updated_at: luxon.DateTime.now().toUTC().toJSDate(),
        })
        .eq("status", from)
    )
  }

  /**
   * Wrapper around a Supabase method that handles errors.
   */
  private async _supabaseApiCall<
    T,
    E extends Error | PostgrestError | FunctionsHttpError | AuthError,
  >(
    method: () => Promise<
      { data: T | null; error: null } | { data: null; error: E }
    >
  ) {
    const { data, error } = await backOff(
      async () => {
        const result = await method()

        return result
      },
      {
        numOfAttempts: 5,
        jitter: "full",
        startingDelay: 300,
      }
    )

    if (error) throw error

    // edge functions don't throw errors, instead they return an errorMessage field in the data object
    // work around for this issue https://github.com/supabase/functions-js/issues/45
    if (
      !!data &&
      typeof data === "object" &&
      "errorMessage" in data &&
      typeof data.errorMessage === "string"
    ) {
      throw new Error(data.errorMessage)
    }

    return data as T
  }

  /**
   * Create a user review.
   */
  async createReview({
    title,
    description,
    rating,
  }: {
    title: string
    description?: string
    rating: number
  }) {
    const [createdReview] = await this._supabaseApiCall(
      async () =>
        await this._supabase
          .from("reviews")
          .insert({
            title: title.trim(),
            description: description?.trim(),
            rating,
          })
          .select("*")
    )

    return createdReview
  }

  /**
   * Upsert master resume or cover letter content for the authenticated user's account.
   */
  async upsertMasterContent({
    kind,
    content,
    filename,
  }: {
    kind: 'resume' | 'cover_letter'
    content: unknown
    filename: string | null
  }) {
    const {
      data: { user },
    } = await this._supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: membership, error: memberErr } = await this._supabase
      .from('account_members')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (memberErr) throw memberErr
    if (!membership)
      throw new Error('No account found for user — run ensure_personal_account')

    const table =
      kind === 'resume' ? 'account_master_resume' : 'account_master_cover_letter'
    const row = {
      account_id: membership.account_id,
      content_jsonb: content,
      uploaded_filename: filename,
    }
    const { data, error } = await this._supabase
      .from(table)
      .upsert(row, { onConflict: 'account_id' })
      .select()
      .single()
    if (error) throw error
    return data
  }

  /**
   * Get master resume or cover letter content for the authenticated user's account.
   */
  async getMasterContent({ kind }: { kind: 'resume' | 'cover_letter' }) {
    const {
      data: { user },
    } = await this._supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: membership, error: memberErr } = await this._supabase
      .from('account_members')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (memberErr) throw memberErr
    if (!membership) return null

    const table =
      kind === 'resume' ? 'account_master_resume' : 'account_master_cover_letter'
    const { data, error } = await this._supabase
      .from(table)
      .select('content_jsonb, uploaded_filename, updated_at')
      .eq('account_id', membership.account_id)
      .maybeSingle()
    if (error) throw error
    return data
  }

  /**
   * Get user's review.
   */
  async getUserReview() {
    const [review] = await this._supabaseApiCall(
      async () => await this._supabase.from("reviews").select("*")
    )

    return review
  }

  /**
   * Update a user review.
   */
  async updateReview({
    id,
    title,
    description,
    rating,
  }: {
    id: number
    title: string
    description?: string
    rating: number
  }) {
    const [updatedReview] = await this._supabaseApiCall(
      async () =>
        await this._supabase
          .from("reviews")
          .update({
            title: title.trim(),
            description: description?.trim(),
            rating,
          })
          .eq("id", id)
          .select("*")
    )

    return updatedReview
  }

  /**
   * Get the profile of the current user.
   */
  async getProfile() {
    const [profile] = await this._supabaseApiCall(
      async () => await this._supabase.from("profiles").select("*")
    )

    return profile
  }

  /**
   * Create a new note for the current user.
   */
  async createNote({
    job_id,
    text,
    files,
  }: {
    job_id: number
    text: string
    files: string[]
  }) {
    const [createdNote] = await this._supabaseApiCall(
      async () =>
        await this._supabase
          .from("notes")
          .insert({ job_id, text, files })
          .select("*")
    )

    return createdNote
  }

  /**
   * Fetch all notes for the current user for a job.
   */
  async listNotes(job_id: number) {
    return this._supabaseApiCall(async () =>
      this._supabase
        .from("notes")
        .select("*")
        .eq("job_id", job_id)
        .order("created_at", { ascending: false })
    )
  }

  /**
   * Update an existing note by ID.
   */
  async updateNote({ noteId, text }: { noteId: number; text: string }) {
    return this._supabaseApiCall(async () =>
      this._supabase
        .from("notes")
        .update({ text })
        .eq("id", noteId)
        .select("*")
        .single()
    )
  }

  /**
   * Add a file to a note.
   */
  async addFileToNote({ noteId, file }: { noteId: number; file: string }) {
    const result = await this._supabase
      .from("notes")
      .select("files")
      .eq("id", noteId)
      .single()

    if (result.error) {
      throw result.error
    }

    const updatedFiles = result.data.files
      ? [...result.data.files, file]
      : [file]

    return this._supabaseApiCall(async () =>
      this._supabase
        .from("notes")
        .update({ files: updatedFiles })
        .eq("id", noteId)
        .single()
    )
  }

  /**
   * Delete a specific note by ID.
   */
  async deleteNote(noteId: number) {
    return this._supabaseApiCall(async () =>
      this._supabase.from("notes").delete().eq("id", noteId)
    )
  }

  /** List the user's AI filter profiles, ordered oldest-first. */
  async listFilterProfiles(): Promise<AiFilterProfile[]> {
    const data = await this._supabaseApiCall(
      async () =>
        await this._supabase
          .from("ai_filter_profiles")
          .select("*")
          .order("created_at", { ascending: true })
    )
    return data ?? []
  }

  /** Create a new filter profile. */
  async createFilterProfile(input: {
    name: string
    chatgpt_prompt?: string
    blacklisted_companies?: string[]
    is_default?: boolean
  }): Promise<AiFilterProfile> {
    const [row] = await this._supabaseApiCall(
      async () =>
        await this._supabase
          .from("ai_filter_profiles")
          .insert(input)
          .select("*")
    )
    return row
  }

  /** Update an existing filter profile. Does NOT toggle default — use setDefaultFilterProfile for that. */
  async updateFilterProfile(
    id: number,
    patch: Partial<
      Pick<AiFilterProfile, "name" | "chatgpt_prompt" | "blacklisted_companies">
    >
  ): Promise<AiFilterProfile> {
    const [row] = await this._supabaseApiCall(
      async () =>
        await this._supabase
          .from("ai_filter_profiles")
          .update(patch)
          .eq("id", id)
          .select("*")
    )
    return row
  }

  /** Mark a profile as the user's default, clearing any other default in the same transaction. */
  async setDefaultFilterProfile(id: number): Promise<void> {
    await this._supabaseApiCall(
      async () =>
        await this._supabase.rpc("set_default_filter_profile", { p_id: id })
    )
  }

  /** Delete a profile. Associated links.filter_profile_id is SET NULL by FK. */
  async deleteFilterProfile(id: number): Promise<void> {
    await this._supabaseApiCall(
      async () =>
        await this._supabase.from("ai_filter_profiles").delete().eq("id", id)
    )
  }

  /** Get the user's GLOBAL blacklist (stored on advanced_matching). Returns [] if no row exists yet. */
  async getGlobalBlacklist(): Promise<string[]> {
    const data = await this._supabaseApiCall(
      async () =>
        await this._supabase
          .from("advanced_matching")
          .select("blacklisted_companies")
    )
    return data?.[0]?.blacklisted_companies ?? []
  }

  /** Update the global blacklist. Upserts on user_id so the row is created if missing. */
  async updateGlobalBlacklist(companies: string[]): Promise<string[]> {
    const [row] = await this._supabaseApiCall(
      async () =>
        await this._supabase
          .from("advanced_matching")
          .upsert(
            { blacklisted_companies: companies },
            { onConflict: "user_id" }
          )
          .select("blacklisted_companies")
    )
    return row.blacklisted_companies
  }

  /**
   * Increase scrape failure count for a link.
   */
  async increaseScrapeFailureCount({
    linkId,
    failures,
  }: {
    linkId: number
    failures: number
  }) {
    await this._supabaseApiCall(async () =>
      this._supabase
        .from("links")
        .update({ scrape_failure_count: failures })
        .eq("id", linkId)
    )
  }

  /**
   * Fetch the current user's quiet-hours settings. Returns null if no row exists yet.
   */
  async getUserSettings(): Promise<UserSettings | null> {
    const { data, error } = await this._supabase
      .from("user_settings")
      .select("*")
      .maybeSingle()
    if (error) throw error
    return (data as UserSettings | null) ?? null
  }

  /**
   * Upsert the current user's quiet-hours settings. Caller does not need to
   * supply user_id — RLS scopes the row to auth.uid().
   */
  async upsertUserSettings(patch: UserSettingsUpsert): Promise<UserSettings> {
    const { data: userData, error: userErr } =
      await this._supabase.auth.getUser()
    if (userErr) throw userErr
    if (!userData.user) throw new Error("not authenticated")
    const row: UserSettingsUpsert = { ...patch, user_id: userData.user.id }
    const { data, error } = await this._supabase
      .from("user_settings")
      .upsert(row, { onConflict: "user_id" })
      .select("*")
      .single()
    if (error) throw error
    return data as UserSettings
  }
}
