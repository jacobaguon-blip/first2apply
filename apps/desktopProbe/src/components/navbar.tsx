import {
  ChatBubbleIcon,
  Crosshair2Icon,
  FileTextIcon,
  GearIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  QuestionMarkCircledIcon,
  SunIcon,
} from '@radix-ui/react-icons';
import { RefreshCw } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { Icons } from '@/components/icons';
import { useAppState } from '@/hooks/appState';
import { useCareerOps } from '@/hooks/careerOps';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@first2apply/ui';
import { useTheme } from 'next-themes';

export function Navbar() {
  // Hook to get the current location
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { isScanning, newUpdate, lastScanAt } = useAppState();
  const { enabled: careerOpsEnabled } = useCareerOps();

  // Human-readable "X ago" for the last completed scan. Recomputed on every
  // appState poll (~every 2s) so the label updates without a separate ticker.
  // Tightly bounded set of strings — keeps the sidebar visually stable.
  const lastScanLabel = (() => {
    if (!lastScanAt) return null;
    const diffMs = Date.now() - new Date(lastScanAt).getTime();
    if (diffMs < 0) return 'just now';
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  })();

  const hasUpdate = !!newUpdate;

  const navItems = [
    { name: 'Jobs', path: '/', icon: <HomeIcon className="h-7 w-7" /> },
    {
      name: 'Searches',
      path: '/links',
      icon: <MagnifyingGlassIcon className="h-7 w-7" />,
    },
    {
      name: 'AI Filters',
      path: '/filters',
      icon: <Crosshair2Icon className="h-7 w-7" />,
    },
    {
      name: 'Master Content',
      path: '/master-content',
      icon: <FileTextIcon className="h-7 w-7" />,
    },
    ...(careerOpsEnabled
      ? [
          {
            name: 'My CV',
            path: '/my-cv',
            icon: <FileTextIcon className="h-7 w-7" />,
          },
        ]
      : []),
    {
      name: 'Feedback',
      path: '/feedback',
      icon: <ChatBubbleIcon className="h-7 w-7" />,
    },
    {
      name: 'Settings',
      path: '/settings',

      icon: (
        <div className="relative">
          <GearIcon className="h-7 w-7" />
          {hasUpdate && <div className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-destructive"></div>}
        </div>
      ),
    },
    {
      name: 'Help',
      path: '/help',
      icon: <QuestionMarkCircledIcon className="h-7 w-7" />,
    },
  ];

  const Logo = () =>
    isScanning ? <RefreshCw className="h-7 w-7 animate-spin" /> : <Icons.logo className="h-7 w-7"></Icons.logo>;

  return (
    <nav className="fixed z-50 flex h-screen w-16 flex-col items-center justify-between border-r border-muted-foreground/20 py-6 md:p-10 2xl:w-56 2xl:items-start">
      <div className="flex flex-col items-center gap-6 2xl:items-start">
        <div className="mb-16 flex flex-col gap-2 md:mb-20">
          <Link to={isScanning ? '/links' : '/'}>
            <TooltipProvider delayDuration={500}>
              <Tooltip>
                <TooltipTrigger className="flex gap-3">
                  <Logo />
                  <span className="hidden text-lg 2xl:inline-block">{isScanning ? 'Scanning ...' : 'First 2 Apply'}</span>
                </TooltipTrigger>

                <TooltipContent side="right" className="text-base 2xl:hidden">
                  {isScanning
                    ? 'Scanning for new jobs ...'
                    : lastScanLabel
                      ? `First 2 Apply · Last scan ${lastScanLabel}`
                      : 'First 2 Apply'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Link>
          {/* Wide-layout (2xl) sidebar shows the "last scan" line under the logo.
              Narrow layout exposes the same info via the logo tooltip above. */}
          {lastScanLabel && (
            <span className="hidden whitespace-nowrap text-xs text-muted-foreground 2xl:inline-block">
              Last scan: {lastScanLabel}
            </span>
          )}
        </div>

        {navItems.map((item) => (
          <TooltipProvider delayDuration={500} key={item.name}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  key={item.name}
                  to={item.path}
                  className={`after:transition-width relative flex items-center gap-3 p-1 duration-200 after:absolute after:bottom-0 after:right-0 after:block after:h-0.5 after:w-0 after:bg-primary after:transition-all after:content-[''] hover:text-primary hover:after:w-full ${
                    location.pathname === item.path && 'text-primary'
                  }`}
                >
                  {item.icon}
                  <span className="hidden text-lg 2xl:inline-block">{item.name}</span>
                </Link>
              </TooltipTrigger>

              <TooltipContent side="right" className="text-base 2xl:hidden">
                {item.name}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      {/* theme toggle */}
      <TooltipProvider delayDuration={500}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <SunIcon className="h-7 w-7" /> : <MoonIcon className="h-7 w-7" />}
              <span className="hidden text-lg 2xl:inline-block">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </Button>
          </TooltipTrigger>

          <TooltipContent side="right" className="text-base 2xl:hidden">
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </nav>
  );
}
