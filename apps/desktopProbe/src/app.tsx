import { ComponentType, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Route,
  RouterProvider,
  createMemoryRouter,
  createRoutesFromElements,
  useRouteError,
  isRouteErrorResponse,
  useNavigate,
} from 'react-router-dom';

import { SdkProvider, Toaster, Button } from '@first2apply/ui';
import { LinksProvider } from '@first2apply/ui';
import { SitesProvider } from '@first2apply/ui';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';

import { withAuthGuard } from './components/authGuard';
import { ThemeProvider } from './components/themeProvider';
import { AppStateProvider } from './hooks/appState';
import { SessionProvider } from './hooks/session';
import { SettingsProvider } from './hooks/settings';
import { electronApiSdk } from './lib/electronMainSdk';
import { FeedbackPage } from './pages/feedback';
import { FiltersPage } from './pages/filters';
import { ForgotPasswordPage } from './pages/forgotPassword';
import { HelpPage } from './pages/help';
import { Home } from './pages/home';
import { LinksPage } from './pages/links';
import { LoginPage } from './pages/login';
import { MasterContentPage } from './pages/master-content';
import { MyCvPage } from './pages/myCv';
import { ResetPasswordPage } from './pages/resetPassword';
import { SettingsPage } from './pages/settings';
import { SignupPage } from './pages/signup';
import { SubscriptionPage } from './pages/subscription';

TimeAgo.addDefaultLocale(en);

function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = 'Something went wrong';
  let message = 'An unexpected error occurred.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} — ${error.statusText}`;
    message = error.data?.toString() || message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-muted-foreground">{message}</p>
        <Button onClick={() => navigate('/')}>Go Home</Button>
      </div>
    </div>
  );
}

function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
        <p className="text-muted-foreground">The page you are looking for does not exist.</p>
        <Button onClick={() => navigate('/')}>Go Home</Button>
      </div>
    </div>
  );
}

// Auth guarded component wrapper
function AuthGuardedComponent({ component }: { component: ComponentType }) {
  const Component = withAuthGuard(component);
  return <Component />;
}

const router = createMemoryRouter(
  createRoutesFromElements(
    <Route errorElement={<RouteErrorBoundary />}>
      <Route path="/" element={<AuthGuardedComponent component={Home} />} />
      <Route path="/links" element={<AuthGuardedComponent component={LinksPage} />} />
      <Route path="/filters" element={<AuthGuardedComponent component={FiltersPage} />} />
      <Route path="/master-content" element={<AuthGuardedComponent component={MasterContentPage} />} />
      <Route path="/my-cv" element={<AuthGuardedComponent component={MyCvPage} />} />
      <Route path="/settings" element={<AuthGuardedComponent component={SettingsPage} />} />
      <Route path="/help" element={<AuthGuardedComponent component={HelpPage} />} />
      <Route path="/feedback" element={<AuthGuardedComponent component={FeedbackPage} />} />
      <Route path="/subscription" element={<AuthGuardedComponent component={SubscriptionPage} />} />

      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="*" element={<NotFoundPage />} />
    </Route>,
  ),
  { initialEntries: ['/'] },
);

/**
 * Main app component.
 */
function App() {
  // subscribe to navigation events
  useEffect(() => {
    window.electron?.on('navigate', (_, { path }) => {
      // add a cache buster to the path to force a reload
      let pathWithRefresh = path;
      const separator = path.includes('?') ? '&' : '?';
      pathWithRefresh += `${separator}r=${Date.now().toString()}`;

      router.navigate(pathWithRefresh.toString(), {});
    });
  }, []);

  return (
    <>
      <SdkProvider sdk={electronApiSdk}>
        <AppStateProvider>
          <SessionProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme={window.electron?.theme || 'light'}
              // defaultTheme={"light"}
              disableTransitionOnChange
            >
              <SettingsProvider>
                <SitesProvider sites={[]}>
                  <LinksProvider links={[]}>
                    <RouterProvider router={router}></RouterProvider>
                  </LinksProvider>
                </SitesProvider>
              </SettingsProvider>
            </ThemeProvider>
          </SessionProvider>
        </AppStateProvider>
      </SdkProvider>

      <Toaster />
    </>
  );
}

// Render the app
const root = createRoot(document.body.querySelector('#app')!);
root.render(<App />);

declare global {
  interface Window {
    electron: {
      invoke: (channel: string, params?: object) => Promise<object>;
      on: (
        channel: string,
        callback: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void,
      ) => Electron.IpcRenderer;
      theme: string;
    };
  }
}
